import {
  pgTable,
  uuid,
  varchar,
  date,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const encumbrances = pgTable("encumbrances", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  // mortgage | lien | easement | covenant | caveat | charge
  holder: varchar("holder", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Encumbrance = typeof encumbrances.$inferSelect;
export type NewEncumbrance = typeof encumbrances.$inferInsert;
