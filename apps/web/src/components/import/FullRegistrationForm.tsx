/**
 * FullRegistrationForm
 *
 * Shown after traversal is complete (manual or GeoAI).
 * Pre-filled from extracted data. User reviews all fields before saving.
 * Single POST saves: parcel + land_title + survey + zoning atomically.
 */
import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import type { ExtractedPlan } from "./ImportPlanModal";
import type { ParcelRegistrationData } from "@/types/traversal";

interface Props {
  plan: ExtractedPlan;
  onRegistered: (parcelId: string, parcelNumber: string) => void;
  onBack: () => void;
}

const TITLE_TYPES = ["freehold", "leasehold", "customary"];
const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba",
  "Yobe","Zamfara",
];

const CONF_STYLES: Record<string, string> = {
  high:   "bg-green-900/40 text-green-400 border-green-700",
  medium: "bg-amber-900/40 text-amber-400 border-amber-700",
  low:    "bg-red-900/40 text-red-400 border-red-700",
  manual: "bg-blue-900/40 text-blue-400 border-blue-700",
};

export function FullRegistrationForm({ plan, onRegistered, onBack }: Props) {
  // Pre-fill from extracted metadata
  const [form, setForm] = useState<ParcelRegistrationData>({
    parcelNumber: "",
    ownerName: plan.metadata.surveyorName ? "" : "",
    ownerIdNumber: "",
    titleNumber: "",
    titleType: "",
    issueDate: plan.metadata.surveyDate ?? "",
    expiryDate: "",
    registeredBy: plan.metadata.surveyorName ?? "",
    address: "",
    village: "",
    lga: "",
    state: "Osun",
    surveyorName: plan.metadata.surveyorName ?? "",
    surveyDate: plan.metadata.surveyDate ?? "",
    planRef: plan.metadata.planRef ?? "",
    osAppsn: "",
    scale: "1:500",
    declaredAreaSqm: plan.metadata.declaredAreaSqm ?? null,
    zoneCode: "",
    zoneLabel: "",
    maxHeightM: null,
    floorAreaRatio: null,
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string>("parcel");

  function set(key: keyof ParcelRegistrationData, value: any) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.parcelNumber.trim()) { setError("Parcel number is required."); return; }
    if (!plan.geoJson) { setError("No geometry — go back and complete the traversal."); return; }
    setSubmitting(true); setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/parcels/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry: plan.geoJson,
          confidence: plan.confidence,
          closureErrorM: plan.closureErrorM,
          originalCrs: plan.metadata.originalCrs,
          traversal: (plan as any).traversal ?? null,
          ...form,
        }),
      });

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(`Server error: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);

      onRegistered(data.parcelId, data.parcelNumber);
    } catch (err: any) {
      setError(err.message ?? "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    const open = openSection === id;
    return (
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setOpenSection(open ? "" : id)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800 hover:bg-gray-750 text-left transition-colors"
        >
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
          {open ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
        </button>
        {open && <div className="p-3 space-y-2 bg-gray-800/30">{children}</div>}
      </div>
    );
  }

  function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {children}
      </div>
    );
  }

  const inputCls = "w-full bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors";
  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-400" />
          <span className="text-sm font-medium text-gray-200">Complete Parcel Registration</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CONF_STYLES[plan.confidence]}`}>
            {plan.confidence}
          </span>
          {plan.closureErrorM !== undefined && plan.closureErrorM < 1 && (
            <span className="text-xs text-green-400">✓ {plan.closureErrorM.toFixed(3)}m closure</span>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">

        {/* Parcel Identity */}
        <Section id="parcel" title="📍 Parcel Identity">
          <Field label="Parcel Number" required>
            <input value={form.parcelNumber} onChange={e => set("parcelNumber", e.target.value)}
              placeholder="e.g. OS/2428/2024/031" className={`${inputCls} font-mono`} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="State">
              <select value={form.state} onChange={e => set("state", e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="LGA">
              <input value={form.lga} onChange={e => set("lga", e.target.value)}
                placeholder="e.g. Ede South" className={inputCls} />
            </Field>
          </div>
          <Field label="Village / Area">
            <input value={form.village} onChange={e => set("village", e.target.value)}
              placeholder="e.g. Durodola Village" className={inputCls} />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={e => set("address", e.target.value)}
              placeholder="e.g. Along Odo-Afa Road, Owode-Ede" className={inputCls} />
          </Field>
        </Section>

        {/* Land Title */}
        <Section id="title" title="📄 Land Title">
          <Field label="Owner Full Name" required>
            <input value={form.ownerName} onChange={e => set("ownerName", e.target.value)}
              placeholder="e.g. Emmanuel Oyetunde Fasola" className={inputCls} />
          </Field>
          <Field label="Owner ID (NIN / RC Number)">
            <input value={form.ownerIdNumber} onChange={e => set("ownerIdNumber", e.target.value)}
              placeholder="NIN or Company RC" className={`${inputCls} font-mono`} />
          </Field>
          <Field label="Title Number">
            <input value={form.titleNumber} onChange={e => set("titleNumber", e.target.value)}
              placeholder="e.g. CT/OS/001/2024" className={`${inputCls} font-mono`} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title Type">
              <select value={form.titleType} onChange={e => set("titleType", e.target.value)} className={selectCls}>
                <option value="">— Select —</option>
                {TITLE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </Field>
            <Field label="Issue Date">
              <input type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} className={inputCls} />
            </Field>
          </div>
          {form.titleType === "leasehold" && (
            <Field label="Expiry Date">
              <input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} className={inputCls} />
            </Field>
          )}
          <Field label="Registered By">
            <input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)}
              placeholder="e.g. Osun State Land Registry" className={inputCls} />
          </Field>
        </Section>

        {/* Survey Details */}
        <Section id="survey" title="📐 Survey Details">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Surveyor Name">
              <input value={form.surveyorName} onChange={e => set("surveyorName", e.target.value)}
                placeholder="e.g. Surv. A.O. Adeyemo" className={inputCls} />
            </Field>
            <Field label="Survey Date">
              <input type="date" value={form.surveyDate} onChange={e => set("surveyDate", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plan Reference">
              <input value={form.planRef} onChange={e => set("planRef", e.target.value)}
                placeholder="e.g. OS/2428/2024/031" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="OS-APPSN">
              <input value={form.osAppsn} onChange={e => set("osAppsn", e.target.value)}
                placeholder="e.g. OS-APPSN 01S" className={`${inputCls} font-mono`} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Scale">
              <input value={form.scale} onChange={e => set("scale", e.target.value)}
                placeholder="1:500" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Declared Area (m²)">
              <input type="number" value={form.declaredAreaSqm ?? ""}
                onChange={e => set("declaredAreaSqm", parseFloat(e.target.value) || null)}
                placeholder="e.g. 1118.152" className={`${inputCls} font-mono`} />
            </Field>
          </div>
          {plan.closureErrorM !== undefined && (
            <div className="text-xs text-gray-600 font-mono">
              Computed area: {plan.metadata.declaredAreaSqm?.toLocaleString() ?? "—"} m² ·
              Closure: {plan.closureErrorM.toFixed(4)} m ·
              CRS: {plan.metadata.originalCrs ?? "EPSG:4326"}
            </div>
          )}
        </Section>

        {/* Zoning */}
        <Section id="zoning" title="🗺 Zoning">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Zone Code">
              <input value={form.zoneCode} onChange={e => set("zoneCode", e.target.value)}
                placeholder="e.g. R1, C1, A1" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Zone Label">
              <input value={form.zoneLabel} onChange={e => set("zoneLabel", e.target.value)}
                placeholder="e.g. Residential" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max Height (m)">
              <input type="number" value={form.maxHeightM ?? ""}
                onChange={e => set("maxHeightM", parseFloat(e.target.value) || null)}
                placeholder="e.g. 9" className={inputCls} />
            </Field>
            <Field label="Floor Area Ratio">
              <input type="number" step={0.01} value={form.floorAreaRatio ?? ""}
                onChange={e => set("floorAreaRatio", parseFloat(e.target.value) || null)}
                placeholder="e.g. 0.5" className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Notes */}
        <Section id="notes" title="📝 Notes">
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            rows={3} placeholder="Any additional notes about this parcel..."
            className={`${inputCls} resize-none`} />
        </Section>

      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          <AlertCircle size={12} className="shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onBack} disabled={submitting}
          className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg text-sm transition-colors">
          ← Back
        </button>
        <button onClick={handleSubmit} disabled={submitting || !form.parcelNumber.trim()}
          className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
          {submitting
            ? <><Loader2 size={13} className="animate-spin" /> Registering...</>
            : "Register Parcel"
          }
        </button>
      </div>
    </div>
  );
}
