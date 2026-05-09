import { useEffect, useState } from "react";
import { X, MapPin, AlertTriangle, Lock, FileText, Calendar } from "lucide-react";
import { fetchParcelDetail } from "@/lib/api";
import type { ParcelFeature, ParcelDetail } from "@/types/parcel";

interface Props {
  parcel: ParcelFeature;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-900/40 text-green-400 border border-green-700",
  disputed: "bg-red-900/40 text-red-400 border border-red-700",
  archived: "bg-gray-700/40 text-gray-400 border border-gray-600",
};

const ZONE_COLORS: Record<string, string> = {
  R1: "bg-blue-900/40 text-blue-300",
  R2: "bg-blue-800/40 text-blue-200",
  C1: "bg-amber-900/40 text-amber-300",
  I1: "bg-orange-900/40 text-orange-300",
  A1: "bg-green-900/40 text-green-300",
  G1: "bg-purple-900/40 text-purple-300",
};

export function ParcelSidePanel({ parcel, onClose }: Props) {
  const [detail, setDetail] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "records" | "history">("overview");

  const p = parcel.properties;

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    fetchParcelDetail(p.id)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [p.id]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700
                    flex flex-col shadow-2xl z-20 animate-in slide-in-from-right duration-200">

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-primary-light shrink-0" />
            <span className="text-xs text-gray-400 font-mono">{p.parcelNumber}</span>
          </div>
          <h2 className="text-base font-semibold text-white truncate">
            {p.ownerName ?? "No title registered"}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status]}`}>
              {p.status}
            </span>
            {p.zoneCode && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_COLORS[p.zoneCode] ?? "bg-gray-700 text-gray-300"}`}>
                {p.zoneCode} — {p.zoneLabel}
              </span>
            )}
            {p.hasDispute && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle size={11} /> Dispute
              </span>
            )}
            {p.hasEncumbrance && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Lock size={11} /> Encumbered
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-3 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-px bg-gray-700 border-b border-gray-700">
        <Stat label="Area" value={p.areaSqm ? `${Number(p.areaSqm).toLocaleString()} m²` : "—"} />
        <Stat label="Perimeter" value={p.perimeterM ? `${Number(p.perimeterM).toLocaleString()} m` : "—"} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 text-sm">
        {(["overview", "records", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 font-medium capitalize transition-colors
              ${activeTab === tab
                ? "text-white border-b-2 border-primary-light"
                : "text-gray-400 hover:text-gray-200"
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Loading record...
          </div>
        )}

        {!loading && detail && activeTab === "overview" && (
          <OverviewTab detail={detail} />
        )}

        {!loading && detail && activeTab === "records" && (
          <RecordsTab detail={detail} />
        )}

        {!loading && detail && activeTab === "history" && (
          <HistoryTab detail={detail} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 px-4 py-2.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-white mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function OverviewTab({ detail }: { detail: ParcelDetail }) {
  const title = detail.titles?.[0];
  const zone = detail.zoning?.[0];
  const valuation = detail.valuations?.[0];

  return (
    <>
      <Section title="Title">
        {title ? (
          <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
            <Row label="Title No." value={title.title_number} />
            <Row label="Owner" value={title.owner_name} />
            <Row label="Type" value={title.title_type ?? "—"} />
            <Row label="Issued" value={title.issue_date ?? "—"} />
            {title.expiry_date && <Row label="Expires" value={title.expiry_date} />}
            <Row label="Registered by" value={title.registered_by ?? "—"} />
          </div>
        ) : (
          <EmptyState text="No title registered" />
        )}
      </Section>

      <Section title="Zoning">
        {zone ? (
          <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
            <Row label="Zone" value={`${zone.zone_code} — ${zone.zone_label}`} />
            {zone.floor_area_ratio && <Row label="FAR" value={zone.floor_area_ratio} />}
            {zone.max_height_m && <Row label="Max Height" value={`${zone.max_height_m} m`} />}
            {zone.effective_date && <Row label="Effective" value={zone.effective_date} />}
          </div>
        ) : (
          <EmptyState text="No zoning classification" />
        )}
      </Section>

      <Section title="Latest Valuation">
        {valuation ? (
          <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
            <Row label="Value" value={`${Number(valuation.assessed_value).toLocaleString()} ${valuation.currency}`} />
            <Row label="Tax Year" value={valuation.tax_year ?? "—"} />
            {valuation.annual_tax && <Row label="Annual Tax" value={`${Number(valuation.annual_tax).toLocaleString()} ${valuation.currency}`} />}
            <Row label="Basis" value={valuation.basis ?? "—"} />
          </div>
        ) : (
          <EmptyState text="No valuation on record" />
        )}
      </Section>
    </>
  );
}

function RecordsTab({ detail }: { detail: ParcelDetail }) {
  return (
    <>
      <Section title={`Encumbrances (${detail.encumbrances.length})`}>
        {detail.encumbrances.length > 0 ? (
          <div className="space-y-2">
            {detail.encumbrances.map((e: any) => (
              <div key={e.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-white capitalize">{e.type}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.status === "active" ? "bg-amber-900/40 text-amber-400" : "bg-gray-700 text-gray-400"}`}>
                    {e.status}
                  </span>
                </div>
                <div className="text-gray-400 mt-1">{e.holder}</div>
                {e.amount && <div className="text-gray-300 text-xs mt-1">{Number(e.amount).toLocaleString()} {e.currency}</div>}
              </div>
            ))}
          </div>
        ) : <EmptyState text="No encumbrances" />}
      </Section>

      <Section title={`Disputes (${detail.disputes.length})`}>
        {detail.disputes.length > 0 ? (
          <div className="space-y-2">
            {detail.disputes.map((d: any) => (
              <div key={d.id} className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-red-300 capitalize">{d.dispute_type}</span>
                  <span className="text-xs text-red-400">{d.status}</span>
                </div>
                <div className="text-gray-400 mt-1">Claimant: {d.claimant}</div>
                {d.notes && <div className="text-gray-500 text-xs mt-1.5">{d.notes}</div>}
              </div>
            ))}
          </div>
        ) : <EmptyState text="No active disputes" />}
      </Section>
    </>
  );
}

function HistoryTab({ detail }: { detail: ParcelDetail }) {
  return (
    <>
      <Section title={`Transactions (${detail.transactions.length})`}>
        {detail.transactions.length > 0 ? (
          <div className="space-y-2">
            {detail.transactions.map((t: any) => (
              <div key={t.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-white capitalize">{t.transaction_type}</span>
                  <span className="text-xs text-gray-400">{t.transaction_date}</span>
                </div>
                <div className="text-gray-400 mt-1 text-xs">
                  {t.from_owner && <span>{t.from_owner} → </span>}
                  <span>{t.to_owner}</span>
                </div>
                {t.consideration && (
                  <div className="text-gray-300 text-xs mt-1">
                    {Number(t.consideration).toLocaleString()} {t.currency}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <EmptyState text="No transactions recorded" />}
      </Section>

      <Section title={`Surveys (${detail.surveys.length})`}>
        {detail.surveys.length > 0 ? (
          <div className="space-y-2">
            {detail.surveys.map((s: any) => (
              <div key={s.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                <Row label="Surveyor" value={s.surveyor_name} />
                <Row label="Date" value={s.survey_date} />
                {s.survey_plan_ref && <Row label="Plan Ref" value={s.survey_plan_ref} />}
                {s.geoai_confidence && (
                  <Row label="GeoAI" value={`${s.geoai_confidence} confidence`} />
                )}
              </div>
            ))}
          </div>
        ) : <EmptyState text="No surveys on record" />}
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-200 text-right truncate">{value ?? "—"}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-4 text-sm text-gray-600">{text}</div>
  );
}
