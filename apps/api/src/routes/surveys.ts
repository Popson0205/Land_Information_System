import { Router } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const surveysRouter = Router();

surveysRouter.get("/parcel/:parcelId", async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT * FROM surveys WHERE parcel_id = ${req.params.parcelId}
      ORDER BY survey_date DESC
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

surveysRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      parcelId: z.string().uuid(),
      surveyorName: z.string(),
      surveyDate: z.string(),
      surveyPlanRef: z.string().optional(),
      crs: z.string().default("EPSG:4326"),
      originalCrs: z.string().optional(),
      dxfFilePath: z.string().optional(),
      scanFilePath: z.string().optional(),
      geoaiConfidence: z.enum(["high", "medium", "low", "manual"]).optional(),
      closureErrorM: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [created] = await sql`
      INSERT INTO surveys (
        parcel_id, surveyor_name, survey_date, survey_plan_ref,
        crs, original_crs, dxf_file_path, scan_file_path,
        geoai_confidence, closure_error_m, notes
      )
      VALUES (
        ${body.parcelId}, ${body.surveyorName}, ${body.surveyDate},
        ${body.surveyPlanRef ?? null}, ${body.crs}, ${body.originalCrs ?? null},
        ${body.dxfFilePath ?? null}, ${body.scanFilePath ?? null},
        ${body.geoaiConfidence ?? null}, ${body.closureErrorM ?? null},
        ${body.notes ?? null}
      )
      RETURNING *
    `;
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
    next(err);
  }
});
