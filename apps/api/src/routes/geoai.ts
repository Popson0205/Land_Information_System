import { Router, Request, Response, NextFunction } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const geoaiRouter = Router();

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY is not set — GeoAI endpoints will return 503");
}

const SURVEY_EXTRACTION_PROMPT = `
You are a Nigerian cadastral survey plan specialist. Extract the TRAVERSAL DATA from this survey plan.

A traversal is: starting point coordinates + a sequence of bearing/distance legs that trace the boundary.
This is exactly how AutoCAD plots land parcels — start at a known point, follow each bearing and distance, close back to start.

EXTRACT THIS EXACT FORMAT:

1. STARTING POINT: The first beacon's Northing (mN) and Easting (mE) from the plan margins or title block.
   Nigerian plans show grid reference lines on the margins labeled "887959.725mN" and "668351.770mE" — these are the starting coordinates.

2. LEGS: Each boundary line has a bearing (e.g. "121° 46'") and distance (e.g. "24.47m").
   Read them in order around the boundary. Also note fence type (W/F = wire fence, C/F = concrete fence, etc.)

3. METADATA: Plan number, owner name, surveyor name, date, area, scale, CRS/origin, LGA, state, OS-APPSN number.

4. CRS: Look for "Universal Zone 31" → EPSG:26331, "Universal Zone 32" → EPSG:26332, "Minna" → EPSG:4263.

Return ONLY valid JSON — no explanation text before or after:
{
  "crs": "EPSG:26331",
  "crsLabel": "Universal Zone 31",
  "confidence": "high",
  "startPoint": {
    "beaconLabel": "BB8215JP",
    "northing": 887959.725,
    "easting": 668351.770
  },
  "legs": [
    { "fromBeacon": "BB8215JP", "toBeacon": "BB8216JP", "bearingDeg": 121, "bearingMin": 46, "bearingSec": 0, "distanceM": 24.47, "fenceType": "W/F" },
    { "fromBeacon": "BB8216JP", "toBeacon": "BB8217JP", "bearingDeg": 222, "bearingMin": 30, "bearingSec": 0, "distanceM": 43.20, "fenceType": "W/F" },
    { "fromBeacon": "BB8217JP", "toBeacon": "BB8218JP", "bearingDeg": 310, "bearingMin": 30, "bearingSec": 0, "distanceM": 30.35, "fenceType": "W/F" },
    { "fromBeacon": "BB8218JP", "toBeacon": "BB8215JP", "bearingDeg": 51,  "bearingMin": 30, "bearingSec": 0, "distanceM": 40.20, "fenceType": "W/F" }
  ],
  "metadata": {
    "ownerName": "Mr. Emmanuel Oyetunde Fasola and Mrs. Kemi Oyetunde Fasola",
    "surveyorName": "Surv. A. O. Adeyemo",
    "surveyDate": "",
    "planRef": "OS/2428/2024/031",
    "osAppsn": "OS-APPSN 01S",
    "declaredAreaSqm": 1118.152,
    "scale": "1:500",
    "village": "Durodola Village",
    "address": "Along Odo-Afa Road, Owode-Ede",
    "lga": "Ede South",
    "state": "Osun"
  },
  "notes": "Any ambiguities or warnings"
}

Confidence: "high" = CRS stated + all bearings/distances readable. "medium" = some values unclear. "low" = mostly unreadable.
`;

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
    let closureErrorM: number | null = null;

    // Compute polygon from traversal (startPoint + legs)
    if (extraction.startPoint && extraction.legs && extraction.legs.length >= 3) {
      const start = extraction.startPoint;
      let curN = start.northing;
      let curE = start.easting;
      const projCoords: [number, number][] = [[curE, curN]];

      for (const leg of extraction.legs) {
        const bearingDec = leg.bearingDeg + leg.bearingMin / 60 + (leg.bearingSec ?? 0) / 3600;
        const bearingRad = (bearingDec * Math.PI) / 180;
        curE += leg.distanceM * Math.sin(bearingRad);
        curN += leg.distanceM * Math.cos(bearingRad);
        projCoords.push([curE, curN]);
      }

      // Closure error
      const dE = projCoords[projCoords.length-1][0] - projCoords[0][0];
      const dN = projCoords[projCoords.length-1][1] - projCoords[0][1];
      closureErrorM = Math.sqrt(dE*dE + dN*dN);

      // Close the ring
      projCoords.push(projCoords[0]);

      // Reproject to WGS84 using proj4 (server-side)
      // Note: proj4 is not available server-side here, so we return projected coords
      // with _crs flag — the frontend reprojects via proj4js
      geoJson = {
        type: "Polygon",
        coordinates: [projCoords],
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
