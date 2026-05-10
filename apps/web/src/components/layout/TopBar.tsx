import { Map, Search, Upload, BarChart2, List } from "lucide-react";

interface Props {
  onImportClick: () => void;
  onRegistryClick: () => void;
  registryOpen: boolean;
}

export function TopBar({ onImportClick, onRegistryClick, registryOpen }: Props) {
  return (
    <header className="h-12 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <Map size={18} className="text-blue-400" />
        <span className="font-semibold text-white text-sm tracking-wide">LIS</span>
        <span className="text-gray-600 text-xs ml-1">Land Information System</span>
      </div>

      <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 w-64">
        <Search size={13} className="text-gray-500" />
        <input
          type="text"
          placeholder="Search parcel, owner, title..."
          className="bg-transparent text-sm text-gray-300 placeholder:text-gray-600 outline-none w-full"
        />
      </div>

      <div className="flex-1" />

      <nav className="flex items-center gap-1">
        <button
          onClick={onRegistryClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border
            ${registryOpen
              ? "bg-blue-700 text-white border-blue-600"
              : "text-gray-300 hover:text-white hover:bg-gray-800 border-transparent hover:border-gray-700"
            }`}
        >
          <List size={13} />
          Registry
        </button>
        <button
          onClick={onImportClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300
                     hover:text-white hover:bg-gray-800 rounded-md transition-colors border border-transparent
                     hover:border-gray-700"
        >
          <Upload size={13} />
          Import Plan
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400
                           hover:text-white hover:bg-gray-800 rounded-md transition-colors">
          <BarChart2 size={13} />
          Dashboard
        </button>
      </nav>

      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
        P
      </div>
    </header>
  );
}
