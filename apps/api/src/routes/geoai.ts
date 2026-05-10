import { Router, Request, Response, NextFunction } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const geoaiRouter = Router();

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY is not set — GeoAI endpoints will return 503");
}

const SURVEY_EXTRACTION_PROMPT = `
You are a geospatial data extraction specialist. Analyze this survey plan image and extract:

1. COORDINATE REFERENCE SYSTEM (CRS): Look for datum/projection labels (e.g., "Minna", "WGS84", "UTM Zone 32N", "EPSG:4263", "Clarke 1880").
2. CORNER POINT COORDINATES: Extract every labeled point with its Northing (N) and Easting (E) values.
3. METES AND BOUNDS: If explicit coordinates are absent, extract bearing-distance pairs (e.g., "N45°30'E — 120.5m").
4. POINT OF BEGINNING (POB): Identify the starting point for metes-and-bounds traversal.
5. SURVEY METADATA: Surveyor name, survey date, plan reference number, declared area.

Return ONLY valid JSON in this exact structure:
{
  "crs": "EPSG:4326",
  "crsLabel": "WGS84",
  "confidence": "high",
  "points": [
    { "label": "A", "northing": 735420.50, "easting": 328610.20 }
  ],
  "metesAndBounds": [
    { "from": "A", "bearing": "N45°30'E", "distanceM": 120.5 }
  ],
  "pointOfBeginning": "A",
  "metadata": {
    "surveyorName": "",
    "surveyDate": "",
    "planRef": "",
    "declaredAreaSqm": null
  },
  "notes": "Any ambiguities or extraction warnings"
}

Confidence: "high" = CRS stated + all coords present. "medium" = inferred CRS or metes-and-bounds only. "low" = handwritten or missing data.
`;

async function callGeminiVision(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = "gemini-1.5-flash";
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
      const jsonStr = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      extraction = JSON.parse(jsonStr);
    } catch {
      return res.status(422).json({
        error: "AI returned unstructured output — could not parse coordinates. Try a higher resolution scan.",
        rawResponse: rawContent.slice(0, 500),
      });
    }

    let geoJson: any = null;
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
