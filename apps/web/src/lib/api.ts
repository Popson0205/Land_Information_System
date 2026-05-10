const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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

export async function analyzeWithGeoAI(imageBase64: string, mimeType: string) {
  const res = await fetch(`${API_URL}/api/geoai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  if (!res.ok) throw new Error(`GeoAI analysis failed: ${res.statusText}`);
  return res.json();
}
