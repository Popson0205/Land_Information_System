/**
 * CRS Registry — Authoritative proj4 definitions sourced directly from epsg.io
 * All strings verified against EPSG authority (epsg.io/<code>.proj4)
 *
 * Accuracy notes:
 * - sub-metre: WGS84-based, inherently accurate
 * - 1-5m: good Helmert parameters
 * - 5-15m: legacy datums (Minna, Arc 1960, etc.) — inherent datum uncertainty
 *   For sub-metre on legacy datums: use GCP correction feature
 */

export interface CrsDefinition {
  code: string;
  label: string;
  proj4: string;
  region: string;
  accuracy: "sub-metre" | "1-5m" | "5-15m" | "variable";
  notes?: string;
}

export const CRS_NAMED: CrsDefinition[] = [
  // ── WGS84 ────────────────────────────────────────────────────────────────
  { code:"EPSG:4326",  label:"WGS84 — Geographic Lat/Lng (GPS, universal)",
    proj4:"+proj=longlat +datum=WGS84 +no_defs", region:"Global", accuracy:"sub-metre" },

  // ── Nigeria ───────────────────────────────────────────────────────────────
  { code:"EPSG:26331", label:"Minna / UTM Zone 31N — SW Nigeria (Lagos, Ogun, Osun, Ondo, Ekiti)",
    proj4:"+proj=utm +zone=31 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs",
    region:"Nigeria", accuracy:"5-15m", notes:"Best available Minna→WGS84. 5-15m inherent. Use GCP for sub-metre." },
  { code:"EPSG:26332", label:"Minna / UTM Zone 32N — SE Nigeria (Rivers, Delta, Anambra)",
    proj4:"+proj=utm +zone=32 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs",
    region:"Nigeria", accuracy:"5-15m" },
  { code:"EPSG:26391", label:"Minna / Nigeria Zone 1 — Western Nigeria (legacy)",
    proj4:"+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs",
    region:"Nigeria", accuracy:"5-15m" },
  { code:"EPSG:26392", label:"Minna / Nigeria Zone 2 — Central Nigeria (legacy)",
    proj4:"+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs",
    region:"Nigeria", accuracy:"5-15m", notes:"lon_0=8.5 (corrected from common 10.5 error)" },
  { code:"EPSG:26393", label:"Minna / Nigeria Zone 3 — Eastern Nigeria (legacy)",
    proj4:"+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs",
    region:"Nigeria", accuracy:"5-15m" },

  // ── UK ────────────────────────────────────────────────────────────────────
  { code:"EPSG:27700", label:"British National Grid — OSGB36 (England, Scotland, Wales)",
    proj4:"+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
    region:"UK", accuracy:"1-5m", notes:"7-param Helmert. Sub-metre requires OSTN15 NTv2 grid." },
  { code:"EPSG:29900", label:"Irish National Grid — Ireland",
    proj4:"+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +a=6377340.189 +rf=299.3249646 +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs",
    region:"UK/Ireland", accuracy:"1-5m" },

  // ── France / Europe ───────────────────────────────────────────────────────
  { code:"EPSG:2154", label:"RGF93 / Lambert-93 — France",
    proj4:"+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Europe", accuracy:"sub-metre" },
  { code:"EPSG:25831", label:"ETRS89 / UTM Zone 31N — Western Europe",
    proj4:"+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Europe", accuracy:"sub-metre" },
  { code:"EPSG:25832", label:"ETRS89 / UTM Zone 32N — Central Europe",
    proj4:"+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Europe", accuracy:"sub-metre" },
  { code:"EPSG:25833", label:"ETRS89 / UTM Zone 33N — Eastern Europe",
    proj4:"+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Europe", accuracy:"sub-metre" },

  // ── USA / Canada ──────────────────────────────────────────────────────────
  { code:"EPSG:4269", label:"NAD83 — North America geographic",
    proj4:"+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
    region:"USA/Canada", accuracy:"sub-metre" },
  { code:"EPSG:26914", label:"NAD83 / UTM Zone 14N — Central USA",
    proj4:"+proj=utm +zone=14 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"USA", accuracy:"sub-metre" },
  { code:"EPSG:26917", label:"NAD83 / UTM Zone 17N — Eastern USA",
    proj4:"+proj=utm +zone=17 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"USA", accuracy:"sub-metre" },
  { code:"EPSG:26918", label:"NAD83 / UTM Zone 18N — Eastern USA / Canada",
    proj4:"+proj=utm +zone=18 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"USA/Canada", accuracy:"sub-metre" },

  // ── East Africa (Arc 1960) ────────────────────────────────────────────────
  { code:"EPSG:20137", label:"Arc 1960 / UTM Zone 37N — East Africa (Kenya, Uganda)",
    proj4:"+proj=utm +zone=37 +a=6378249.145 +rf=293.465 +towgs84=-166,-15,204,0,0,0,0 +units=m +no_defs",
    region:"East Africa", accuracy:"5-15m" },
  { code:"EPSG:20138", label:"Arc 1960 / UTM Zone 38N — East Africa (Tanzania)",
    proj4:"+proj=utm +zone=38 +a=6378249.145 +rf=293.465 +towgs84=-166,-15,204,0,0,0,0 +units=m +no_defs",
    region:"East Africa", accuracy:"5-15m" },
  { code:"EPSG:32636", label:"WGS84 / UTM Zone 36N — East Africa (modern GPS)",
    proj4:"+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs",
    region:"East Africa", accuracy:"sub-metre" },
  { code:"EPSG:32637", label:"WGS84 / UTM Zone 37N — East Africa (modern GPS)",
    proj4:"+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs",
    region:"East Africa", accuracy:"sub-metre" },

  // ── Ghana ─────────────────────────────────────────────────────────────────
  { code:"EPSG:2136", label:"Accra / Ghana National Grid — Ghana (legacy, feet)",
    proj4:"+proj=tmerc +lat_0=4.66666666666667 +lon_0=-1 +k=0.99975 +x_0=274319.739163358 +y_0=0 +a=6378300 +rf=296 +towgs84=-199,32,322,0,0,0,0 +to_meter=0.304799710181509 +no_defs",
    region:"Ghana", accuracy:"5-15m", notes:"Units in feet (Gold Coast foot). towgs84 for War Office ellipsoid." },
  { code:"EPSG:2137", label:"Accra / TM Ghana — Ghana (metres)",
    proj4:"+proj=tmerc +lat_0=0 +lon_0=-1 +k=0.9996 +x_0=500000 +y_0=0 +a=6378300 +rf=296 +towgs84=-199,32,322,0,0,0,0 +units=m +no_defs",
    region:"Ghana", accuracy:"5-15m" },
  { code:"EPSG:32630", label:"WGS84 / UTM Zone 30N — Ghana (modern GPS)",
    proj4:"+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs",
    region:"Ghana", accuracy:"sub-metre" },

  // ── South Africa ──────────────────────────────────────────────────────────
  { code:"EPSG:22287", label:"Cape / Lo27 — South Africa (legacy cadastral)",
    proj4:"+proj=tmerc +axis=wsu +lat_0=0 +lon_0=27 +k=1 +x_0=0 +y_0=0 +a=6378249.145 +rf=293.4663077 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs",
    region:"South Africa", accuracy:"5-15m", notes:"axis=wsu: Y increases southward. Coords are negative." },
  { code:"EPSG:2048", label:"Hartebeesthoek94 / Lo19 — South Africa (modern)",
    proj4:"+proj=tmerc +axis=wsu +lat_0=0 +lon_0=19 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"South Africa", accuracy:"sub-metre" },
  { code:"EPSG:4148", label:"Hartebeesthoek94 — South Africa geographic",
    proj4:"+proj=longlat +ellps=WGS84 +no_defs",
    region:"South Africa", accuracy:"sub-metre" },

  // ── Australia / NZ ────────────────────────────────────────────────────────
  { code:"EPSG:28354", label:"GDA94 / MGA Zone 54 — Eastern Australia",
    proj4:"+proj=utm +zone=54 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Australia", accuracy:"sub-metre" },
  { code:"EPSG:28355", label:"GDA94 / MGA Zone 55 — SE Australia",
    proj4:"+proj=utm +zone=55 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"Australia", accuracy:"sub-metre" },
  { code:"EPSG:2193",  label:"NZGD2000 / NZTM2000 — New Zealand",
    proj4:"+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    region:"New Zealand", accuracy:"sub-metre" },

  // ── Middle East ───────────────────────────────────────────────────────────
  { code:"EPSG:32637", label:"WGS84 / UTM Zone 37N — Arabian Peninsula",
    proj4:"+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs",
    region:"Middle East", accuracy:"sub-metre" },
  { code:"EPSG:32638", label:"WGS84 / UTM Zone 38N — Middle East",
    proj4:"+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs",
    region:"Middle East", accuracy:"sub-metre" },
  { code:"EPSG:32639", label:"WGS84 / UTM Zone 39N — Arabian Gulf",
    proj4:"+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs",
    region:"Middle East", accuracy:"sub-metre" },

  // ── India ─────────────────────────────────────────────────────────────────
  { code:"EPSG:32643", label:"WGS84 / UTM Zone 43N — Western India",
    proj4:"+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs",
    region:"India", accuracy:"sub-metre" },
  { code:"EPSG:32644", label:"WGS84 / UTM Zone 44N — Central India",
    proj4:"+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs",
    region:"India", accuracy:"sub-metre" },
  { code:"EPSG:32645", label:"WGS84 / UTM Zone 45N — Eastern India",
    proj4:"+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs",
    region:"India", accuracy:"sub-metre" },
];

// Add all WGS84 UTM zones (1–60 N and S) for complete global coverage
const WGS84_UTM: CrsDefinition[] = [];
for (let zone = 1; zone <= 60; zone++) {
  const northCode = `EPSG:${32600 + zone}`;
  const southCode = `EPSG:${32700 + zone}`;
  // Only add if not already in named list
  if (!CRS_NAMED.find(c => c.code === northCode)) {
    WGS84_UTM.push({
      code: northCode,
      label: `WGS84 / UTM Zone ${zone}N`,
      proj4: `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`,
      region: "Global",
      accuracy: "sub-metre",
    });
  }
  if (!CRS_NAMED.find(c => c.code === southCode)) {
    WGS84_UTM.push({
      code: southCode,
      label: `WGS84 / UTM Zone ${zone}S`,
      proj4: `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`,
      region: "Global",
      accuracy: "sub-metre",
    });
  }
}

export const CRS_REGISTRY: CrsDefinition[] = [...CRS_NAMED, ...WGS84_UTM];

export function getCrs(code: string): CrsDefinition | undefined {
  return CRS_REGISTRY.find(c => c.code === code);
}

export function registerAllCrs(proj4Instance: any): void {
  for (const crs of CRS_REGISTRY) {
    try { proj4Instance.defs(crs.code, crs.proj4); } catch { /* skip */ }
  }
}

export function getCrsByRegion(): Record<string, CrsDefinition[]> {
  const groups: Record<string, CrsDefinition[]> = {};
  for (const crs of CRS_NAMED) { // Only named for UI
    if (!groups[crs.region]) groups[crs.region] = [];
    groups[crs.region].push(crs);
  }
  return groups;
}

export const ACCURACY_STYLES: Record<string, string> = {
  "sub-metre": "text-green-400",
  "1-5m":      "text-blue-400",
  "5-15m":     "text-amber-400",
  "variable":  "text-gray-400",
};
