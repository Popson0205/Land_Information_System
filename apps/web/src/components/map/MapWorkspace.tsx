import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { fetchParcels } from "@/lib/api";
import type { ParcelFeature } from "@/types/parcel";
import type { ExtractedPlan } from "@/components/import/ImportPlanModal";

const PARCEL_SOURCE = "parcels";
const PARCEL_FILL_LAYER = "parcels-fill";
const PARCEL_OUTLINE_LAYER = "parcels-outline";
const PARCEL_DISPUTED_LAYER = "parcels-disputed";
const PREVIEW_SOURCE = "preview-parcel";
const PREVIEW_FILL_LAYER = "preview-fill";
const PREVIEW_OUTLINE_LAYER = "preview-outline";

const STATUS_COLOR = [
  "match", ["get", "status"],
  "active",   "#27AE60",
  "disputed", "#E74C3C",
  "archived", "#95a5a6",
  "#27AE60",
] as any;

const GOOGLE_HYBRID_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "google-hybrid": {
      type: "raster",
      tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
      tileSize: 256,
      attribution: "© Google Maps",
      maxzoom: 22,
    },
  },
  layers: [{
    id: "google-hybrid-layer",
    type: "raster",
    source: "google-hybrid",
    minzoom: 0,
    maxzoom: 22,
  }],
};

interface Props {
  onParcelClick: (parcel: ParcelFeature) => void;
  previewPlan: ExtractedPlan | null;
  onRefreshReady: (fn: () => void) => void;
  onFlyToReady: (fn: (parcelId: string) => void) => void;
}

