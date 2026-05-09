import { Router } from "express";
import { sql } from "../lib/db.js";
import { z } from "zod";

export const parcelsRouter = Router();

/**
 * GET /api/parcels
 * Returns all parcels as a GeoJSON FeatureCollection.
 * MapLibre GL JS consumes this directly as a source.
 *
 * Query params:
 *   status  — filter by status (active | disputed | archived)
 *   bbox    — bounding box filter: "minLng,minLat,maxLng,maxLat"
 */
parcelsRouter.get("/", async (req, res, next) => {
  try {
    const { status, bbox } = req.query;

    let rows: any[];

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = String(bbox).split(",").map(Number);
      rows = await sql`
        SELECT
          p.id,
          p.parcel_number,
          p.status,
          p.area_sqm,
          p.perimeter_m,
          p.notes,
          p.created_at,
          p.updated_at,
          ST_AsGeoJSON(p.geometry)::jsonb AS geometry,
          lt.owner_name,
          lt.title_number,
          lt.title_type,
          z.zone_code,
          z.zone_label,
          EXISTS(SELECT 1 FROM disputes d WHERE d.parcel_id = p.id AND d.status = 'open') AS has_dispute,
          EXISTS(SELECT 1 FROM encumbrances e WHERE e.parcel_id = p.id AND e.status = 'active') AS has_encumbrance
        FROM parcels p
        LEFT JOIN land_titles lt ON lt.parcel_id = p.id
        LEFT JOIN zoning z ON z.parcel_id = p.id
        WHERE
          ST_Intersects(
            p.geometry,
            ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
          )
          ${status ? sql`AND p.status = ${status}` : sql``}
        ORDER BY p.parcel_number
      `;
    } else {
      rows = await sql`
        SELECT
          p.id,
          p.parcel_number,
          p.status,
          p.area_sqm,
          p.perimeter_m,
          p.notes,
          p.created_at,
          p.updated_at,
          ST_AsGeoJSON(p.geometry)::jsonb AS geometry,
          lt.owner_name,
          lt.title_number,
          lt.title_type,
          z.zone_code,
          z.zone_label,
          EXISTS(SELECT 1 FROM disputes d WHERE d.parcel_id = p.id AND d.status = 'open') AS has_dispute,
          EXISTS(SELECT 1 FROM encumbrances e WHERE e.parcel_id = p.id AND e.status = 'active') AS has_encumbrance
        FROM parcels p
        LEFT JOIN land_titles lt ON lt.parcel_id = p.id
        LEFT JOIN zoning z ON z.parcel_id = p.id
        ${status ? sql`WHERE p.status = ${status}` : sql``}
        ORDER BY p.parcel_number
      `;
    }

    // Build GeoJSON FeatureCollection
    const featureCollection = {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        id: row.id,
        geometry: row.geometry,
        properties: {
          id: row.id,
          parcelNumber: row.parcel_number,
          status: row.status,
          areaSqm: row.area_sqm,
          perimeterM: row.perimeter_m,
          ownerName: row.owner_name,
          titleNumber: row.title_number,
          titleType: row.title_type,
          zoneCode: row.zone_code,
          zoneLabel: row.zone_label,
          hasDispute: row.has_dispute,
          hasEncumbrance: row.has_encumbrance,
          notes: row.notes,
        },
      })),
    };

    res.json(featureCollection);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/parcels/:id
 * Full parcel record with all related data.
 */
parcelsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const [parcel] = await sql`
      SELECT
        p.*,
        ST_AsGeoJSON(p.geometry)::jsonb AS geometry_json,
        ST_Area(p.geometry::geography) AS computed_area_sqm,
        ST_Perimeter(p.geometry::geography) AS computed_perimeter_m
      FROM parcels p
      WHERE p.id = ${id}
    `;

    if (!parcel) {
      return res.status(404).json({ error: "Parcel not found" });
    }

    const [titles, txns, encumbrances, zoning, surveys, valuations, disputes] =
      await Promise.all([
        sql`SELECT * FROM land_titles WHERE parcel_id = ${id} ORDER BY created_at DESC`,
        sql`SELECT * FROM transactions WHERE parcel_id = ${id} ORDER BY transaction_date DESC`,
        sql`SELECT * FROM encumbrances WHERE parcel_id = ${id} ORDER BY created_at DESC`,
        sql`SELECT * FROM zoning WHERE parcel_id = ${id} ORDER BY effective_date DESC`,
        sql`SELECT * FROM surveys WHERE parcel_id = ${id} ORDER BY survey_date DESC`,
        sql`SELECT * FROM valuations WHERE parcel_id = ${id} ORDER BY valuation_date DESC`,
        sql`SELECT * FROM disputes WHERE parcel_id = ${id} ORDER BY filed_date DESC`,
      ]);

    res.json({
      id: parcel.id,
      parcelNumber: parcel.parcel_number,
      status: parcel.status,
      areaSqm: parcel.computed_area_sqm,
      perimeterM: parcel.computed_perimeter_m,
      notes: parcel.notes,
      geometry: parcel.geometry_json,
      createdAt: parcel.created_at,
      updatedAt: parcel.updated_at,
      titles,
      transactions: txns,
      encumbrances,
      zoning,
      surveys,
      valuations,
      disputes,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/parcels
 * Create a new parcel from a GeoJSON geometry.
 */
const CreateParcelSchema = z.object({
  parcelNumber: z.string().min(1),
  geometry: z.object({
    type: z.string(),
    coordinates: z.array(z.any()),
  }),
  status: z.enum(["active", "disputed", "archived"]).default("active"),
  notes: z.string().optional(),
});

parcelsRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateParcelSchema.parse(req.body);

    const [created] = await sql`
      INSERT INTO parcels (parcel_number, geometry, status, notes)
      VALUES (
        ${body.parcelNumber},
        ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(body.geometry)})),
        ${body.status},
        ${body.notes ?? null}
      )
      RETURNING id, parcel_number, status, created_at
    `;

    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    next(err);
  }
});

/**
 * PATCH /api/parcels/:id/status
 * Update parcel status.
 */
parcelsRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = z.object({
      status: z.enum(["active", "disputed", "archived"]),
    }).parse(req.body);

    const [updated] = await sql`
      UPDATE parcels SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, parcel_number, status, updated_at
    `;

    if (!updated) return res.status(404).json({ error: "Parcel not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
