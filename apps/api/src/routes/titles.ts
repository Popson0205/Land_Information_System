import { Router } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const titlesRouter = Router();

const CreateTitleSchema = z.object({
  parcelId: z.string().uuid(),
  titleNumber: z.string().min(1),
  ownerName: z.string().min(1),
  ownerId: z.string().optional(),
  titleType: z.enum(["freehold", "leasehold", "customary"]).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  registeredBy: z.string().optional(),
});

titlesRouter.get("/parcel/:parcelId", async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT * FROM land_titles WHERE parcel_id = ${req.params.parcelId}
      ORDER BY created_at DESC
    `;
    res.json(rows);
  } catch (err) { next(err); }
});

titlesRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateTitleSchema.parse(req.body);
    const [created] = await sql`
      INSERT INTO land_titles (
        parcel_id, title_number, owner_name, owner_id,
        title_type, issue_date, expiry_date, registered_by
      )
      VALUES (
        ${body.parcelId}, ${body.titleNumber}, ${body.ownerName},
        ${body.ownerId ?? null}, ${body.titleType ?? null},
        ${body.issueDate ?? null}, ${body.expiryDate ?? null},
        ${body.registeredBy ?? null}
      )
      RETURNING *
    `;
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
    next(err);
  }
});
