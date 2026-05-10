import { Router, Request, Response, NextFunction } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const geoaiRouter = Router();

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY is not set — GeoAI endpoints will return 503");
}

const SURVEY_EXTRACTION_PROMPT = `
You are a geospatial data extraction specialist for Nigerian cadastral survey plans. Analyze this survey plan image and extract all spatial data.

NIGERIAN PLAN SPECIFICS:
- Corner points are labeled as SC/OS BBXXXXJP (Survey Control / Official Survey beacons)
- CRS is usually "Universal Zone 31" or "Universal Zone 32" = EPSG:26331 or EPSG:26332 (Minna UTM)
- Older plans use "Minna" datum with Clarke 1880 ellipsoid
- Grid reference lines on margins show Northing (mN) and Easting (mE) values
- Boundary lines show: bearing (e.g. 121° 46') and distance (e.g. 24.47m)
- W/F = Wire Fence boundary type
- If explicit point coordinates are NOT shown per beacon, extract the TRAVERSAL DATA:
  bearings and distances between beacons, plus the starting point coordinates from the grid margin

EXTRACT IN THIS ORDER:
1. CRS/Origin label (e.g. "Universal Zone 31" → EPSG:26331)
2. Grid margin values (Northing mN and Easting mE shown on plan edges) — these are the starting point coordinates
3. Corner beacon labels (SC/OS BBXXXXJP)
4. Boundary traversal: bearing + distance for each leg
5. Area, scale, plan number, owner, surveyor, date

Return ONLY valid JSON — no explanation, no markdown, just the JSON object:
{
  "crs": "EPSG:26331",
  "crsLabel": "Universal Zone 31 (Minna UTM)",
  "confidence": "high",
  "points": [
    { "label": "BB8215JP", "northing": 887959.725, "easting": 668351.770 }
  ],
  "metesAndBounds": [
    { "from": "BB8215JP", "to": "BB8216JP", "bearingDecimal": 121.767, "distanceM": 24.47 },
    { "from": "BB8216JP", "to": "BB8217JP", "bearingDecimal": 222.5, "distanceM": 43.20 },
    { "from": "BB8217JP", "to": "BB8218JP", "bearingDecimal": 310.5, "distanceM": 30.35 },
    { "from": "BB8218JP", "to": "BB8215JP", "bearingDecimal": 51.5, "distanceM": 40.20 }
  ],
  "pointOfBeginning": "BB8215JP",
  "metadata": {
    "surveyorName": "Surv. A. O. Adeyemo",
    "surveyDate": "",
    "planRef": "OS/2428/2024/031",
    "declaredAreaSqm": 1118.152
  },
  "notes": "Any ambiguities"
}

IMPORTANT: If you cannot find explicit point coordinates but CAN find bearings and distances, set confidence to "medium" and populate metesAndBounds. The system will compute coordinates from the traversal. Always return valid JSON.
\``;

async function callGeminiVision(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: imageBase64,
          },
        },
        {
          text: SURVEY_EXTRACTION_PROMPT,
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let errMsg = `Gemini API error ${res.status}`;
    try { errMsg = JSON.parse(text)?.error?.message ?? errMsg; } catch {}
    throw new Error(errMsg);
  }

  const data = JSON.parse(text);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

