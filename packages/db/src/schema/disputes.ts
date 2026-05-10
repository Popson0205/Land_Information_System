import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  disputeType: varchar("dispute_type", { length: 100 }).notNull(),
  // boundary | ownership | encroachment | double-allocation | inheritance
  claimant: varchar("claimant", { length: 255 }).notNull(),
  respondent: varchar("respondent", { length: 255 }),
  filedDate: date("filed_date").notNull(),
  status: varchar("status", { length: 50 }).default("open").notNull(),
  // open | under-review | resolved | dismissed | appealed
  resolutionDate: date("resolution_date"),
  courtRef: varchar("court_ref", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
