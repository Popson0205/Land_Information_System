/**
 * ManualTraversal — AutoCAD-style plot entry
 *
 * Step 1: Enter starting point (beacon label, Northing, Easting, CRS)
 * Step 2: Add legs one by one (bearing DMS + distance + fence type + to-beacon)
 *         → live polygon preview on satellite map updates after each leg
 * Step 3: Close polygon → shows closure error + computed area
 * Step 4: Advance to full registration form
 */
import { useState, useCallback, useId } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, ChevronRight, MapPin } from "lucide-react";
import proj4 from "proj4";
import {
  type TraversalStartPoint,
  type TraversalLeg,
  type CrsCode,
  EMPTY_METADATA,
  bearingToDecimal,
  computeTraversal,
  computeClosureError,
  computeArea,
} from "@/types/traversal";
import type { ExtractedPlan } from "./ImportPlanModal";

import { CRS_NAMED, registerAllCrs, ACCURACY_STYLES } from "@/lib/crs-registry";

// Register all CRS definitions from the authoritative registry
registerAllCrs(proj4);

const FENCE_TYPES = ["W/F", "C/F", "B/W", "ROAD", "STREAM", "NONE"];

function reprojectToWgs84(easting: number, northing: number, crs: CrsCode): [number, number] {
  if (crs === "EPSG:4326") return [easting, northing]; // already [lng, lat]
  try {
    // proj4 expects [X, Y] = [Easting, Northing] for projected CRS
    const [lng, lat] = proj4(crs, "EPSG:4326", [easting, northing]);
    return [lng, lat];
  } catch {
    return [easting, northing];
  }
}

function buildGeoJson(coords: Array<[number, number]>, crs: CrsCode): GeoJSON.Polygon | null {
  if (coords.length < 3) return null;
  const wgs84 = coords.map(([e, n]) => reprojectToWgs84(e, n, crs));
  const ring = [...wgs84, wgs84[0]];
  return { type: "Polygon", coordinates: [ring] };
}

interface Props {
  onPreview: (geoJson: GeoJSON.Geometry | null) => void;
  onComplete: (plan: ExtractedPlan) => void;
  onBack: () => void;
}

