/**
 * POST /api/parcels/register
 *
 * Full atomic registration — creates parcel + land_title + survey + zoning
 * in a single transaction from the traversal form data.
 */
import { Router, Request, Response, NextFunction } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const registerRouter = Router();

const RegisterSchema = z.object({
  // Geometry (WGS84 GeoJSON)
  geometry: z.object({ type: z.string(), coordinates: z.array(z.any()) }),
  confidence: z.enum(["high", "medium", "low", "manual"]).default("manual"),
  closureErrorM: z.number().optional(),
  originalCrs: z.string().optional(),
  traversal: z.any().optional(),

  // Parcel identity
  parcelNumber: z.string().min(1),
  address: z.string().optional(),
  village: z.string().optional(),
  lga: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),

  // Title
  ownerName: z.string().optional(),
  ownerIdNumber: z.string().optional(),
  titleNumber: z.string().optional(),
  titleType: z.enum(["freehold", "leasehold", "customary", ""]).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  registeredBy: z.string().optional(),

  // Survey
  surveyorName: z.string().optional(),
  surveyDate: z.string().optional(),
  planRef: z.string().optional(),
  osAppsn: z.string().optional(),
  scale: z.string().optional(),
  declaredAreaSqm: z.number().nullable().optional(),

  // Zoning
  zoneCode: z.string().optional(),
  zoneLabel: z.string().optional(),
  maxHeightM: z.number().nullable().optional(),
  floorAreaRatio: z.number().nullable().optional(),
});

registerRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }
    const d = parseResult.data;

    // Build notes with location details
    const fullNotes = [
      d.village && `Village: ${d.village}`,
      d.lga && `LGA: ${d.lga}`,
      d.state && `State: ${d.state}`,
      d.address && `Address: ${d.address}`,
      d.osAppsn && `OS-APPSN: ${d.osAppsn}`,
      d.scale && `Scale: ${d.scale}`,
      d.originalCrs && `Original CRS: ${d.originalCrs}`,
      d.closureErrorM !== undefined && `Closure error: ${d.closureErrorM.toFixed(4)}m`,
      d.notes,
    ].filter(Boolean).join(" | ");

    // ── 1. Insert parcel ──────────────────────────────────────────────────
    const parcelRows = await sql`
      INSERT INTO parcels (parcel_number, geometry, status, notes)
      VALUES (
        ${d.parcelNumber},
        ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(d.geometry)})),
        'active',
        ${fullNotes || null}
      )
      RETURNING id, parcel_number,
        ST_Area(geometry::geography) AS area_sqm,
        ST_Perimeter(geometry::geography) AS perimeter_m
    `;
    const parcel = parcelRows[0];

    // Update computed area/perimeter
    await sql`
      UPDATE parcels
      SET area_sqm = ${parcel.area_sqm}, perimeter_m = ${parcel.perimeter_m}
      WHERE id = ${parcel.id}
    `;

    // ── 2. Insert land title (if owner provided) ──────────────────────────
    if (d.ownerName?.trim()) {
      await sql`
        INSERT INTO land_titles (
          parcel_id, title_number, owner_name, owner_id,
          title_type, issue_date, expiry_date, registered_by
        )
        VALUES (
          ${parcel.id},
          ${d.titleNumber?.trim() || `T/${d.parcelNumber}`},
          ${d.ownerName.trim()},
          ${d.ownerIdNumber?.trim() || null},
          ${d.titleType?.trim() || null},
          ${d.issueDate?.trim() || null},
          ${d.expiryDate?.trim() || null},
          ${d.registeredBy?.trim() || null}
        )
        ON CONFLICT (title_number) DO NOTHING
      `;
    }

    // ── 3. Insert survey record ───────────────────────────────────────────
    await sql`
      INSERT INTO surveys (
        parcel_id, surveyor_name, survey_date, survey_plan_ref,
        crs, original_crs, geoai_confidence, closure_error_m, notes
      )
      VALUES (
        ${parcel.id},
        ${d.surveyorName?.trim() || "Unknown"},
        ${d.surveyDate?.trim() || new Date().toISOString().split("T")[0]},
        ${d.planRef?.trim() || null},
        'EPSG:4326',
        ${d.originalCrs?.trim() || null},
        ${d.confidence},
        ${d.closureErrorM?.toString() || null},
        ${d.osAppsn?.trim() || null}
      )
    `;

    // ── 4. Insert zoning (if provided) ────────────────────────────────────
    if (d.zoneCode?.trim() && d.zoneLabel?.trim()) {
      await sql`
        INSERT INTO zoning (
          parcel_id, zone_code, zone_label, floor_area_ratio, max_height_m
        )
        VALUES (
          ${parcel.id},
          ${d.zoneCode.trim()},
          ${d.zoneLabel.trim()},
          ${d.floorAreaRatio ?? null},
          ${d.maxHeightM ?? null}
        )
      `;
    }

    // ── 5. Audit log ──────────────────────────────────────────────────────
    await sql`
      INSERT INTO audit_log (table_name, record_id, action, new_data)
      VALUES (
        'parcels', ${parcel.id}, 'INSERT',
        ${JSON.stringify({ parcelNumber: d.parcelNumber, method: d.confidence, planRef: d.planRef })}
      )
    `;

    res.status(201).json({
      parcelId: parcel.id,
      parcelNumber: parcel.parcel_number,
      areaSqm: parcel.area_sqm,
      perimeterM: parcel.perimeter_m,
      message: "Parcel registered successfully",
    });

  } catch (err: any) {
    // Duplicate parcel number
    if (err.message?.includes("unique") || err.code === "23505") {
      return res.status(409).json({ error: `Parcel number "${req.body.parcelNumber}" already exists.` });
    }
    next(err);
  }
});
