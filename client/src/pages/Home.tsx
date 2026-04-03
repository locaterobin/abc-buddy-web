import { useState, useEffect, useRef, useCallback } from "react";
import { PlusCircle, Search, ClipboardList, CalendarCheck, Menu, X, Settings, LogOut, ScrollText, Copy, Trash2 } from "lucide-react";
import { getPendingRecords, getPendingPlanPhotos } from "../hooks/useOfflineQueue";
import { useTeam } from "../contexts/TeamContext";
import { clearStaffSession } from "./LoginPage";
import AddRecord from "./AddRecord";
import Lookup from "./Lookup";
import SettingsPage from "./SettingsPage";
import ConfigPage from "./ConfigPage";
import ReleasePlanPage from "./ReleasePlanPage";
import { getLogEntries, clearLog, formatIST, type LogEntry } from "../lib/appLog";

type Tab = "add" | "lookup" | "records" | "releases";
const VALID_TABS: Tab[] = ["add", "lookup", "records", "releases"];

function getTabFromHash(): Tab {
  const hash = window.location.hash.replace("#", "") as Tab;
  return VALID_TABS.includes(hash) ? hash : "add";
}

export default function Home({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromHash);

  const navigateTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  const openLog = useCallback(async () => {
    const entries = await getLogEntries();
    setLogEntries(entries);
    setLogOpen(true);
    setDrawerOpen(false);
  }, []);

  const handleClearLog = useCallback(async () => {
    await clearLog();
    setLogEntries([]);
  }, []);

  const handleCopyLog = useCallback(() => {
    const text = logEntries
      .map(e => `[${formatIST(e.ts)}] [${e.level.toUpperCase()}] ${e.dogId ? `[${e.dogId}] ` : ""}${e.message}`)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }, [logEntries]);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "updated" | "latest">("idle");
  const { staffSession } = useTeam();
  const isManager = staffSession?.role?.toLowerCase() === "manager";
  const buildVersion = __BUILD_ID__;

  const handleCheckForUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          // If a new SW is waiting, activate it
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
            setUpdateStatus("updated");
            setTimeout(() => window.location.reload(), 800);
            return;
          }
          // Listen for a new SW installing
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) { resolved = true; setUpdateStatus("latest"); }
          }, 4000);
          reg.addEventListener("updatefound", () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener("statechange", () => {
              if (newSW.state === "installed" && navigator.serviceWorker.controller) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  newSW.postMessage({ type: "SKIP_WAITING" });
                  setUpdateStatus("updated");
                  setTimeout(() => window.location.reload(), 800);
                }
              }
            });
          });
          return;
        }
      }
      // Fallback: hard reload
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }, []);

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
    <div className="flex flex-col bg-background" style={{ height: 'var(--app-height, 100dvh)' }}>
      {/* Header */}
      <header className="flex-shrink-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032736616/hPjpqQFScRPNzVz7QPH5a8/abc-buddy-icon-v2_b484f5a1.png" alt="ABC Buddy" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground leading-tight">ABC Buddy</h1>
            <span className="text-[10px] font-mono text-muted-foreground leading-tight">build {buildVersion}</span>
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
            onClick={() => navigateTab("add")}
            icon={<PlusCircle size={20} />}
            label="Catch"
          />
          <TabButton
            active={activeTab === "lookup"}
            onClick={() => navigateTab("lookup")}
            icon={<Search size={20} />}
            label="Tag"
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
          <TabButton
            active={activeTab === "releases"}
            onClick={() => navigateTab("releases")}
            icon={<CalendarCheck size={20} />}
            label="Release"
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
              <DrawerItem
                icon={
                  updateStatus === "checking" ? (
                    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : updateStatus === "updated" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  )
                }
                label={
                  updateStatus === "checking" ? "Checking..." :
                  updateStatus === "updated" ? "Updating..." :
                  updateStatus === "latest" ? "Already up to date" :
                  "Check for Update"
                }
                onClick={() => { handleCheckForUpdate(); }}
              />
              {isManager && (
                <DrawerItem
                  icon={<ClipboardList size={18} />}
                  label="Records"
                  active={activeTab === "records"}
                  onClick={() => {
                    setDrawerOpen(false);
                    navigateTab("records");
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
              <DrawerItem
                icon={<ScrollText size={18} />}
                label="Activity Log"
                onClick={openLog}
              />
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
              <p className="text-[10px] text-muted-foreground font-mono">ABC Buddy build {buildVersion}</p>
              <p className="text-[9px] text-muted-foreground/60 font-sans tracking-widest uppercase">by Peepal Farm</p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log overlay */}
      {logOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="flex-shrink-0 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setLogOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="font-semibold text-foreground flex-1">Activity Log</h2>
            <button onClick={handleCopyLog} title="Copy log" className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Copy size={16} />
            </button>
            <button onClick={handleClearLog} title="Clear log" className="w-8 h-8 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 size={16} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
            {logEntries.length === 0 && (
              <p className="text-muted-foreground text-center py-8">No log entries yet.</p>
            )}
            {logEntries.map(entry => {
              const levelColor =
                entry.level === "error" ? "text-destructive" :
                entry.level === "success" ? "text-green-500" :
                entry.level === "warn" ? "text-yellow-500" :
                "text-muted-foreground";
              return (
                <div key={entry.id} className={`py-1.5 border-b border-border/40 ${levelColor}`}>
                  {/* Row 1: timestamp · level · dogId */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">{formatIST(entry.ts)}</span>
                    <span className="shrink-0 uppercase text-[9px] font-bold tracking-wider">{entry.level}</span>
                    {entry.dogId && (
                      <span className="shrink-0 font-mono text-[10px] text-primary/80">{entry.dogId}</span>
                    )}
                  </div>
                  {/* Row 2: message spanning full width */}
                  <p className="text-[11px] break-all mt-0.5 leading-snug">{entry.message}</p>
                </div>
              );
            })}
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
