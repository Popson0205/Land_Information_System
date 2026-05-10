-- ============================================================
-- LIS Initial Migration
-- Run this ONCE on a fresh Neon database.
-- Prerequisites: PostGIS extension must be enabled first.
-- ============================================================

-- Step 1: Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS address_standardizer;

-- Step 2: Parcels (spatial anchor — all records reference this)
CREATE TABLE IF NOT EXISTS parcels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_number VARCHAR(50) UNIQUE NOT NULL,
  geometry      GEOMETRY(MultiPolygon, 4326) NOT NULL,
  area_sqm      NUMERIC(12, 4),
  perimeter_m   NUMERIC(12, 4),
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index on geometry — critical for map queries
CREATE INDEX IF NOT EXISTS idx_parcels_geometry
  ON parcels USING GIST(geometry);

CREATE INDEX IF NOT EXISTS idx_parcels_status
  ON parcels(status);

-- Step 3: Land Titles
CREATE TABLE IF NOT EXISTS land_titles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id     UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  title_number  VARCHAR(100) UNIQUE NOT NULL,
  owner_name    VARCHAR(255) NOT NULL,
  owner_id      VARCHAR(100),
  title_type    VARCHAR(50),
  issue_date    DATE,
  expiry_date   DATE,
  registered_by VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_land_titles_parcel_id ON land_titles(parcel_id);
CREATE INDEX IF NOT EXISTS idx_land_titles_owner_name ON land_titles(owner_name);

-- Step 4: Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id        UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  transaction_type VARCHAR(50) NOT NULL,
  from_owner       VARCHAR(255),
  to_owner         VARCHAR(255) NOT NULL,
  transaction_date DATE NOT NULL,
  consideration    NUMERIC(15, 2),
  currency         VARCHAR(10) DEFAULT 'NGN',
  instrument_ref   VARCHAR(100),
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_parcel_id ON transactions(parcel_id);

-- Step 5: Encumbrances
CREATE TABLE IF NOT EXISTS encumbrances (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id  UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  type       VARCHAR(50) NOT NULL,
  holder     VARCHAR(255) NOT NULL,
  amount     NUMERIC(15, 2),
  currency   VARCHAR(10) DEFAULT 'NGN',
  start_date DATE,
  end_date   DATE,
  status     VARCHAR(20) NOT NULL DEFAULT 'active',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encumbrances_parcel_id ON encumbrances(parcel_id);

-- Step 6: Zoning
CREATE TABLE IF NOT EXISTS zoning (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id        UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  zone_code        VARCHAR(50) NOT NULL,
  zone_label       VARCHAR(100) NOT NULL,
  floor_area_ratio NUMERIC(5, 2),
  max_height_m     NUMERIC(6, 2),
  effective_date   DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoning_parcel_id ON zoning(parcel_id);

-- Step 7: Surveys
CREATE TABLE IF NOT EXISTS surveys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id         UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  surveyor_name     VARCHAR(255) NOT NULL,
  survey_date       DATE NOT NULL,
  survey_plan_ref   VARCHAR(100),
  crs               VARCHAR(50) DEFAULT 'EPSG:4326',
  original_crs      VARCHAR(50),
  dxf_file_path     TEXT,
  scan_file_path    TEXT,
  geoai_confidence  VARCHAR(20),
  closure_error_m   VARCHAR(20),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_parcel_id ON surveys(parcel_id);

-- Step 8: Valuations
CREATE TABLE IF NOT EXISTS valuations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id      UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  assessed_value NUMERIC(15, 2) NOT NULL,
  currency       VARCHAR(10) DEFAULT 'NGN',
  valuation_date DATE NOT NULL,
  tax_year       INTEGER,
  annual_tax     NUMERIC(12, 2),
  valuer_name    VARCHAR(255),
  basis          VARCHAR(100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuations_parcel_id ON valuations(parcel_id);

-- Step 9: Disputes
CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id       UUID NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  dispute_type    VARCHAR(100) NOT NULL,
  claimant        VARCHAR(255) NOT NULL,
  respondent      VARCHAR(255),
  filed_date      DATE NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'open',
  resolution_date DATE,
  court_ref       VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_parcel_id ON disputes(parcel_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- Step 10: Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name    VARCHAR(100) NOT NULL,
  record_id     UUID NOT NULL,
  action        VARCHAR(20) NOT NULL,
  changed_by    VARCHAR(255),
  previous_data JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- Step 11: Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE OR REPLACE TRIGGER parcels_updated_at
  BEFORE UPDATE ON parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER land_titles_updated_at
  BEFORE UPDATE ON land_titles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER encumbrances_updated_at
  BEFORE UPDATE ON encumbrances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
