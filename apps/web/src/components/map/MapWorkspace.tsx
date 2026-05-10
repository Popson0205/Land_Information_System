import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { fetchParcels } from "@/lib/api";
import type { ParcelFeature } from "@/types/parcel";

const PARCEL_SOURCE = "parcels";
const PARCEL_FILL_LAYER = "parcels-fill";
const PARCEL_OUTLINE_LAYER = "parcels-outline";
const PARCEL_DISPUTED_LAYER = "parcels-disputed";

// Status → fill color expression
const STATUS_COLOR = [
  "match",
  ["get", "status"],
  "active",   "#1B4F72",
  "disputed", "#C0392B",
  "archived", "#636e72",
  "#1B4F72",
] as any;

interface Props {
  onParcelClick: (parcel: ParcelFeature) => void;
}

export function MapWorkspace({ onParcelClick }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  const loadParcels = useCallback(async () => {
    if (!map.current) return;
    try {
      const geojson = await fetchParcels();
      const source = map.current.getSource(PARCEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      }
    } catch (err) {
      console.error("Failed to load parcels:", err);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: import.meta.env.VITE_MAPLIBRE_STYLE ?? "https://demotiles.maplibre.org/style.json",
      center: [3.3792, 6.4550], // Lagos Island default
      zoom: 13,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.current.on("load", async () => {
      if (!map.current) return;

      // Add parcel source (empty initially)
      map.current.addSource(PARCEL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      // Fill layer — status-based color
      map.current.addLayer({
        id: PARCEL_FILL_LAYER,
        type: "fill",
        source: PARCEL_SOURCE,
        paint: {
          "fill-color": STATUS_COLOR,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.5,
            0.25,
          ],
        },
      });

      // Outline layer
      map.current.addLayer({
        id: PARCEL_OUTLINE_LAYER,
        type: "line",
        source: PARCEL_SOURCE,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#F1C40F",
            STATUS_COLOR,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1.5,
          ],
        },
      });

      // Disputed parcel hatch pattern (red dashed outline)
      map.current.addLayer({
        id: PARCEL_DISPUTED_LAYER,
        type: "line",
        source: PARCEL_SOURCE,
        filter: ["==", ["get", "status"], "disputed"],
        paint: {
          "line-color": "#C0392B",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      });

      // Load parcels from API
      await loadParcels();

      // ─── Hover state ────────────────────────────────────────────────────────
      let hoveredId: number | string | null = null;

      map.current.on("mousemove", PARCEL_FILL_LAYER, (e) => {
        if (!map.current || !e.features?.length) return;
        map.current.getCanvas().style.cursor = "pointer";
        if (hoveredId !== null) {
          map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: false });
        }
        hoveredId = e.features[0].id ?? null;
        if (hoveredId !== null) {
          map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: true });
        }
      });

      map.current.on("mouseleave", PARCEL_FILL_LAYER, () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        if (hoveredId !== null) {
          map.current.setFeatureState({ source: PARCEL_SOURCE, id: hoveredId }, { hover: false });
        }
        hoveredId = null;
      });

      // ─── Click → open side panel ─────────────────────────────────────────
      map.current.on("click", PARCEL_FILL_LAYER, (e) => {
        if (!e.features?.length) return;
        const feature = e.features[0] as unknown as ParcelFeature;
        onParcelClick(feature);
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [loadParcels, onParcelClick]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Reload parcels button */}
      <button
        onClick={loadParcels}
        className="absolute top-4 left-4 z-10 bg-gray-900 border border-gray-700 text-gray-300
                   hover:bg-gray-800 hover:text-white px-3 py-1.5 rounded-md text-sm font-medium
                   transition-colors shadow-lg"
      >
        ↺ Refresh Parcels
      </button>
    </div>
  );
}
