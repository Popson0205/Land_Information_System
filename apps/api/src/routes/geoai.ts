/**
 * GeoAI Route — Auto-georeferencing pipeline
 *
 * POST /api/geoai/analyze
 *   Accepts a base64-encoded image of a survey plan.
 *   Sends it to GPT-4o Vision to extract coordinates, CRS, and metadata.
 *   Returns structured extraction result + reconstructed GeoJSON polygon.
 *
 * POST /api/geoai/confirm
 *   Confirms the auto-georeferenced parcel and writes it to the DB.
 */
import { Router } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";
import OpenAI from "openai";

export const geoaiRouter = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Prompt ───────────────────────────────────────────────────────────────────
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

Confidence levels:
- "high": CRS explicitly stated + all corner coordinates present
- "medium": CRS inferred OR metes-and-bounds only
- "low": Handwritten, illegible, or missing critical data
`;

/**
 * POST /api/geoai/analyze
 * Body: { imageBase64: string, mimeType: "image/jpeg" | "image/png" | "application/pdf" }
 */
geoaiRouter.post("/analyze", async (req, res, next) => {
  try {
    const { imageBase64, mimeType } = z.object({
      imageBase64: z.string().min(100),
      mimeType: z.enum(["image/jpeg", "image/png", "image/tiff", "application/pdf"]),
    }).parse(req.body);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "GeoAI not configured — OPENAI_API_KEY missing" });
    }

    // Send to GPT-4o Vision
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: SURVEY_EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content ?? "";

    // Parse JSON from response
    let extraction: any;
    try {
      // Strip markdown code fences if present
      const jsonStr = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      extraction = JSON.parse(jsonStr);
    } catch {
      return res.status(422).json({
        error: "AI could not produce structured output",
        rawResponse: rawContent,
      });
    }

    // If we have explicit point coordinates, reconstruct GeoJSON polygon
    let geoJson: any = null;
    let closureErrorM: number | null = null;

    if (extraction.points && extraction.points.length >= 3) {
      // Convert Northing/Easting to lng/lat
      // NOTE: This assumes the CRS is known and handled by proj4 on the client.
      // For the API, we return the raw projected coordinates + CRS for the
      // client to transform via proj4js.
      geoJson = {
        type: "Polygon",
        coordinates: [
          [
            ...extraction.points.map((pt: any) => [pt.easting, pt.northing]),
            [extraction.points[0].easting, extraction.points[0].northing], // close ring
          ],
        ],
        _crs: extraction.crs, // non-standard field — client uses this for reprojection
      };
    }

    res.json({
      extraction,
      geoJson,
      closureErrorM,
      requiresManualReview: extraction.confidence === "low",
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
    next(err);
  }
});

/**
 * POST /api/geoai/confirm
 * After the user confirms the auto-georeferenced polygon on the map,
 * this endpoint creates the parcel record.
 * Body: { parcelNumber, geoJsonWgs84 (reprojected by client), confidence, metadata }
 */
geoaiRouter.post("/confirm", async (req, res, next) => {
  try {
    const body = z.object({
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
    }).parse(req.body);

    // Create parcel
    const [parcel] = await sql`
      INSERT INTO parcels (parcel_number, geometry, status)
      VALUES (
        ${body.parcelNumber},
        ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(body.geoJsonWgs84)})),
        'active'
      )
      RETURNING id, parcel_number, status
    `;

    // Create survey record
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
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
    next(err);
  }
});
