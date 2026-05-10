import { useState, useRef } from "react";
import { MapWorkspace } from "./components/map/MapWorkspace";
import { ParcelSidePanel } from "./components/parcels/ParcelSidePanel";
import { TopBar } from "./components/layout/TopBar";
import { ImportPlanModal } from "./components/import/ImportPlanModal";
import type { ParcelFeature } from "./types/parcel";
import type { ExtractedPlan } from "./components/import/ImportPlanModal";

export default function App() {
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<ExtractedPlan | null>(null);

  // Ref to trigger map refresh from outside MapWorkspace
  const refreshParcelsRef = useRef<(() => void) | null>(null);

  function handleParcelClick(parcel: ParcelFeature) {
    setSelectedParcel(parcel);
    setSidePanelOpen(true);
  }

  function handleClosePanel() {
    setSidePanelOpen(false);
    setSelectedParcel(null);
  }

  function handleParcelRegistered(_parcelId: string, _parcelNumber: string) {
    setImportModalOpen(false);
    setPreviewPlan(null);
    // Refresh map to show the newly registered parcel
    refreshParcelsRef.current?.();
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-950">
      <TopBar onImportClick={() => setImportModalOpen(true)} />

      <div className="flex flex-1 overflow-hidden relative">
        <MapWorkspace
          onParcelClick={handleParcelClick}
          previewPlan={previewPlan}
          onRefreshReady={(fn) => { refreshParcelsRef.current = fn; }}
        />

        {sidePanelOpen && selectedParcel && (
          <ParcelSidePanel
            parcel={selectedParcel}
            onClose={handleClosePanel}
          />
        )}
      </div>

      {importModalOpen && (
        <ImportPlanModal
          onClose={() => { setImportModalOpen(false); setPreviewPlan(null); }}
          onParcelRegistered={handleParcelRegistered}
          onPreviewReady={(plan) => setPreviewPlan(plan)}
        />
      )}
    </div>
  );
}
