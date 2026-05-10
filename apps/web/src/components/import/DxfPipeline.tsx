/**
 * DXF Pipeline
 *
 * Flow:
 * 1. Parse DXF in-browser using dxf-parser
 * 2. Extract closed polylines/lwpolylines as candidate parcel boundaries
 * 3. Detect if coordinates are real-world (large values = projected) or local (small values)
 * 4. Real-world coords → convert to GeoJSON directly (assume EPSG:4326 or let user pick CRS)
 * 5. Local coords → show georeferencing UI (user picks 2 anchor points on the map)
 */
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, MapPin, ChevronRight } from "lucide-react";
import proj4 from "proj4";

import { CRS_NAMED, registerAllCrs, ACCURACY_STYLES } from "@/lib/crs-registry";
registerAllCrs(proj4);

function reprojectPolygon(pts: Array<[number, number]>, fromCrs: string): Array<[number, number]> {
  if (fromCrs === "EPSG:4326") return pts;
  try {
    return pts.map(([x, y]) => {
      const [lng, lat] = proj4(fromCrs, "EPSG:4326", [x, y]);
      return [lng, lat] as [number, number];
    });
  } catch {
    return pts;
  }
}
import type { ExtractedPlan } from "./ImportPlanModal";

// We load dxf-parser dynamically to avoid SSR issues
async function parseDxf(text: string): Promise<any> {
  const DxfParser = (await import("dxf-parser")).default;
  const parser = new DxfParser();
  return parser.parseSync(text);
}

function extractPolygons(dxf: any): Array<Array<[number, number]>> {
  const polygons: Array<Array<[number, number]>> = [];

  const entities = dxf?.entities ?? [];
  for (const entity of entities) {
    // LWPOLYLINE and POLYLINE with closed flag
    if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
      if (entity.shape || entity.closed) {
        const pts: Array<[number, number]> = (entity.vertices ?? []).map(
          (v: any) => [v.x as number, v.y as number]
        );
        if (pts.length >= 3) polygons.push(pts);
      }
    }
    // LINE entities that form a closed loop (less common, skip for now)
  }

  return polygons;
}

function isRealWorldCoords(polygons: Array<Array<[number, number]>>): boolean {
  // Real-world projected coords (e.g. UTM, Minna) are typically > 10,000
  // Local/arbitrary coords are typically < 1,000
  if (!polygons.length) return false;
  const [x, y] = polygons[0][0];
  return Math.abs(x) > 10000 || Math.abs(y) > 10000;
}

function polygonToGeoJson(pts: Array<[number, number]>, crs: string): GeoJSON.Polygon {
  const wgs84 = reprojectPolygon(pts, crs);
  const ring = [...wgs84, wgs84[0]]; // close the ring
  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

interface Props {
  file: File;
  onExtracted: (plan: ExtractedPlan) => void;
  onError: (msg: string) => void;
  onBack: () => void;
}

export function DxfPipeline({ file, onExtracted, onError, onBack }: Props) {
  const [status, setStatus] = useState<"parsing" | "selecting" | "georef" | "error">("parsing");
  const [polygons, setPolygons] = useState<Array<Array<[number, number]>>>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [realWorld, setRealWorld] = useState(false);
  const [crsInput, setCrsInput] = useState("EPSG:4326");

  useEffect(() => {
    (async () => {
      try {
        const text = await file.text();
        const dxf = await parseDxf(text);
        const polys = extractPolygons(dxf);

        if (!polys.length) {
          onError("No closed polylines found in this DXF file. Ensure parcel boundaries are drawn as closed LWPOLYLINE or POLYLINE entities.");
          return;
        }

        setPolygons(polys);
        setRealWorld(isRealWorldCoords(polys));
        setStatus("selecting");
      } catch (err: any) {
        onError(`DXF parse failed: ${err.message ?? "Unknown error"}`);
      }
    })();
  }, [file]);

  function handleConfirmSelection() {
    const pts = polygons[selectedIdx];
    const geoJson = polygonToGeoJson(pts, crsInput);

    onExtracted({
      type: "dxf",
      fileName: file.name,
      geoJson,
      crs: crsInput,
      confidence: realWorld ? "high" : "manual",
      metadata: {
        originalCrs: crsInput,
      },
    });
  }

  if (status === "parsing") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={28} className="animate-spin text-blue-400" />
        <p className="text-gray-400 text-sm">Parsing DXF file...</p>
        <p className="text-gray-600 text-xs">{file.name}</p>
      </div>
    );
  }

  if (status === "selecting") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <MapPin size={14} />
          <span>Found <strong>{polygons.length}</strong> closed polygon{polygons.length !== 1 ? "s" : ""} in {file.name}</span>
        </div>

        {/* Coordinate type badge */}
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
          realWorld
            ? "bg-green-900/20 border-green-800 text-green-400"
            : "bg-amber-900/20 border-amber-800 text-amber-400"
        }`}>
          <AlertCircle size={12} className="shrink-0" />
          {realWorld
            ? "Real-world coordinates detected — polygon will be placed automatically."
            : "Local/arbitrary coordinates detected — you'll need to specify the CRS or georeference manually after import."
          }
        </div>

        {/* Polygon list */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {polygons.map((poly, i) => {
            const xs = poly.map(p => p[0]);
            const ys = poly.map(p => p[1]);
            const w = (Math.max(...xs) - Math.min(...xs)).toFixed(2);
            const h = (Math.max(...ys) - Math.min(...ys)).toFixed(2);
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors
                  ${selectedIdx === i
                    ? "border-blue-500 bg-blue-950/30 text-white"
                    : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-500"
                  }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">Polygon {i + 1}</span>
                  <span className="text-xs text-gray-500">{poly.length} vertices</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 font-mono">
                  W: {w} · H: {h} · Origin: ({poly[0][0].toFixed(1)}, {poly[0][1].toFixed(1)})
                </div>
              </button>
            );
          })}
        </div>

        {/* CRS selector */}
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Coordinate Reference System (CRS)</label>
          <select
            value={crsInput}
            onChange={(e) => setCrsInput(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                       focus:outline-none focus:border-blue-500 transition-colors"
          >
            {CRS_NAMED.map(o => (
              <option key={o.code} value={o.code}>{o.label} (±{o.accuracy})</option>
            ))}
            <option value="local">Local / Unknown — manual georeferencing needed</option>
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onBack}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleConfirmSelection}
            className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium
                       transition-colors flex items-center justify-center gap-1.5"
          >
            Use Polygon {selectedIdx + 1} <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
