// API base URL — set VITE_API_URL in Render environment before building
// Falls back to localhost only for local development
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export async function fetchParcels(params?: {
  status?: string;
  bbox?: [number, number, number, number];
}): Promise<GeoJSON.FeatureCollection> {
  const url = new URL(`${API_URL}/api/parcels`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.bbox) url.searchParams.set("bbox", params.bbox.join(","));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch parcels: ${res.statusText}`);
  return res.json();
}

export async function fetchParcelDetail(id: string) {
  const res = await fetch(`${API_URL}/api/parcels/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch parcel: ${res.statusText}`);
  return res.json();
}

export function getApiUrl(): string {
  return API_URL;
}
