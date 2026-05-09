import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// PostGIS geometry type — Drizzle doesn't have built-in PostGIS support,
// so we declare a custom type that passes geometry values through as raw SQL.
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon, 4326)";
  },
});

export const parcels = pgTable("parcels", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelNumber: varchar("parcel_number", { length: 50 }).unique().notNull(),
  // geometry stored as PostGIS MultiPolygon in WGS84 (EPSG:4326)
  geometry: geometry("geometry").notNull(),
  // area and perimeter are computed in application layer from PostGIS queries
  // (Drizzle doesn't support generated columns with PostGIS functions yet)
  areaSqm: numeric("area_sqm", { precision: 12, scale: 4 }),
  perimeterM: numeric("perimeter_m", { precision: 12, scale: 4 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  // status: active | disputed | archived
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Parcel = typeof parcels.$inferSelect;
export type NewParcel = typeof parcels.$inferInsert;
