import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  surveyorName: varchar("surveyor_name", { length: 255 }).notNull(),
  surveyDate: date("survey_date").notNull(),
  surveyPlanRef: varchar("survey_plan_ref", { length: 100 }),
  crs: varchar("crs", { length: 50 }).default("EPSG:4326"),
  // Original CRS from the plan (e.g. EPSG:4263 for Minna/Clarke 1880)
  originalCrs: varchar("original_crs", { length: 50 }),
  dxfFilePath: text("dxf_file_path"),       // R2/S3 path to original DXF
  scanFilePath: text("scan_file_path"),     // R2/S3 path to scanned PDF/image
  geoAiConfidence: varchar("geoai_confidence", { length: 20 }),
  // high | medium | low | manual — confidence of auto-georeferencing
  closureErrorM: varchar("closure_error_m", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Survey = typeof surveys.$inferSelect;
export type NewSurvey = typeof surveys.$inferInsert;
