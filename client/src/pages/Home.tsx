import { useState, useEffect, useRef, useCallback } from "react";
import { PlusCircle, Search, ClipboardList, CalendarCheck, Menu, X, Settings, LogOut } from "lucide-react";
import { getPendingRecords, getPendingPlanPhotos } from "../hooks/useOfflineQueue";
import { useTeam } from "../contexts/TeamContext";
import { clearStaffSession } from "./LoginPage";
import AddRecord from "./AddRecord";
import Lookup from "./Lookup";
import SettingsPage from "./SettingsPage";
import ConfigPage from "./ConfigPage";
import ReleasePlanPage from "./ReleasePlanPage";

type Tab = "add" | "lookup" | "records" | "releases";

export default function Home({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const { staffSession } = useTeam();
  const isManager = staffSession?.role?.toLowerCase() === "manager";

  // Refresh pending count every 5 seconds and on focus
  const refreshPendingCount = useCallback(async () => {
    try {
      const teamId = localStorage.getItem("teamIdentifier") ?? "";
      const [records, planPhotos] = await Promise.all([
        getPendingRecords(teamId),
        getPendingPlanPhotos(),
      ]);
      setPendingCount(records.length + planPhotos.length);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 5000);
    window.addEventListener("focus", refreshPendingCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshPendingCount);
    };
  }, [refreshPendingCount]);

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
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032736616/hPjpqQFScRPNzVz7QPH5a8/abc-buddy-icon-v2_b484f5a1.png" alt="ABC Buddy" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground leading-tight">ABC Buddy</h1>
            <span className="text-[10px] font-mono text-muted-foreground leading-tight">v1.0.0</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Org name badge from session */}
          <OrgBadge />
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
      <nav className="flex-shrink-0 bg-card border-t border-border" style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
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
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
          <TabButton
            active={activeTab === "releases"}
            onClick={() => setActiveTab("releases")}
            icon={<CalendarCheck size={20} />}
            label="Releases"
          />
        </div>
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
              {isManager && (
                <DrawerItem
                  icon={<ClipboardList size={18} />}
                  label="Records"
                  active={activeTab === "records"}
                  onClick={() => {
                    setDrawerOpen(false);
                    setActiveTab("records");
                  }}
                />
              )}
              {isManager && (
                <DrawerItem
                  icon={<Settings size={18} />}
                  label="Settings"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSettingsOpen(true);
                  }}
                />
              )}
            </div>

            {/* Drawer footer */}
            <div className="px-4 py-4 border-t border-border space-y-3">
              {onLogout && (
                <button
                  onClick={() => {
                    clearStaffSession();
                    setDrawerOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-2 w-full text-sm text-destructive hover:text-destructive/80 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              )}
              <p className="text-[10px] text-muted-foreground font-mono">ABC Buddy v1.0.0</p>
              <p className="text-[9px] text-muted-foreground/60 font-sans tracking-widest uppercase">by Peepal Farm</p>
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
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
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

function OrgBadge() {
  const { staffSession } = useTeam();
  const label = staffSession
    ? `${staffSession.name} @ ${staffSession.orgName || staffSession.teamId}`
    : "@peepalfarm";
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 max-w-[180px]">
      <div className="w-2 h-2 flex-shrink-0 rounded-full bg-primary" />
      <span className="text-xs font-mono font-medium text-muted-foreground truncate">{label}</span>
    </div>
  );
}
