import { useState, useEffect, useRef } from "react";
import { PlusCircle, Search, ClipboardList, CalendarCheck, Menu, X, Settings } from "lucide-react";
import AddRecord from "./AddRecord";
import Lookup from "./Lookup";
import SettingsPage from "./SettingsPage";
import ConfigPage from "./ConfigPage";
import ReleasePlanPage from "./ReleasePlanPage";

type Tab = "add" | "lookup" | "records" | "releases";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [drawerOpen]);

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

        <div className="flex items-center gap-2">
          {/* @peepalfarm badge */}
          <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs font-mono font-medium text-muted-foreground">@peepalfarm</span>
          </div>
          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "add" && <div className="h-full overflow-y-auto"><AddRecord /></div>}
        {activeTab === "lookup" && <div className="h-full overflow-y-auto"><Lookup /></div>}
        {activeTab === "records" && <div className="h-full overflow-y-auto"><SettingsPage /></div>}
        {activeTab === "releases" && <div className="h-full overflow-y-auto"><ReleasePlanPage /></div>}
      </main>

      {/* Bottom Navigation — 4 tabs */}
      <nav className="flex-shrink-0 bg-card border-t border-border">
        <div className="flex">
          <TabButton
            active={activeTab === "add"}
            onClick={() => setActiveTab("add")}
            icon={<PlusCircle size={20} />}
            label="Catching"
          />
          <TabButton
            active={activeTab === "lookup"}
            onClick={() => setActiveTab("lookup")}
            icon={<Search size={20} />}
            label="Lookup"
          />
          <TabButton
            active={activeTab === "releases"}
            onClick={() => setActiveTab("releases")}
            icon={<CalendarCheck size={20} />}
            label="Releases"
          />
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* Drawer scrim + panel */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Scrim */}
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />

          {/* Drawer panel — slides in from right */}
          <div
            ref={drawerRef}
            className="w-64 bg-card border-l border-border flex flex-col shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <span className="font-semibold text-foreground">Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer items */}
            <div className="flex-1 py-2">
              <DrawerItem
                icon={<ClipboardList size={18} />}
                label="Records"
                active={activeTab === "records"}
                onClick={() => {
                  setDrawerOpen(false);
                  setActiveTab("records");
                }}
              />
              <DrawerItem
                icon={<Settings size={18} />}
                label="Settings"
                onClick={() => {
                  setDrawerOpen(false);
                  setSettingsOpen(true);
                }}
              />
            </div>

            {/* Drawer footer */}
            <div className="px-4 py-4 border-t border-border">
              <p className="text-[10px] text-muted-foreground font-mono">ABC Buddy v1.0.0</p>
              <p className="text-[10px] text-muted-foreground font-mono">@peepalfarm</p>
            </div>
          </div>
        </div>
      )}

      {/* Settings full-screen overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="flex-shrink-0 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="font-semibold text-foreground">Settings</h2>
          </header>
          <div className="flex-1 overflow-y-auto">
            <ConfigPage />
          </div>
        </div>
      )}
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
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function DrawerItem({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
        active ? "text-primary bg-primary/5" : "text-foreground hover:bg-muted"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      {label}
    </button>
  );
}
