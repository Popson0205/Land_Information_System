import { useState, useRef, useCallback } from "react";
import { X, Upload, FileText, Image, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { DxfPipeline } from "./DxfPipeline";
import { GeoAIPipeline } from "./GeoAIPipeline";

export type UploadStage =
  | "idle" | "dxf-preview" | "geoai-analyzing"
  | "geoai-preview" | "confirming" | "done";

export interface ExtractedPlan {
  type: "dxf" | "scan";
  fileName: string;
  geoJson: GeoJSON.Geometry | null;
  crs: string;
  confidence: "high" | "medium" | "low" | "manual";
  closureErrorM?: number;
  metadata: {
    surveyorName?: string;
    surveyDate?: string;
    planRef?: string;
    originalCrs?: string;
    declaredAreaSqm?: number | null;
  };
  rawExtraction?: any;
}

interface Props {
  onClose: () => void;
  onParcelRegistered: (parcelId: string, parcelNumber: string) => void;
  onPreviewReady: (plan: ExtractedPlan) => void;
}

const ACCEPTED = ".dxf,.pdf,.jpg,.jpeg,.png,.tiff,.tif";

function detectFileType(file: File): "dxf" | "image" | "pdf" | "unknown" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "dxf") return "dxf";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "tiff", "tif"].includes(ext ?? "")) return "image";
  return "unknown";
}

export function ImportPlanModal({ onClose, onParcelRegistered, onPreviewReady }: Props) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"dxf" | "image" | "pdf" | "unknown" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPlan | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    const type = detectFileType(f);
    if (type === "unknown") { setError("Unsupported file type. Upload a DXF, PDF, JPG, PNG, or TIFF."); return; }
    if (f.size > 50 * 1024 * 1024) { setError("File too large. Maximum 50 MB."); return; }
    setFile(f);
    setFileType(type);
    setStage(type === "dxf" ? "dxf-preview" : "geoai-analyzing");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const handleExtracted = useCallback((plan: ExtractedPlan) => {
    setExtracted(plan);
    onPreviewReady(plan);   // show preview on map immediately
    setStage("confirming");
  }, [onPreviewReady]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold text-base">Import Survey Plan</h2>
            <p className="text-gray-500 text-xs mt-0.5">DXF · PDF · JPEG · PNG · TIFF</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {stage === "idle" && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${dragOver ? "border-blue-500 bg-blue-950/20" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/40"}`}
              >
                <Upload size={32} className="mx-auto text-gray-600 mb-3" />
                <p className="text-gray-300 font-medium text-sm">Drop your survey plan here</p>
                <p className="text-gray-600 text-xs mt-1">or click to browse</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  {["DXF","PDF","JPG","PNG","TIFF"].map(l => (
                    <span key={l} className="text-xs px-2 py-0.5 rounded border bg-gray-800 text-gray-400 border-gray-700 font-mono">{l}</span>
                  ))}
                </div>
                <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {error && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />{error}
                </div>
              )}

              <div className="mt-5 space-y-3">
                <div className="flex gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <FileText size={16} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-200">AutoCAD DXF</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Parsed in-browser. Closed polylines extracted as parcel boundaries. Choose CRS from a list of Nigerian and international projections.</p>
                  </div>
                </div>
                <div className="flex gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <Image size={16} className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-200">Scanned Plan / PDF</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">GPT-4o Vision reads corner coordinates, CRS, and surveyor metadata. Polygon auto-placed on satellite map with confidence score.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {stage === "dxf-preview" && file && (
            <DxfPipeline
              file={file}
              onExtracted={handleExtracted}
              onError={(msg) => { setError(msg); setStage("idle"); }}
              onBack={() => { setFile(null); setFileType(null); setStage("idle"); }}
            />
          )}

          {(stage === "geoai-analyzing" || stage === "geoai-preview") && file && fileType && (
            <GeoAIPipeline
              file={file}
              fileType={fileType as "image" | "pdf"}
              onExtracted={handleExtracted}
              onError={(msg) => { setError(msg); setStage("idle"); }}
              onBack={() => { setFile(null); setFileType(null); setStage("idle"); }}
            />
          )}

          {stage === "confirming" && extracted && (
            <ConfirmPanel
              plan={extracted}
              onRegistered={(id, num) => { setStage("done"); onParcelRegistered(id, num); }}
              onBack={() => { setStage(extracted.type === "dxf" ? "dxf-preview" : "geoai-preview"); }}
            />
          )}

          {stage === "done" && (
            <div className="text-center py-10">
              <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
              <p className="text-white font-semibold">Parcel registered successfully</p>
              <p className="text-gray-500 text-sm mt-1">The map has been refreshed with your new parcel.</p>
              <button onClick={onClose} className="mt-5 px-5 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Confirm & Register ───────────────────────────────────────────────────────
function ConfirmPanel({ plan, onRegistered, onBack }: {
  plan: ExtractedPlan;
  onRegistered: (id: string, num: string) => void;
  onBack: () => void;
}) {
  const [parcelNumber, setParcelNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const API_URL = import.meta.env.VITE_API_URL ?? "";

  const CONF: Record<string, string> = {
    high:   "bg-green-900/40 text-green-400 border-green-700",
    medium: "bg-amber-900/40 text-amber-400 border-amber-700",
    low:    "bg-red-900/40 text-red-400 border-red-700",
    manual: "bg-gray-700/40 text-gray-400 border-gray-600",
  };

  async function handleConfirm() {
    if (!parcelNumber.trim()) { setError("Parcel number is required."); return; }
    if (!plan.geoJson) { setError("No geometry to register."); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/geoai/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelNumber: parcelNumber.trim(),
          geoJsonWgs84: plan.geoJson,
          confidence: plan.confidence,
          closureErrorM: plan.closureErrorM,
          metadata: plan.metadata,
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `Error ${res.status}`); }
      const data = await res.json();
      onRegistered(data.parcelId, data.parcelNumber);
    } catch (err: any) {
      setError(err.message ?? "Registration failed.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={15} className="text-green-400" />
        <span className="text-sm font-medium text-gray-200">Review and confirm registration</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CONF[plan.confidence]}`}>
          {plan.confidence}
        </span>
      </div>

      <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-xs">
        {(([
          ["CRS", plan.metadata.originalCrs ?? plan.crs],
          ["Surveyor", plan.metadata.surveyorName],
          ["Date", plan.metadata.surveyDate],
          ["Plan Ref", plan.metadata.planRef],
          ["File", plan.fileName],
          plan.closureErrorM !== undefined ? ["Closure Error", `${plan.closureErrorM.toFixed(3)} m`] : null,
        ].filter(Boolean)) as string[][]).map(([label, value]) => value ? (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-gray-500 shrink-0">{label}</span>
            <span className="text-gray-200 text-right font-mono truncate">{value}</span>
          </div>
        ) : null)}
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1.5">Parcel Number <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={parcelNumber}
          onChange={(e) => setParcelNumber(e.target.value)}
          placeholder="e.g. LG/LI/001/2024"
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                     placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          <AlertCircle size={12} className="shrink-0" />{error}
        </div>
      )}

      {plan.confidence === "low" && (
        <div className="text-amber-400 text-xs bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
          ⚠ Low confidence — verify the yellow polygon on the map before confirming.
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onBack} disabled={submitting}
          className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors">
          ← Back
        </button>
        <button onClick={handleConfirm} disabled={submitting || !parcelNumber.trim()}
          className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
          {submitting ? <><Loader2 size={13} className="animate-spin" /> Registering...</> : "Confirm & Register"}
        </button>
      </div>
    </div>
  );
}
