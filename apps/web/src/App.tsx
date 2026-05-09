import { useState } from "react";
import { MapWorkspace } from "./components/map/MapWorkspace";
import { ParcelSidePanel } from "./components/parcels/ParcelSidePanel";
import { TopBar } from "./components/layout/TopBar";
import type { ParcelFeature } from "./types/parcel";

export default function App() {
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  function handleParcelClick(parcel: ParcelFeature) {
    setSelectedParcel(parcel);
    setSidePanelOpen(true);
  }

  function handleClosePanel() {
    setSidePanelOpen(false);
    setSelectedParcel(null);
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-950">
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Map fills the entire workspace */}
        <MapWorkspace onParcelClick={handleParcelClick} />

        {/* Side panel slides in over the map */}
        {sidePanelOpen && selectedParcel && (
          <ParcelSidePanel
            parcel={selectedParcel}
            onClose={handleClosePanel}
          />
        )}
      </div>
    </div>
  );
}
