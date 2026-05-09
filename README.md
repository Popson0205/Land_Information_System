# LIS — Land Information System

A browser-based Land Information System with parcel mapping (DXF import), GeoAI auto-georeferencing, and a full land records database. Built on React + MapLibre GL JS + Node.js + Neon (PostgreSQL + PostGIS).

---

## Architecture

```
apps/
  web/        → React + Vite + MapLibre GL JS (frontend)
  api/        → Node.js + Express (backend API)
packages/
  db/         → Drizzle ORM schema + migrations (shared)
```

---

## Prerequisites

- Node.js 20+
- npm 10+
- A [Neon](https://neon.tech) account (free tier works)
- An OpenAI API key (for GeoAI plan analysis)

---

## Step 1 — Neon Database Setup

1. Go to [neon.tech](https://neon.tech) and create a new project named `lisdb`.
2. Copy your **Connection String** from the dashboard (Connection Details → Connection string).
3. Open a **SQL Editor** in Neon and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS address_standardizer;
```

4. Verify PostGIS is active:
```sql
SELECT PostGIS_Version();
-- Should return: 3.5.x ...
```

---

## Step 2 — Local Setup

```bash
# Clone the repo
git clone https://github.com/your-org/lis.git
cd lis

# Install all workspace dependencies
npm install

# Copy environment file
cp .env.example .env
```

Edit `.env` and fill in:
```
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/lisdb?sslmode=require"
OPENAI_API_KEY=sk-...
VITE_API_URL=http://localhost:4000
VITE_MAPLIBRE_STYLE=https://demotiles.maplibre.org/style.json
```

> **MapLibre style**: The default `demotiles.maplibre.org` style is free and works for development.
> For production, use [MapTiler](https://www.maptiler.com) (free tier: 100k tiles/month) or
> self-host with [OpenMapTiles](https://openmaptiles.org).

---

## Step 3 — Run Database Migration

```bash
# Run the initial migration (creates all 9 tables + PostGIS indexes)
cd packages/db
cat src/migrations/0001_initial.sql | psql "$DATABASE_URL"
```

Or using psql directly if you have it installed:
```bash
psql "postgresql://user:pass@ep-xxx.aws.neon.tech/lisdb?sslmode=require" \
  -f packages/db/src/migrations/0001_initial.sql
```

---

## Step 4 — Seed Sample Data

```bash
# From repo root
npm run db:seed

# Expected output:
# 🌱 Seeding database...
# ✅ Seed complete — 3 parcels, 2 titles, 3 zoning records, 1 dispute inserted.
```

This inserts 3 sample parcels in Lagos (Lagos Island, Victoria Island, Ikeja) so the map loads with visible data immediately.

---

## Step 5 — Start Development Servers

```bash
# From repo root — starts both API and web in parallel
npm run dev

# API starts on: http://localhost:4000
# Web starts on: http://localhost:5173
```

Verify the API is running:
```bash
curl http://localhost:4000/health
# {"status":"ok","service":"lis-api","timestamp":"..."}

curl http://localhost:4000/api/parcels
# GeoJSON FeatureCollection with 3 parcels
```

Open [http://localhost:5173](http://localhost:5173) — you should see the map centered on Lagos with 3 parcels rendered. Click any parcel to open the side panel.

---

## API Reference

### Parcels

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/parcels` | All parcels as GeoJSON FeatureCollection |
| GET | `/api/parcels?status=disputed` | Filter by status |
| GET | `/api/parcels?bbox=3.3,6.4,3.5,6.6` | Filter by bounding box |
| GET | `/api/parcels/:id` | Full parcel record with all related data |
| POST | `/api/parcels` | Create parcel from GeoJSON geometry |
| PATCH | `/api/parcels/:id/status` | Update parcel status |

### GeoAI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/geoai/analyze` | Extract coordinates from survey plan image |
| POST | `/api/geoai/confirm` | Confirm auto-georeferenced parcel → write to DB |

### Surveys & Titles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/surveys/parcel/:parcelId` | Surveys for a parcel |
| POST | `/api/surveys` | Create survey record |
| GET | `/api/titles/parcel/:parcelId` | Titles for a parcel |
| POST | `/api/titles` | Register a new title |

---

## GeoAI — Plan Upload Flow

The GeoAI pipeline reads a scanned survey plan and auto-places the parcel on the map:

```
1. User uploads PDF/JPEG/PNG of survey plan
2. POST /api/geoai/analyze → GPT-4o Vision extracts:
   - Corner coordinates (Northing/Easting)
   - CRS/datum (e.g., EPSG:4263 Minna/Clarke 1880)
   - Bearing-distance pairs (metes and bounds)
   - Surveyor name, date, plan reference
3. Client reprojects coordinates to WGS84 using proj4js
4. Parcel preview rendered on map (dashed outline)
5. User confirms position
6. POST /api/geoai/confirm → parcel + survey record written to Neon
```

Confidence levels returned:
- `high` — explicit coordinates + stated CRS
- `medium` — inferred CRS or metes-and-bounds only
- `low` — goes to manual review queue

---

## Database Schema

All 9 tables with PostGIS geometry:

| Table | Purpose |
|-------|---------|
| `parcels` | Spatial anchor — geometry (MultiPolygon, EPSG:4326) |
| `land_titles` | Ownership and title registration |
| `transactions` | Sales, transfers, inheritance |
| `encumbrances` | Mortgages, liens, easements |
| `zoning` | Zone classification and development controls |
| `surveys` | Survey records + GeoAI confidence metadata |
| `valuations` | Tax assessment and market valuation |
| `disputes` | Boundary and ownership disputes |
| `audit_log` | Full change history for all records |

---

## Docker (Optional)

For running the API and Martin tile server in containers (Neon DB is managed — no DB container needed):

```bash
cp .env.example .env
# Fill in DATABASE_URL and other vars

docker compose up
```

Martin tile server runs on port 3001 and serves MVT vector tiles directly from Neon.
To use Martin as the map source in MapLibre, update `VITE_MAPLIBRE_STYLE` to point to your Martin instance.

---

## Project Structure

```
lis/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts          ← Express app entry
│   │       ├── lib/db.ts         ← Neon connection
│   │       ├── middleware/       ← Error handler
│   │       └── routes/
│   │           ├── parcels.ts    ← Parcel CRUD + GeoJSON
│   │           ├── titles.ts     ← Land title routes
│   │           ├── surveys.ts    ← Survey routes
│   │           └── geoai.ts      ← GeoAI analyze + confirm
│   └── web/
│       └── src/
│           ├── App.tsx           ← Root layout
│           ├── lib/api.ts        ← API client
│           ├── types/parcel.ts   ← TypeScript types
│           └── components/
│               ├── map/          ← MapWorkspace (MapLibre)
│               ├── parcels/      ← ParcelSidePanel
│               └── layout/       ← TopBar
├── packages/
│   └── db/
│       └── src/
│           ├── schema/           ← Drizzle schema (8 tables)
│           ├── migrations/       ← Raw SQL migrations
│           ├── client.ts         ← Neon + Drizzle client
│           └── seed.ts           ← Sample data seed
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Next Build Phases

Following the master plan (`LIS — Master System Plan`):

- **Phase 2** (current): DXF import pipeline + GeoAI (Weeks 5–9)
- **Phase 3**: Full record forms — encumbrances, valuations, disputes (Weeks 9–12)
- **Phase 4**: Dashboard, search, analytics, PDF export (Weeks 13–15)
- **Phase 5**: Production deploy — Nginx, SSL, performance tuning (Weeks 16–18)

---

## Open Questions (Resolve Before Phase 2)

1. **CRS**: Confirm primary coordinate system — Minna/Clarke 1880 (EPSG:4263) or WGS84 (EPSG:4326)?
2. **Parcel numbering**: Confirm the format (e.g., `LA/IKJ/001/024` — State/LGA/Block/Plot)?
3. **Multi-tenancy**: Single registry or multiple offices sharing one database?
4. **Offline**: Do field surveyors need offline capability?

---

## Deploying to Render

### Important: Driver difference
Render runs a **persistent Node.js server** — this scaffold uses `postgres` (postgres.js) with a real TCP connection to Neon. Do NOT swap to `@neondatabase/serverless` here; that driver is for Vercel/Cloudflare Workers only.

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "feat: initial LIS scaffold"
git remote add origin https://github.com/your-org/lis.git
git push -u origin main
```

### Step 2 — Deploy API (Web Service)
1. Render Dashboard → **New → Blueprint** → connect your repo
2. Render will detect `render.yaml` and configure both services automatically
3. After services are created, go to **lis-api → Environment** and add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string (`postgresql://...?sslmode=require`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `API_CORS_ORIGIN` | Your `lis-web.onrender.com` URL (set after web deploys) |

### Step 3 — Deploy Web (Static Site)
1. Go to **lis-web → Environment** and add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | Your `https://lis-api.onrender.com` URL |
| `VITE_MAPLIBRE_STYLE` | `https://demotiles.maplibre.org/style.json` |

2. Trigger a redeploy after setting env vars.

### Step 4 — Run Migration on Neon
The migration runs against Neon directly (not via Render) — Neon is managed:
```bash
# From your local machine
psql "$DATABASE_URL" -f packages/db/src/migrations/0001_initial.sql
```

### Step 5 — Seed Data (optional)
```bash
# From your local machine
cd packages/db && npm run db:seed
```

### Free Tier Notes
- Render free Web Services **spin down after 15 minutes of inactivity** — first request after idle takes ~30 seconds to wake. Upgrade to Starter ($7/mo) for always-on.
- Neon free tier: 0.5 GB storage, 1 compute unit. More than enough for testing.
- MapLibre demo tiles (`demotiles.maplibre.org`) are for development only — switch to MapTiler for production.

### Build Commands (render.yaml already sets these)
| Service | Build | Start |
|---------|-------|-------|
| lis-api | `npm install && npm run build` | `npm run start` |
| lis-web | `npm install && npm run build` | *(static — no start command)* |
