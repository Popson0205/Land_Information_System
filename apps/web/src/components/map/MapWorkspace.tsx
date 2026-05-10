import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { fetchParcels } from "@/lib/api";
import type { ParcelFeature } from "@/types/parcel";

const PARCEL_SOURCE = "parcels";
const PARCEL_FILL_LAYER = "parcels-fill";
const PARCEL_OUTLINE_LAYER = "parcels-outline";
const PARCEL_DISPUTED_LAYER = "parcels-disputed";

const STATUS_COLOR = [
  "match",
  ["get", "status"],
  "active",   "#27AE60",
  "disputed", "#E74C3C",
  "archived", "#95a5a6",
  "#27AE60",
] as any;

// Google Hybrid basemap (satellite + labels) — high resolution
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
  layers: [
    {
      id: "google-hybrid-layer",
      type: "raster",
      source: "google-hybrid",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

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
      style: GOOGLE_HYBRID_STYLE,
      center: [3.3792, 6.4550], // Lagos Island
      zoom: 15,                 // higher default zoom — satellite needs it
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.current.on("load", async () => {
      if (!map.current) return;

      map.current.addSource(PARCEL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      // Fill — semi-transparent over satellite
      map.current.addLayer({
        id: PARCEL_FILL_LAYER,
        type: "fill",
        source: PARCEL_SOURCE,
        paint: {
          "fill-color": STATUS_COLOR,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.45,
            0.2,
          ],
        },
      });

      // Outline — bright so it reads over imagery
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
            2,
          ],
        },
      });

      // Disputed — red dashed outline
      map.current.addLayer({
        id: PARCEL_DISPUTED_LAYER,
        type: "line",
        source: PARCEL_SOURCE,
        filter: ["==", ["get", "status"], "disputed"],
        paint: {
          "line-color": "#E74C3C",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      });

      await loadParcels();

      // Hover state
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

      // Click → side panel
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
      <button
        onClick={loadParcels}
        className="absolute top-4 left-4 z-10 bg-gray-900/80 border border-gray-700 text-gray-300
                   hover:bg-gray-800 hover:text-white px-3 py-1.5 rounded-md text-sm font-medium
                   transition-colors shadow-lg backdrop-blur-sm"
      >
        ↺ Refresh Parcels
      </button>
    </div>
  );
}
