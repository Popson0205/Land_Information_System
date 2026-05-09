/**
 * Shared DB client (packages/db).
 * Uses postgres.js — correct for persistent server environments (Render, Railway, VPS).
 * If you deploy to Vercel/Cloudflare Workers, swap to @neondatabase/serverless.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
