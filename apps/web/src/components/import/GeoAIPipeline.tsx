/**
 * GeoAI Pipeline
 *
 * Flow:
 * 1. Read file as base64
 * 2. POST to /api/geoai/analyze with image data
 * 3. Show extraction results (CRS, points, confidence)
 * 4. Reproject coordinates from native CRS → WGS84 using proj4
 * 5. Pass extracted plan to parent for confirmation
 */
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, ChevronRight, Eye } from "lucide-react";
import proj4 from "proj4";
import { getApiUrl } from "@/lib/api";
import type { ExtractedPlan } from "./ImportPlanModal";

import { registerAllCrs } from "@/lib/crs-registry";
// Register all CRS from authoritative registry (replaces hardcoded defs)
registerAllCrs(proj4);

function reprojectToWgs84(
  points: Array<{ northing: number; easting: number }>,
  fromCrs: string
): Array<[number, number]> {
  if (fromCrs === "EPSG:4326") {
    // Already WGS84 — easting=lng, northing=lat
    return points.map((p) => [p.easting, p.northing]);
  }
  try {
    return points.map((p) => {
      const [lng, lat] = proj4(fromCrs, "EPSG:4326", [p.easting, p.northing]);
      return [lng, lat];
    });
  } catch {
    // Fallback — treat as WGS84
    return points.map((p) => [p.easting, p.northing]);
  }
}

