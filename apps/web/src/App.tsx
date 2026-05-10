import { useState, useRef, useCallback } from "react";
import { MapWorkspace } from "./components/map/MapWorkspace";
import { ParcelSidePanel } from "./components/parcels/ParcelSidePanel";
import { ParcelRegistry } from "./components/parcels/ParcelRegistry";
import { TopBar } from "./components/layout/TopBar";
import { ImportPlanModal } from "./components/import/ImportPlanModal";
import type { ParcelFeature } from "./types/parcel";
import type { ExtractedPlan } from "./components/import/ImportPlanModal";

export default function App() {
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<ExtractedPlan | null>(null);

  const refreshParcelsRef = useRef<(() => void) | null>(null);
  const flyToParcelRef = useRef<((parcelId: string) => void) | null>(null);
  const flyToCoordRef = useRef<((lng: number, lat: number, zoom?: number) => void) | null>(null);

  function handleParcelClick(parcel: ParcelFeature) {
    setSelectedParcel(parcel);
    setSidePanelOpen(true);
  }

  function handleParcelRegistered(parcelId: string, _parcelNumber: string) {
    setImportModalOpen(false);
    setPreviewPlan(null);
    // Refresh then fly — wait for source to update before flying
    refreshParcelsRef.current?.();
    setTimeout(() => flyToParcelRef.current?.(parcelId), 1200);
  }

  const handleCloseImport = useCallback(() => {
    setImportModalOpen(false);
    setPreviewPlan(null);
  }, []);

  const handlePreviewReady = useCallback((plan: ExtractedPlan | null) => {
    setPreviewPlan(plan);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-950">
      <TopBar
        onImportClick={() => setImportModalOpen(true)}
        onRegistryClick={() => setRegistryOpen(v => !v)}
        registryOpen={registryOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Parcel Registry — slides in from left */}
        {registryOpen && (
          <ParcelRegistry
            onClose={() => setRegistryOpen(false)}
            onFlyToParcel={(id) => {
              flyToParcelRef.current?.(id);
              setRegistryOpen(false);
            }}
            onSelectParcel={(parcel) => {
              setSelectedParcel(parcel);
              setSidePanelOpen(true);
            }}
          />
        )}

        <MapWorkspace
          onParcelClick={handleParcelClick}
          previewPlan={previewPlan}
          onRefreshReady={(fn) => { refreshParcelsRef.current = fn; }}
          onFlyToReady={(fn) => { flyToParcelRef.current = fn; }}
          onFlyToCoordReady={(fn) => { flyToCoordRef.current = fn; }}
        />

        {sidePanelOpen && selectedParcel && (
          <ParcelSidePanel
            parcel={selectedParcel}
            onClose={() => { setSidePanelOpen(false); setSelectedParcel(null); }}
          />
        )}
      </div>

      {importModalOpen && (
        <ImportPlanModal
          onClose={handleCloseImport}
          onParcelRegistered={handleParcelRegistered}
          onPreviewReady={handlePreviewReady}
        />
      )}
    </div>
  );
}
