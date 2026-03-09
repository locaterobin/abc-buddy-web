import { useState } from "react";
import { PlusCircle, Search, ClipboardList, Settings } from "lucide-react";
import { useTeam } from "@/contexts/TeamContext";
import AddRecord from "./AddRecord";
import Lookup from "./Lookup";
import SettingsPage from "./SettingsPage";
import ConfigPage from "./ConfigPage";

type Tab = "add" | "lookup" | "records" | "settings";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const { teamId } = useTeam();

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex-shrink-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">AB</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground leading-tight">ABC Buddy</h1>
            <span className="text-[10px] font-mono text-muted-foreground leading-tight">v1.0.0</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-xs font-mono font-medium text-muted-foreground">{teamId}</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "add" && <AddRecord />}
        {activeTab === "lookup" && <Lookup />}
        {activeTab === "records" && <SettingsPage />}
        {activeTab === "settings" && <ConfigPage />}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 bg-card border-t border-border">
        <div className="flex">
          <TabButton
            active={activeTab === "add"}
            onClick={() => setActiveTab("add")}
            icon={<PlusCircle size={22} />}
            label="Add Record"
          />
          <TabButton
            active={activeTab === "lookup"}
            onClick={() => setActiveTab("lookup")}
            icon={<Search size={22} />}
            label="Lookup"
          />
          <TabButton
            active={activeTab === "records"}
            onClick={() => setActiveTab("records")}
            icon={<ClipboardList size={22} />}
            label="Records"
          />
          <TabButton
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
            icon={<Settings size={22} />}
            label="Settings"
          />
        </div>
        {/* Safe area for mobile */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
