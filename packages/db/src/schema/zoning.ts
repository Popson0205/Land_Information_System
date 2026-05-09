import {
  pgTable,
  uuid,
  varchar,
  date,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const zoning = pgTable("zoning", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  zoneCode: varchar("zone_code", { length: 50 }).notNull(),
  // R1=Residential Low Density, R2=Residential High Density,
  // C1=Commercial, I1=Industrial, A1=Agricultural, G1=Government
  zoneLabel: varchar("zone_label", { length: 100 }).notNull(),
  floorAreaRatio: numeric("floor_area_ratio", { precision: 5, scale: 2 }),
  maxHeightM: numeric("max_height_m", { precision: 6, scale: 2 }),
  effectiveDate: date("effective_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Zoning = typeof zoning.$inferSelect;
export type NewZoning = typeof zoning.$inferInsert;
