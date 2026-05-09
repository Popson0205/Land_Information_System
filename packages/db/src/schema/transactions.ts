import {
  pgTable,
  uuid,
  varchar,
  date,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(),
  // sale | transfer | inheritance | gift | subdivision | amalgamation
  fromOwner: varchar("from_owner", { length: 255 }),
  toOwner: varchar("to_owner", { length: 255 }).notNull(),
  transactionDate: date("transaction_date").notNull(),
  consideration: numeric("consideration", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  instrumentRef: varchar("instrument_ref", { length: 100 }),  // deed / instrument reference
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
