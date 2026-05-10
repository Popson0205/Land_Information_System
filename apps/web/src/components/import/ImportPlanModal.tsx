import { useState, useRef, useCallback } from "react";
import { X, Upload, FileText, Image, PenLine, CheckCircle2 } from "lucide-react";
import { DxfPipeline } from "./DxfPipeline";
import { GeoAIPipeline } from "./GeoAIPipeline";
import { ManualTraversal } from "./ManualTraversal";
import { FullRegistrationForm } from "./FullRegistrationForm";
import { getApiUrl } from "@/lib/api";
import type { TraversalStartPoint, TraversalLeg } from "@/types/traversal";

export type UploadStage =
  | "idle" | "dxf" | "geoai" | "manual" | "registering" | "done";

export interface ExtractedPlan {
  type: "dxf" | "scan" | "manual";
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
    ownerName?: string;
    village?: string;
    lga?: string;
    state?: string;
    osAppsn?: string;
    scale?: string;
    address?: string;
  };
  traversal?: { startPoint: TraversalStartPoint; legs: TraversalLeg[] };
  rawExtraction?: any;
}

interface Props {
  onClose: () => void;
  onParcelRegistered: (parcelId: string, parcelNumber: string) => void;
  onPreviewReady: (plan: ExtractedPlan | null) => void;
}

const ACCEPTED = ".dxf,.pdf,.jpg,.jpeg,.png,.tiff,.tif";

function detectFileType(file: File): "dxf" | "image" | "pdf" | "unknown" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "dxf") return "dxf";
  if (ext === "pdf") return "pdf";
  if (["jpg","jpeg","png","tiff","tif"].includes(ext ?? "")) return "image";
  return "unknown";
}

export function ImportPlanModal({ onClose, onParcelRegistered, onPreviewReady }: Props) {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"dxf"|"image"|"pdf"|"unknown"|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPlan | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    const type = detectFileType(f);
    if (type === "unknown") { setError("Unsupported file type. Upload DXF, PDF, JPG, PNG, or TIFF."); return; }
    if (f.size > 50 * 1024 * 1024) { setError("File too large. Maximum 50 MB."); return; }
    setFile(f); setFileType(type);
    setStage(type === "dxf" ? "dxf" : "geoai");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const handleExtracted = useCallback((plan: ExtractedPlan) => {
    setExtracted(plan);
    onPreviewReady(plan);
    setStage("registering");
  }, [onPreviewReady]);

  function handleBack() {
    setExtracted(null);
    onPreviewReady(null);
    if (stage === "registering") {
      setStage(extracted?.type === "manual" ? "manual" : extracted?.type === "dxf" ? "dxf" : "geoai");
    } else {
      setFile(null); setFileType(null); setStage("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Import Survey Plan</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {stage === "idle" && "Choose an import method"}
              {stage === "manual" && "Manual traversal entry — AutoCAD style"}
              {stage === "dxf" && "DXF file import"}
              {stage === "geoai" && "GeoAI scan reading"}
              {stage === "registering" && "Complete parcel registration"}
              {stage === "done" && "Registration complete"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── IDLE: method selection ── */}
          {stage === "idle" && (
            <>
              <div className="space-y-2 mb-4">
                {/* Manual entry */}
                <button
                  onClick={() => setStage("manual")}
                  className="w-full flex gap-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-600
                             rounded-xl p-4 text-left transition-colors group"
                >
                  <PenLine size={18} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-200 group-hover:text-white">Manual Traversal Entry</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      AutoCAD-style. Enter starting point, then bearing + distance for each leg.
                      Polygon draws live on the satellite map as you type.
                    </p>
                  </div>
                </button>

                {/* GeoAI scan */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`flex gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors
                    ${dragOver ? "border-green-500 bg-green-950/20" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/40"}`}
                >
                  <Image size={18} className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-200">GeoAI Scan Reading</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Upload a scanned survey plan (JPG, PNG). AI reads bearings, distances, CRS,
                      owner name, and all metadata automatically.
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      {["JPG","PNG","TIFF"].map(l => (
                        <span key={l} className="text-xs px-1.5 py-0.5 rounded border bg-gray-800 text-gray-400 border-gray-700 font-mono">{l}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DXF */}
                <div
                  onClick={() => inputRef.current?.click()}
                  className="flex gap-3 bg-gray-800/50 border border-gray-700 hover:border-gray-500 rounded-xl p-4 cursor-pointer transition-colors"
                >
                  <FileText size={18} className="text-blue-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-200">DXF File Import</p>
                    <p className="text-xs text-gray-500 mt-0.5">AutoCAD DXF with closed polylines. Select CRS to georeference.</p>
                    <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-800 text-gray-400 border-gray-700 font-mono mt-2 inline-block">DXF</span>
                  </div>
                </div>
              </div>

              <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              {error && (
                <div className="mt-2 flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}

          {/* ── MANUAL TRAVERSAL ── */}
          {stage === "manual" && (
            <ManualTraversal
              onPreview={(geom) => {
                if (geom) {
                  const plan: ExtractedPlan = {
                    type: "manual", fileName: "Manual Entry", geoJson: geom,
                    crs: "EPSG:4326", confidence: "manual", metadata: {},
                  };
                  onPreviewReady(plan);
                } else {
                  onPreviewReady(null);
                }
              }}
              onComplete={handleExtracted}
              onBack={() => { onPreviewReady(null); setStage("idle"); }}
            />
          )}

          {/* ── DXF PIPELINE ── */}
          {stage === "dxf" && file && (
            <DxfPipeline
              file={file}
              onExtracted={handleExtracted}
              onError={msg => { setError(msg); setStage("idle"); }}
              onBack={() => { setFile(null); setFileType(null); setStage("idle"); }}
            />
          )}

          {/* ── GEOAI PIPELINE ── */}
          {stage === "geoai" && file && fileType && (
            <GeoAIPipeline
              file={file}
              fileType={fileType as "image"|"pdf"}
              onExtracted={handleExtracted}
              onError={msg => { setError(msg); setStage("idle"); }}
              onBack={() => { setFile(null); setFileType(null); setStage("idle"); }}
            />
          )}

          {/* ── FULL REGISTRATION FORM ── */}
          {stage === "registering" && extracted && (
            <FullRegistrationForm
              plan={extracted}
              onRegistered={(id, num) => { setStage("done"); onParcelRegistered(id, num); }}
              onBack={handleBack}
            />
          )}

          {/* ── DONE ── */}
          {stage === "done" && (
            <div className="text-center py-10">
              <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
              <p className="text-white font-semibold">Parcel registered successfully</p>
              <p className="text-gray-500 text-sm mt-1">Map has been updated. Click the parcel to view full details.</p>
              <button onClick={onClose}
                className="mt-5 px-5 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
