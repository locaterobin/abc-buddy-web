import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TeamProvider } from "./contexts/TeamContext";
import Home from "./pages/Home";
import LoginPage, { getStaffSession, setStaffSession, type StaffSession } from "./pages/LoginPage";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { trpc } from "./lib/trpc";
import { WifiOff } from "lucide-react";

function AppInner() {
  const [session, setSession] = useState<StaffSession | null>(() => getStaffSession());
  const refreshMutation = trpc.airtable.refreshSession.useMutation();

  // On load: if session exists but webhookUrl is missing, silently re-fetch team data
  useEffect(() => {
    if (session && !session.webhookUrl && session.teamId) {
      refreshMutation.mutate(
        { teamId: session.teamId },
        {
          onSuccess: (data) => {
            if (data.webhookUrl) {
              const updated: StaffSession = { ...session, webhookUrl: data.webhookUrl, formUrl: data.formUrl || session.formUrl, orgName: data.orgName || session.orgName };
              setStaffSession(updated);
              setSession(updated);
            }
          },
        }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (s: StaffSession) => setSession(s);

  useUpdateCheck(() => {
    toast("A new version is available", {
      description: "Tap to refresh and get the latest update.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
    });
  });

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  return (
    <TeamProvider staffSession={session}>
      <TooltipProvider>
        <Toaster position="top-center" />
        {isOffline && session && (
          <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 text-white text-xs font-medium shadow-sm">
            <WifiOff size={12} className="flex-shrink-0" />
            <span>You are offline — Catch still works</span>
          </div>
        )}
        <div className={isOffline && session ? "pt-7" : ""}>
          {session ? <Home onLogout={() => setSession(null)} /> : <LoginPage onLogin={handleLogin} isOffline={isOffline} />}
        </div>
      </TooltipProvider>
    </TeamProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AppInner />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