function computeClosureError(original: Array<[number, number]>): number {
  if (original.length < 2) return 0;
  const first = original[0];
  const last = original[original.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  // Approximate metres (1 degree ≈ 111,000 m)
  return Math.sqrt((dx * 111000) ** 2 + (dy * 111000) ** 2);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function mimeFromFile(file: File, fileType: "image" | "pdf"): string {
  if (fileType === "pdf") return "application/pdf";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "tiff" || ext === "tif") return "image/tiff";
  return "image/jpeg";
}

interface Props {
  file: File;
  fileType: "image" | "pdf";
  onExtracted: (plan: ExtractedPlan) => void;
  onError: (msg: string) => void;
  onBack: () => void;
}

export function GeoAIPipeline({ file, fileType, onExtracted, onError, onBack }: Props) {
  const [status, setStatus] = useState<"analyzing" | "review" | "reprojecting" | "error">("analyzing");
  const [extraction, setExtraction] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  

  useEffect(() => {
    (async () => {
      try {
        const base64 = await fileToBase64(file);
        const mime = mimeFromFile(file, fileType);

        const res = await fetch(`${getApiUrl()}/api/geoai/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: mime }),
        });

        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            res.ok
              ? `Server returned invalid response (status ${res.status})`
              : `API error ${res.status}: ${text.slice(0, 200) || "empty response"}`
          );
        }
        if (!res.ok) {
          throw new Error(data?.error ?? `API error ${res.status}`);
        }
        setExtraction(data.extraction);
        setStatus("review");
      } catch (err: any) {
        setApiError(err.message ?? "GeoAI analysis failed.");
        setStatus("error");
      }
    })();
  }, [file, fileType]);

  function handleProceed() {
    if (!extraction) return;
    setStatus("reprojecting");

    try {
      const crs: string = extraction.crs ?? "EPSG:4326";
      let geoJson: GeoJSON.Polygon | null = null;
      let closureErrorM = 0;
      let traversal = undefined;

      // New traversal format (startPoint + legs)
      if (extraction.startPoint && extraction.legs && extraction.legs.length >= 3) {
        const start = extraction.startPoint;
        // Compute projected coords first
        let curE = start.easting;
        let curN = start.northing;
        const projCoords: Array<[number, number]> = [[curE, curN]];

        for (const leg of extraction.legs) {
          const bearingDec = leg.bearingDeg + leg.bearingMin / 60 + (leg.bearingSec ?? 0) / 3600;
          const bearingRad = (bearingDec * Math.PI) / 180;
          curE += leg.distanceM * Math.sin(bearingRad);
          curN += leg.distanceM * Math.cos(bearingRad);
          projCoords.push([curE, curN]);
        }

        // Closure error
        const dE = projCoords[projCoords.length-1][0] - projCoords[0][0];
        const dN = projCoords[projCoords.length-1][1] - projCoords[0][1];
        closureErrorM = Math.sqrt(dE*dE + dN*dN);

        // Reproject to WGS84
        const wgs84Coords = projCoords.map(([e, n]) => reprojectToWgs84([{easting: e, northing: n}], crs)[0]);
        geoJson = { type: "Polygon", coordinates: [[...wgs84Coords, wgs84Coords[0]]] };

        traversal = { startPoint: extraction.startPoint, legs: extraction.legs };
      }

      onExtracted({
        type: "scan",
        fileName: file.name,
        geoJson,
        crs: "EPSG:4326",
        confidence: extraction.confidence ?? "medium",
        closureErrorM,
        metadata: {
          surveyorName: extraction.metadata?.surveyorName || undefined,
          surveyDate: extraction.metadata?.surveyDate || undefined,
          planRef: extraction.metadata?.planRef || undefined,
          originalCrs: crs,
          declaredAreaSqm: extraction.metadata?.declaredAreaSqm ?? null,
          ownerName: extraction.metadata?.ownerName || undefined,
          village: extraction.metadata?.village || undefined,
          lga: extraction.metadata?.lga || undefined,
          state: extraction.metadata?.state || undefined,
          osAppsn: extraction.metadata?.osAppsn || undefined,
          scale: extraction.metadata?.scale || undefined,
          address: extraction.metadata?.address || undefined,
        },
        traversal,
        rawExtraction: extraction,
      });
    } catch (err: any) {
      setApiError(`Reprojection failed: ${err.message}`);
      setStatus("error");
    }
  }

  // ─── Analyzing ───────────────────────────────────────────────────────────
  if (status === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="relative">
          <Loader2 size={32} className="animate-spin text-blue-400" />
        </div>
        <div className="text-center">
          <p className="text-gray-300 text-sm font-medium">Reading survey plan with GeoAI...</p>
          <p className="text-gray-600 text-xs mt-1">Extracting coordinates, CRS, and metadata</p>
          <p className="text-gray-700 text-xs mt-2 font-mono">{file.name}</p>
        </div>
        <div className="flex gap-2 text-xs text-gray-600 mt-2">
          <Step label="OCR" done />
          <span className="text-gray-700">→</span>
          <Step label="Parse" active />
          <span className="text-gray-700">→</span>
          <Step label="Reproject" />
          <span className="text-gray-700">→</span>
          <Step label="Place" />
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-950/30 border border-red-900/50 rounded-lg p-4">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-medium">GeoAI extraction failed</p>
            <p className="text-red-400/70 text-xs mt-1">{apiError}</p>
          </div>
        </div>
        <p className="text-gray-500 text-xs">
          This can happen if the plan image is too low resolution, heavily handwritten, or the OPENAI_API_KEY is not set on the server.
        </p>
        <button
          onClick={onBack}
          className="w-full px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors"
        >
          ← Try another file
        </button>
      </div>
    );
  }

  // ─── Review extraction results ────────────────────────────────────────────
  if (status === "review" && extraction) {
    const CONF_STYLES: Record<string, string> = {
      high:   "bg-green-900/40 text-green-400 border-green-700",
      medium: "bg-amber-900/40 text-amber-400 border-amber-700",
      low:    "bg-red-900/40 text-red-400 border-red-700",
    };

    const points: any[] = extraction.points ?? [];
    const metes: any[] = extraction.metesAndBounds ?? [];

    return (
      <div className="space-y-4">
        {/* Confidence */}
        <div className="flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <span className="text-sm text-gray-200 font-medium">Extraction complete</span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CONF_STYLES[extraction.confidence] ?? CONF_STYLES.medium}`}>
            {extraction.confidence} confidence
          </span>
        </div>

        {/* CRS */}
        <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
          <ExRow label="CRS detected" value={`${extraction.crsLabel ?? ""} (${extraction.crs ?? "unknown"})`} />
          <ExRow label="Points found" value={`${points.length} corner points`} />
          <ExRow label="Metes & bounds" value={metes.length ? `${metes.length} bearing-distance pairs` : "None"} />
          {extraction.metadata?.surveyorName && <ExRow label="Surveyor" value={extraction.metadata.surveyorName} />}
          {extraction.metadata?.surveyDate && <ExRow label="Date" value={extraction.metadata.surveyDate} />}
          {extraction.metadata?.planRef && <ExRow label="Plan Ref" value={extraction.metadata.planRef} />}
          {extraction.metadata?.declaredAreaSqm && <ExRow label="Declared Area" value={`${Number(extraction.metadata.declaredAreaSqm).toLocaleString()} m²`} />}
        </div>

        {/* Points table */}
        {points.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Extracted corner coordinates</p>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Pt</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Northing</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Easting</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice(0, 8).map((pt: any, i: number) => (
                    <tr key={i} className="border-b border-gray-700/50 last:border-0">
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{pt.label ?? i + 1}</td>
                      <td className="px-3 py-1.5 text-gray-300 font-mono text-right">{Number(pt.northing).toFixed(3)}</td>
                      <td className="px-3 py-1.5 text-gray-300 font-mono text-right">{Number(pt.easting).toFixed(3)}</td>
                    </tr>
                  ))}
                  {points.length > 8 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 text-gray-600 text-center">
                        +{points.length - 8} more points
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AI notes */}
        {extraction.notes && (
          <div className="text-xs text-amber-400/80 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
            ⚠ {extraction.notes}
          </div>
        )}

        {/* No geometry warning */}
        {points.length < 3 && (
          <div className="flex items-start gap-2 text-red-400 text-xs bg-red-950/20 border border-red-900/40 rounded-lg px-3 py-2">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            Fewer than 3 corner points extracted — cannot reconstruct polygon. The parcel will be registered without geometry. You can add geometry later via manual drawing.
          </div>
        )}

        {/* Raw JSON toggle */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          <Eye size={11} /> {showRaw ? "Hide" : "Show"} raw extraction JSON
        </button>
        {showRaw && (
          <pre className="text-xs text-gray-500 bg-gray-800 rounded-lg p-3 overflow-x-auto max-h-40">
            {JSON.stringify(extraction, null, 2)}
          </pre>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onBack}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleProceed}
            className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium
                       transition-colors flex items-center justify-center gap-1.5"
          >
            Place on Map <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Reprojecting
  if (status === "reprojecting") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={24} className="animate-spin text-blue-400" />
        <p className="text-gray-400 text-sm">Reprojecting to WGS84...</p>
      </div>
    );
  }

  return null;
}

function ExRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0 text-xs">{label}</span>
      <span className="text-gray-200 text-right text-xs font-mono truncate">{value}</span>
    </div>
  );
}

function Step({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <span className={`text-xs ${done ? "text-green-400" : active ? "text-blue-400" : "text-gray-700"}`}>
      {label}
    </span>
  );
}