export function MapWorkspace({ onParcelClick, previewPlan, onRefreshReady, onFlyToReady }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapLoaded = useRef(false);

  const flyToParcel = useCallback(async (parcelId: string) => {
    if (!map.current || !mapLoaded.current) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
      const res = await fetch(`${API_URL}/api/parcels/${parcelId}`);
      if (!res.ok) return;
      const data = await res.json();
      const geom = data.geometry;
      if (!geom) return;

      // Get all coordinates from the geometry
      const allCoords: number[][] = [];
      const extract = (coords: any) => {
        if (typeof coords[0] === "number") allCoords.push(coords);
        else coords.forEach(extract);
      };
      extract(geom.coordinates);

      if (!allCoords.length) return;

      const lngs = allCoords.map(c => c[0]);
      const lats = allCoords.map(c => c[1]);

      map.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 100, maxZoom: 19, duration: 1500 }
      );

      // Flash highlight the new parcel
      setTimeout(() => {
        if (!map.current) return;
        map.current.setPaintProperty(PREVIEW_FILL_LAYER, "fill-color", "#27AE60");
        map.current.setPaintProperty(PREVIEW_FILL_LAYER, "fill-opacity", 0.4);
        setTimeout(() => {
          map.current?.setPaintProperty(PREVIEW_FILL_LAYER, "fill-color", "#F1C40F");
          map.current?.setPaintProperty(PREVIEW_FILL_LAYER, "fill-opacity", 0.25);
        }, 1200);
      }, 800);
    } catch { /* ignore */ }
  }, []);

  // Expose flyToParcel to parent
  useEffect(() => {
    onFlyToReady(flyToParcel);
  }, [flyToParcel, onFlyToReady]);

  const loadParcels = useCallback(async () => {
    if (!map.current || !mapLoaded.current) return;
    try {
      const geojson = await fetchParcels();
      const source = map.current.getSource(PARCEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(geojson);
    } catch (err) {
      console.error("Failed to load parcels:", err);
    }
  }, []);

  // Expose loadParcels to parent so it can trigger refresh after registration
  useEffect(() => {
    onRefreshReady(loadParcels);
  }, [loadParcels, onRefreshReady]);

  // Preview layer — show extracted plan polygon on map
  useEffect(() => {
    if (!map.current || !mapLoaded.current) return;

    const previewSource = map.current.getSource(PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;

    if (!previewPlan?.geoJson) {
      // Clear preview
      previewSource?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const feature: GeoJSON.Feature = {
      type: "Feature",
      geometry: previewPlan.geoJson,
      properties: { confidence: previewPlan.confidence },
    };
    previewSource?.setData({ type: "FeatureCollection", features: [feature] });

    // Fly to preview polygon
    try {
      const coords = previewPlan.geoJson.type === "Polygon"
        ? previewPlan.geoJson.coordinates[0]
        : (previewPlan.geoJson as any).coordinates[0][0];

      if (coords?.length) {
        const lngs = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        map.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 120, maxZoom: 18, duration: 1200 }
        );
      }
    } catch { /* ignore fit errors */ }
  }, [previewPlan]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: GOOGLE_HYBRID_STYLE,
      center: [3.3792, 6.4550],
      zoom: 15,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.current.on("load", async () => {
      if (!map.current) return;
      mapLoaded.current = true;

      // ─── Registered parcels source & layers ──────────────────────────────
      map.current.addSource(PARCEL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      map.current.addLayer({
        id: PARCEL_FILL_LAYER, type: "fill", source: PARCEL_SOURCE,
        paint: {
          "fill-color": STATUS_COLOR,
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.45, 0.2],
        },
      });

      map.current.addLayer({
        id: PARCEL_OUTLINE_LAYER, type: "line", source: PARCEL_SOURCE,
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#F1C40F", STATUS_COLOR],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 2],
        },
      });

      map.current.addLayer({
        id: PARCEL_DISPUTED_LAYER, type: "line", source: PARCEL_SOURCE,
        filter: ["==", ["get", "status"], "disputed"],
        paint: { "line-color": "#E74C3C", "line-width": 2, "line-dasharray": [4, 2] },
      });

      // ─── Preview source & layers (for import flow) ────────────────────────
      map.current.addSource(PREVIEW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.current.addLayer({
        id: PREVIEW_FILL_LAYER, type: "fill", source: PREVIEW_SOURCE,
        paint: { "fill-color": "#F1C40F", "fill-opacity": 0.25 },
      });

      map.current.addLayer({
        id: PREVIEW_OUTLINE_LAYER, type: "line", source: PREVIEW_SOURCE,
        paint: {
          "line-color": "#F1C40F",
          "line-width": 3,
          "line-dasharray": [6, 3],
        },
      });

      await loadParcels();

      // ─── Hover ────────────────────────────────────────────────────────────
      let hoveredId: number | string | null = null;
      map.current.on("mousemove", PARCEL_FILL_LAYER, (e) => {
        if (!map.current || !e.features?.length) return;
        map.current.getCanvas().style.cursor = "pointer";
        if (hoveredId !== null) map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: false });
        hoveredId = e.features[0].id ?? null;
        if (hoveredId !== null) map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: true });
      });
      map.current.on("mouseleave", PARCEL_FILL_LAYER, () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        if (hoveredId !== null) map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: false });
        hoveredId = null;
      });

      // ─── Click ────────────────────────────────────────────────────────────
      map.current.on("click", PARCEL_FILL_LAYER, (e) => {
        if (!e.features?.length) return;
        onParcelClick(e.features[0] as unknown as ParcelFeature);
      });
    });

    return () => { map.current?.remove(); map.current = null; mapLoaded.current = false; };
  }, [loadParcels, onParcelClick]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Preview badge */}
      {previewPlan && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-yellow-900/90 border border-yellow-600
                        text-yellow-300 text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-sm font-medium">
          ⬡ Preview — confirm in the import panel to register
        </div>
      )}

      <button
        onClick={loadParcels}
        className="absolute bottom-8 left-4 z-10 bg-gray-900/80 border border-gray-700 text-gray-300
                   hover:bg-gray-800 hover:text-white px-3 py-1.5 rounded-md text-sm font-medium
                   transition-colors shadow-lg backdrop-blur-sm"
      >
        ↺ Refresh Parcels
      </button>
    </div>
  );
}
