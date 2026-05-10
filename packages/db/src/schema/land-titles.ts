import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { parcels } from "./parcels";

export const landTitles = pgTable("land_titles", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .references(() => parcels.id, { onDelete: "restrict" })
    .notNull(),
  titleNumber: varchar("title_number", { length: 100 }).unique().notNull(),
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  ownerId: varchar("owner_id", { length: 100 }),          // national ID / company reg
  titleType: varchar("title_type", { length: 50 }),       // freehold | leasehold | customary
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),                        // leasehold only
  registeredBy: varchar("registered_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LandTitle = typeof landTitles.$inferSelect;
export type NewLandTitle = typeof landTitles.$inferInsert;
