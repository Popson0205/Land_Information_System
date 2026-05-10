import { useEffect, useState, useCallback } from "react";
import { X, Search, MapPin, AlertTriangle, Lock, RefreshCw, ChevronRight, FileText } from "lucide-react";
import { fetchParcels, fetchParcelDetail } from "@/lib/api";
import type { ParcelFeature, ParcelDetail } from "@/types/parcel";

interface Props {
  onClose: () => void;
  onFlyToParcel: (parcelId: string) => void;
  onSelectParcel: (parcel: ParcelFeature) => void;
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-900/40 text-green-400 border-green-800",
  disputed: "bg-red-900/40 text-red-400 border-red-800",
  archived: "bg-gray-700/40 text-gray-400 border-gray-700",
};

export function ParcelRegistry({ onClose, onFlyToParcel, onSelectParcel }: Props) {
  const [parcels, setParcels] = useState<ParcelFeature[]>([]);
  const [filtered, setFiltered] = useState<ParcelFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParcelDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const geojson = await fetchParcels();
      const features = geojson.features as ParcelFeature[];
      setParcels(features);
      setFiltered(features);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let result = parcels;
    if (statusFilter !== "all") result = result.filter(f => f.properties.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.properties.parcelNumber?.toLowerCase().includes(q) ||
        f.properties.ownerName?.toLowerCase().includes(q) ||
        f.properties.titleNumber?.toLowerCase().includes(q) ||
        f.properties.zoneLabel?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, statusFilter, parcels]);

  async function handleSelectParcel(parcel: ParcelFeature) {
    setSelectedId(parcel.properties.id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await fetchParcelDetail(parcel.properties.id);
      setDetail(d);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  function handleFlyTo(parcel: ParcelFeature) {
    onFlyToParcel(parcel.properties.id);
    onSelectParcel(parcel);
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 w-80 bg-gray-900 border-r border-gray-700
                    flex flex-col shadow-2xl z-20">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-blue-400" />
          <span className="text-white font-semibold text-sm">Parcel Registry</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="px-3 py-2 border-b border-gray-700 space-y-2">
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5">
          <Search size={12} className="text-gray-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Parcel no., owner, title..."
            className="bg-transparent text-xs text-gray-300 placeholder:text-gray-600 outline-none w-full"
          />
        </div>
        <div className="flex gap-1">
          {["all", "active", "disputed", "archived"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-1 text-xs py-1 rounded capitalize transition-colors
                ${statusFilter === s
                  ? "bg-blue-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            Loading parcels...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-gray-600 text-xs gap-1">
            <MapPin size={16} />
            No parcels found
          </div>
        )}

        {!loading && filtered.map(parcel => {
          const p = parcel.properties;
          const isSelected = selectedId === p.id;
          return (
            <div key={p.id}>
              <button
                onClick={() => handleSelectParcel(parcel)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-800 transition-colors
                  ${isSelected ? "bg-gray-800" : "hover:bg-gray-800/50"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-blue-400 truncate">{p.parcelNumber}</span>
                      <span className={`text-xs px-1.5 py-0 rounded-full border capitalize shrink-0 ${STATUS_STYLES[p.status]}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 truncate">{p.ownerName ?? "No title registered"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {p.areaSqm && (
                        <span className="text-xs text-gray-600">{Number(p.areaSqm).toLocaleString()} m²</span>
                      )}
                      {p.zoneCode && (
                        <span className="text-xs text-gray-600">{p.zoneCode}</span>
                      )}
                      {p.hasDispute && <AlertTriangle size={10} className="text-red-400" />}
                      {p.hasEncumbrance && <Lock size={10} className="text-amber-400" />}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFlyTo(parcel); }}
                      className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-gray-700 transition-colors"
                      title="Zoom to parcel on map"
                    >
                      <MapPin size={12} />
                    </button>
                    <ChevronRight size={12} className={`transition-transform ${isSelected ? "rotate-90 text-blue-400" : "text-gray-700"}`} />
                  </div>
                </div>
              </button>

              {/* Inline detail panel */}
              {isSelected && (
                <div className="bg-gray-800/50 border-b border-gray-700 px-3 py-3">
                  {detailLoading && (
                    <p className="text-xs text-gray-600 text-center py-2">Loading...</p>
                  )}
                  {detail && !detailLoading && (
                    <div className="space-y-3">
                      {/* Quick stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <Stat label="Area" value={detail.areaSqm ? `${Number(detail.areaSqm).toLocaleString()} m²` : "—"} />
                        <Stat label="Perimeter" value={detail.perimeterM ? `${Number(detail.perimeterM).toLocaleString()} m` : "—"} />
                      </div>

                      {/* Title */}
                      {detail.titles?.[0] && (
                        <Section title="Title">
                          <Row label="No." value={detail.titles[0].title_number} />
                          <Row label="Type" value={detail.titles[0].title_type} />
                          <Row label="Issued" value={detail.titles[0].issue_date} />
                          <Row label="By" value={detail.titles[0].registered_by} />
                        </Section>
                      )}

                      {/* Survey */}
                      {detail.surveys?.[0] && (
                        <Section title="Survey">
                          <Row label="Surveyor" value={detail.surveys[0].surveyor_name} />
                          <Row label="Date" value={detail.surveys[0].survey_date} />
                          <Row label="Plan Ref" value={detail.surveys[0].survey_plan_ref} />
                          <Row label="CRS" value={detail.surveys[0].original_crs} />
                          {detail.surveys[0].geoai_confidence && (
                            <Row label="GeoAI" value={`${detail.surveys[0].geoai_confidence} confidence`} />
                          )}
                        </Section>
                      )}

                      {/* Zoning */}
                      {detail.zoning?.[0] && (
                        <Section title="Zoning">
                          <Row label="Zone" value={`${detail.zoning[0].zone_code} — ${detail.zoning[0].zone_label}`} />
                        </Section>
                      )}

                      {/* Disputes */}
                      {detail.disputes?.length > 0 && (
                        <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-2">
                          <p className="text-xs text-red-400 font-medium mb-1">⚠ Active Dispute</p>
                          <p className="text-xs text-red-300/70">{detail.disputes[0].dispute_type} — {detail.disputes[0].claimant}</p>
                        </div>
                      )}

                      {/* Fly to button */}
                      <button
                        onClick={() => handleFlyTo(parcel)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-700/60
                                   hover:bg-blue-700 text-blue-200 text-xs rounded-lg transition-colors"
                      >
                        <MapPin size={11} /> Zoom to Parcel on Map
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg px-2 py-1.5">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-xs font-medium text-white mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-gray-600 shrink-0">{label}</span>
      <span className="text-gray-300 text-right truncate font-mono">{value}</span>
    </div>
  );
}
