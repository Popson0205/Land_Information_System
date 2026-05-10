export interface ParcelProperties {
  id: string;
  parcelNumber: string;
  status: "active" | "disputed" | "archived";
  areaSqm: number | null;
  perimeterM: number | null;
  ownerName: string | null;
  titleNumber: string | null;
  titleType: string | null;
  zoneCode: string | null;
  zoneLabel: string | null;
  hasDispute: boolean;
  hasEncumbrance: boolean;
  notes: string | null;
}

export interface ParcelFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSON.MultiPolygon;
  properties: ParcelProperties;
}

export interface ParcelDetail extends ParcelProperties {
  geometry: GeoJSON.MultiPolygon;
  createdAt: string;
  updatedAt: string;
  titles: any[];
  transactions: any[];
  encumbrances: any[];
  zoning: any[];
  surveys: any[];
  valuations: any[];
  disputes: any[];
}
