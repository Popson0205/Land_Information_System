import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const valuations = pgTable("valuations", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  assessedValue: numeric("assessed_value", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  valuationDate: date("valuation_date").notNull(),
  taxYear: integer("tax_year"),
  annualTax: numeric("annual_tax", { precision: 12, scale: 2 }),
  valuerName: varchar("valuer_name", { length: 255 }),
  basis: varchar("basis", { length: 100 }),
  // market | income | cost | comparative
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Valuation = typeof valuations.$inferSelect;
export type NewValuation = typeof valuations.$inferInsert;
