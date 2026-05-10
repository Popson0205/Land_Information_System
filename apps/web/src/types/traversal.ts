/**
 * Traversal-based parcel mapping data model.
 *
 * This is the canonical format for BOTH:
 * - Manual entry (AutoCAD-style: start point → bearing/distance legs → close)
 * - GeoAI extraction (reading the same data from a scanned survey plan)
 *
 * Computation: dE = dist × sin(bearing_rad), dN = dist × cos(bearing_rad)
 */

export type FenceType = "W/F" | "C/F" | "B/W" | "ROAD" | "STREAM" | "NONE" | string;
export type CrsCode =
  | "EPSG:4326"   // WGS84
  | "EPSG:4263"   // Minna / Clarke 1880
  | "EPSG:26331"  // Minna UTM Zone 31N (SW Nigeria: Lagos, Ogun, Osun, Ondo)
  | "EPSG:26332"  // Minna UTM Zone 32N (SE Nigeria)
  | "EPSG:26391"  // Minna Nigeria Zone 1 (legacy)
  | "EPSG:26392"  // Minna Nigeria Zone 2 (legacy)
  | "EPSG:32632"  // WGS84 UTM Zone 32N
  | "EPSG:32633"  // WGS84 UTM Zone 33N
  | string;

export interface TraversalStartPoint {
  beaconLabel: string;       // e.g. "BB8215JP"
  northing: number;          // in native CRS units (metres for UTM)
  easting: number;
  crs: CrsCode;
}

export interface TraversalLeg {
  id: string;                // uuid for React key
  fromBeacon: string;        // e.g. "BB8215JP"
  toBeacon: string;          // e.g. "BB8216JP"
  bearingDeg: number;        // whole degrees
  bearingMin: number;        // minutes (0–59)
  bearingSec: number;        // seconds (0–59), often 0 on Nigerian plans
  distanceM: number;         // metres
  fenceType: FenceType;
}

export interface TraversalPlan {
  startPoint: TraversalStartPoint;
  legs: TraversalLeg[];
  // Computed after all legs entered
  closureErrorM?: number;
  computedAreaSqm?: number;
  // Full parcel metadata — pre-filled from GeoAI, edited by user before registration
  metadata: ParcelRegistrationData;
}

export interface ParcelRegistrationData {
  // Parcel identity
  parcelNumber: string;
  // Land title
  ownerName: string;
  ownerIdNumber: string;     // NIN or Company RC number
  titleNumber: string;
  titleType: "freehold" | "leasehold" | "customary" | "";
  issueDate: string;
  expiryDate: string;        // leasehold only
  registeredBy: string;
  // Location
  address: string;
  village: string;
  lga: string;
  state: string;
  // Survey
  surveyorName: string;
  surveyDate: string;
  planRef: string;
  osAppsn: string;           // e.g. "OS-APPSN 01S"
  scale: string;             // e.g. "1:500"
  declaredAreaSqm: number | null;
  // Zoning
  zoneCode: string;
  zoneLabel: string;
  maxHeightM: number | null;
  floorAreaRatio: number | null;
  // Notes
  notes: string;
}

export const EMPTY_METADATA: ParcelRegistrationData = {
  parcelNumber: "",
  ownerName: "",
  ownerIdNumber: "",
  titleNumber: "",
  titleType: "",
  issueDate: "",
  expiryDate: "",
  registeredBy: "",
  address: "",
  village: "",
  lga: "",
  state: "",
  surveyorName: "",
  surveyDate: "",
  planRef: "",
  osAppsn: "",
  scale: "1:500",
  declaredAreaSqm: null,
  zoneCode: "",
  zoneLabel: "",
  maxHeightM: null,
  floorAreaRatio: null,
  notes: "",
};

/** Convert bearing DMS to decimal degrees */
export function bearingToDecimal(deg: number, min: number, sec = 0): number {
  return deg + min / 60 + sec / 3600;
}

/** Compute polygon coordinates from traversal (returns [easting, northing] pairs in native CRS) */
export function computeTraversal(
  start: TraversalStartPoint,
  legs: TraversalLeg[]
): Array<[number, number]> {
  const coords: Array<[number, number]> = [[start.easting, start.northing]];
  let curE = start.easting;
  let curN = start.northing;

  for (const leg of legs) {
    const bearingRad = (bearingToDecimal(leg.bearingDeg, leg.bearingMin, leg.bearingSec) * Math.PI) / 180;
    curE += leg.distanceM * Math.sin(bearingRad);
    curN += leg.distanceM * Math.cos(bearingRad);
    coords.push([curE, curN]);
  }
  return coords;
}

/** Compute closure error in metres (distance from last computed point back to start) */
export function computeClosureError(coords: Array<[number, number]>): number {
  if (coords.length < 2) return 0;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const dE = last[0] - first[0];
  const dN = last[1] - first[1];
  return Math.sqrt(dE * dE + dN * dN);
}

/** Compute area using Shoelace formula (square metres) */
export function computeArea(coords: Array<[number, number]>): number {
  const n = coords.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
}
