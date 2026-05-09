/**
 * Database connection for Render (persistent Node.js server).
 *
 * Uses postgres.js (not @neondatabase/serverless) because Render runs a
 * long-lived process with a real TCP connection — the HTTP/WebSocket driver
 * is only needed for serverless/edge environments (Vercel, Cloudflare Workers).
 *
 * Neon requires SSL — ssl: "require" is set below.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@lis/db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// postgres.js connection — persistent, pooled, SSL required for Neon
const client = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 10,          // max connections in pool
  idle_timeout: 20, // close idle connections after 20s
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

// Also export raw sql tag for PostGIS queries
export const sql = client;