geoaiRouter.post("/analyze", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "GeoAI not available — GEMINI_API_KEY is not set. Get a free key at aistudio.google.com/apikey and add it to your Render environment variables.",
      });
    }

    const parseResult = z.object({
      imageBase64: z.string().min(100),
      mimeType: z.enum(["image/jpeg", "image/png", "image/tiff", "application/pdf"]),
    }).safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { imageBase64, mimeType } = parseResult.data;

    const estimatedBytes = imageBase64.length * 0.75;
    if (estimatedBytes > 18 * 1024 * 1024) {
      return res.status(413).json({
        error: "Image too large. Please resize to under 18 MB and try again.",
      });
    }

    // Gemini doesn't support PDF directly — convert to jpeg guidance
    if (mimeType === "application/pdf") {
      return res.status(415).json({
        error: "PDF not supported directly by Gemini free tier. Please convert your PDF to a JPG or PNG image first, then upload.",
      });
    }

    let rawContent: string;
    try {
      rawContent = await callGeminiVision(imageBase64, mimeType);
    } catch (err: any) {
      console.error("[GeoAI] Gemini error:", err.message);
      return res.status(502).json({ error: `Gemini error: ${err.message}` });
    }

    let extraction: any;
    try {
      // Strategy 1: strip markdown code fences
      let jsonStr = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      // Strategy 2: extract first {...} block if still not valid JSON
      if (!jsonStr.startsWith("{")) {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) jsonStr = match[0];
      }
      extraction = JSON.parse(jsonStr);
    } catch {
      return res.status(422).json({
        error: "AI returned unstructured output — could not parse coordinates. Try a higher resolution scan.",
        rawResponse: rawContent.slice(0, 500),
      });
    }

    let geoJson: any = null;

    // Strategy 1: explicit point coordinates
    if (extraction.points && extraction.points.length >= 3) {
      geoJson = {
        type: "Polygon",
        coordinates: [[
          ...extraction.points.map((pt: any) => [pt.easting, pt.northing]),
          [extraction.points[0].easting, extraction.points[0].northing],
        ]],
        _crs: extraction.crs,
      };
    }
    // Strategy 2: compute from metes-and-bounds traversal if no explicit coords
    else if (
      extraction.metesAndBounds &&
      extraction.metesAndBounds.length >= 3 &&
      extraction.points &&
      extraction.points.length >= 1
    ) {
      const startPt = extraction.points[0];
      let curN = startPt.northing;
      let curE = startPt.easting;
      const coords: [number, number][] = [[curE, curN]];

      for (const leg of extraction.metesAndBounds) {
        const bearingRad = (leg.bearingDecimal * Math.PI) / 180;
        curE += leg.distanceM * Math.sin(bearingRad);
        curN += leg.distanceM * Math.cos(bearingRad);
        coords.push([curE, curN]);
      }
      coords.push(coords[0]); // close ring

      geoJson = {
        type: "Polygon",
        coordinates: [coords],
        _crs: extraction.crs,
      };
    }

    res.json({
      extraction,
      geoJson,
      closureErrorM: null,
      requiresManualReview: extraction.confidence === "low",
    });
  } catch (err) {
    next(err);
  }
});

geoaiRouter.post("/confirm", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = z.object({
      parcelNumber: z.string().min(1),
      geoJsonWgs84: z.object({ type: z.string(), coordinates: z.array(z.any()) }),
      confidence: z.enum(["high", "medium", "low", "manual"]),
      closureErrorM: z.number().optional(),
      metadata: z.object({
        surveyorName: z.string().optional(),
        surveyDate: z.string().optional(),
        planRef: z.string().optional(),
        originalCrs: z.string().optional(),
      }).optional(),
    }).safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const body = parseResult.data;

    const parcelRows = await sql`
      INSERT INTO parcels (parcel_number, geometry, status)
      VALUES (
        ${body.parcelNumber},
        ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(body.geoJsonWgs84)})),
        'active'
      )
      RETURNING id, parcel_number, status
    `;
    const parcel = parcelRows[0];

    if (body.metadata) {
      await sql`
        INSERT INTO surveys (
          parcel_id, surveyor_name, survey_date, survey_plan_ref,
          crs, original_crs, geoai_confidence, closure_error_m
        )
        VALUES (
          ${parcel.id},
          ${body.metadata.surveyorName ?? "Unknown"},
          ${body.metadata.surveyDate ?? new Date().toISOString().split("T")[0]},
          ${body.metadata.planRef ?? null},
          'EPSG:4326',
          ${body.metadata.originalCrs ?? null},
          ${body.confidence},
          ${body.closureErrorM?.toString() ?? null}
        )
      `;
    }

    res.status(201).json({
      parcelId: parcel.id,
      parcelNumber: parcel.parcel_number,
      message: "Parcel registered successfully",
    });
  } catch (err) {
    next(err);
  }
});