export function ManualTraversal({ onPreview, onComplete, onBack }: Props) {
  const uid = useId();

  // Step 1: starting point
  const [startPoint, setStartPoint] = useState<TraversalStartPoint>({
    beaconLabel: "",
    northing: 0,
    easting: 0,
    crs: "EPSG:26331",
  });
  const [startSet, setStartSet] = useState(false);

  // Step 2: legs
  const [legs, setLegs] = useState<TraversalLeg[]>([]);
  const [newLeg, setNewLeg] = useState<Omit<TraversalLeg, "id">>({
    fromBeacon: "",
    toBeacon: "",
    bearingDeg: 0,
    bearingMin: 0,
    bearingSec: 0,
    distanceM: 0,
    fenceType: "W/F",
  });

  const [legError, setLegError] = useState<string | null>(null);

  // Computed state
  const coords = startSet ? computeTraversal(startPoint, legs) : [];
  const closureError = coords.length > 2 ? computeClosureError(coords) : null;
  const areaSqm = coords.length > 2 ? computeArea(coords) : null;
  const geoJson = buildGeoJson(coords, startPoint.crs);

  // Update preview whenever coords change
  const updatePreview = useCallback((c: Array<[number, number]>, crs: CrsCode) => {
    const geom = buildGeoJson(c, crs);
    onPreview(geom);
  }, [onPreview]);

  function handleSetStart() {
    if (!startPoint.beaconLabel.trim()) { setLegError("Enter a beacon label for the starting point."); return; }
    if (!startPoint.northing || !startPoint.easting) { setLegError("Enter valid Northing and Easting coordinates."); return; }
    setLegError(null);
    setStartSet(true);
    setNewLeg(prev => ({ ...prev, fromBeacon: startPoint.beaconLabel }));
  }

  function handleAddLeg() {
    if (!newLeg.toBeacon.trim()) { setLegError("Enter the destination beacon label."); return; }
    if (!newLeg.distanceM || newLeg.distanceM <= 0) { setLegError("Enter a valid distance greater than 0."); return; }
    setLegError(null);

    const leg: TraversalLeg = { ...newLeg, id: `${uid}-${legs.length}` };
    const updatedLegs = [...legs, leg];
    setLegs(updatedLegs);

    // Update preview
    const newCoords = computeTraversal(startPoint, updatedLegs);
    updatePreview(newCoords, startPoint.crs);

    // Prepare next leg — from beacon = last to beacon
    setNewLeg(prev => ({
      ...prev,
      fromBeacon: leg.toBeacon,
      toBeacon: "",
      bearingDeg: 0,
      bearingMin: 0,
      bearingSec: 0,
      distanceM: 0,
    }));
  }

  function handleRemoveLeg(idx: number) {
    const updated = legs.filter((_, i) => i !== idx);
    setLegs(updated);
    const newCoords = computeTraversal(startPoint, updated);
    updatePreview(newCoords, startPoint.crs);
    if (updated.length > 0) {
      setNewLeg(prev => ({ ...prev, fromBeacon: updated[updated.length - 1].toBeacon }));
    } else {
      setNewLeg(prev => ({ ...prev, fromBeacon: startPoint.beaconLabel }));
    }
  }

  function handleComplete() {
    if (legs.length < 3) { setLegError("Need at least 3 legs to form a polygon."); return; }
    if (!geoJson) { setLegError("Could not compute polygon — check your coordinates."); return; }

    const plan: ExtractedPlan = {
      type: "dxf",
      fileName: "Manual Entry",
      geoJson,
      crs: "EPSG:4326",
      confidence: "manual",
      closureErrorM: closureError ?? 0,
      metadata: {
        ...EMPTY_METADATA,
        originalCrs: startPoint.crs,
        declaredAreaSqm: areaSqm ?? null,
      },
      traversal: { startPoint, legs },
    };
    onComplete(plan);
  }

  const bearingStr = `${newLeg.bearingDeg}° ${newLeg.bearingMin}' ${newLeg.bearingSec}"`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
        <MapPin size={14} className="text-blue-400" />
        Manual Plot Entry — AutoCAD Traversal Style
      </div>

      {/* Step 1: Starting point */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Step 1 — Starting Point
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Beacon Label</label>
            <input
              value={startPoint.beaconLabel}
              onChange={e => setStartPoint(p => ({ ...p, beaconLabel: e.target.value }))}
              placeholder="e.g. BB8215JP"
              disabled={startSet}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white
                         placeholder:text-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Northing (mN)</label>
            <input
              type="number"
              value={startPoint.northing || ""}
              onChange={e => setStartPoint(p => ({ ...p, northing: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 887959.725 (large N value)"
              disabled={startSet}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white
                         placeholder:text-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Easting (mE)</label>
            <input
              type="number"
              value={startPoint.easting || ""}
              onChange={e => setStartPoint(p => ({ ...p, easting: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 668351.770 (smaller E value)"
              disabled={startSet}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white
                         placeholder:text-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">
              Coordinate System (CRS)
              {startPoint.crs && (() => {
                const def = CRS_NAMED.find(c => c.code === startPoint.crs);
                return def ? (
                  <span className={`ml-2 font-medium ${ACCURACY_STYLES[def.accuracy]}`}>
                    ± {def.accuracy}
                  </span>
                ) : null;
              })()}
            </label>
            <select
              value={startPoint.crs}
              onChange={e => setStartPoint(p => ({ ...p, crs: e.target.value as CrsCode }))}
              disabled={startSet}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white
                         focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {CRS_NAMED.map(o => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Live WGS84 preview — shows user if coordinates are in the right ballpark */}
          {startPoint.northing > 0 && startPoint.easting > 0 && !startSet && (() => {
            try {
              const [lng, lat] = startPoint.crs === "EPSG:4326"
                ? [startPoint.easting, startPoint.northing]
                : (() => { const r = reprojectToWgs84(startPoint.easting, startPoint.northing, startPoint.crs); return r; })();
              const valid = lat > -90 && lat < 90 && lng > -180 && lng < 180;
              return valid ? (
                <div className="col-span-2 bg-blue-950/30 border border-blue-800 rounded px-2.5 py-2 text-xs">
                  <span className="text-blue-400 font-medium">Preview location: </span>
                  <span className="text-blue-300 font-mono">
                    {lat.toFixed(6)}°N, {lng.toFixed(6)}°E
                  </span>
                  <a
                    href={`https://maps.google.com/?q=${lat},${lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-blue-500 underline hover:text-blue-400"
                  >
                    verify on Google Maps ↗
                  </a>
                </div>
              ) : null;
            } catch { return null; }
          })()}
        </div>

        {!startSet ? (
          <button
            onClick={handleSetStart}
            className="w-full py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg font-medium transition-colors"
          >
            Set Starting Point →
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Starting point set: {startPoint.beaconLabel}
            </span>
            <button onClick={() => { setStartSet(false); setLegs([]); onPreview(null); }}
              className="text-xs text-gray-500 hover:text-gray-300">Edit</button>
          </div>
        )}
      </div>

      {/* Step 2: Legs */}
      {startSet && (
        <div className="bg-gray-800 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Step 2 — Boundary Legs ({legs.length} added)
          </p>

          {/* Existing legs */}
          {legs.length > 0 && (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {legs.map((leg, i) => (
                <div key={leg.id} className="flex items-center justify-between bg-gray-700/50 rounded px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-blue-400 font-mono shrink-0">{i + 1}.</span>
                    <span className="text-gray-400 font-mono truncate">{leg.fromBeacon} → {leg.toBeacon}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-gray-300 font-mono">
                      {leg.bearingDeg}°{leg.bearingMin}' {leg.distanceM}m
                    </span>
                    <span className="text-gray-600">{leg.fenceType}</span>
                    <button onClick={() => handleRemoveLeg(i)}
                      className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New leg form */}
          <div className="border border-gray-700 rounded-lg p-2.5 space-y-2">
            <p className="text-xs text-gray-500">Add next leg</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">From Beacon</label>
                <input
                  value={newLeg.fromBeacon}
                  readOnly
                  className="w-full bg-gray-700 border border-gray-700 rounded px-2 py-1 text-xs text-gray-400 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">To Beacon</label>
                <input
                  value={newLeg.toBeacon}
                  onChange={e => setNewLeg(p => ({ ...p, toBeacon: e.target.value }))}
                  placeholder="e.g. BB8216JP"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Bearing — DMS */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Bearing (Degrees ° Minutes ' Seconds ")</label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number" min={0} max={359}
                  value={newLeg.bearingDeg || ""}
                  onChange={e => setNewLeg(p => ({ ...p, bearingDeg: parseInt(e.target.value) || 0 }))}
                  placeholder="°"
                  className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center
                             focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-gray-600 text-xs">°</span>
                <input
                  type="number" min={0} max={59}
                  value={newLeg.bearingMin || ""}
                  onChange={e => setNewLeg(p => ({ ...p, bearingMin: parseInt(e.target.value) || 0 }))}
                  placeholder="'"
                  className="w-14 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center
                             focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-gray-600 text-xs">'</span>
                <input
                  type="number" min={0} max={59}
                  value={newLeg.bearingSec || ""}
                  onChange={e => setNewLeg(p => ({ ...p, bearingSec: parseInt(e.target.value) || 0 }))}
                  placeholder='"'
                  className="w-14 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center
                             focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-gray-600 text-xs">"</span>
                <span className="text-blue-400 text-xs font-mono ml-1">= {bearingToDecimal(newLeg.bearingDeg, newLeg.bearingMin, newLeg.bearingSec).toFixed(4)}°</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Distance (metres)</label>
                <input
                  type="number" min={0} step={0.001}
                  value={newLeg.distanceM || ""}
                  onChange={e => setNewLeg(p => ({ ...p, distanceM: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g. 24.47"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Fence Type</label>
                <select
                  value={newLeg.fenceType}
                  onChange={e => setNewLeg(p => ({ ...p, fenceType: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white
                             focus:outline-none focus:border-blue-500"
                >
                  {FENCE_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={handleAddLeg}
              className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500
                         text-gray-200 text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Add Leg
            </button>
          </div>
        </div>
      )}

      {/* Closure + area summary */}
      {legs.length >= 2 && closureError !== null && (
        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border
          ${closureError < 0.1
            ? "bg-green-900/20 border-green-800 text-green-400"
            : closureError < 0.5
            ? "bg-amber-900/20 border-amber-800 text-amber-400"
            : "bg-red-900/20 border-red-800 text-red-400"
          }`}>
          {closureError < 0.5
            ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
            : <AlertCircle size={12} className="shrink-0 mt-0.5" />
          }
          <div>
            <span className="font-medium">Closure error: {closureError.toFixed(4)} m</span>
            {areaSqm && <span className="ml-3 text-inherit/70">Area: {areaSqm.toLocaleString(undefined, { maximumFractionDigits: 3 })} m²</span>}
          </div>
        </div>
      )}

      {legError && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          <AlertCircle size={12} className="shrink-0" />{legError}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors">
          ← Back
        </button>
        <button
          onClick={handleComplete}
          disabled={legs.length < 3}
          className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed
                     text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          Close Polygon <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
