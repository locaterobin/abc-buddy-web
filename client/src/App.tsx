import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TeamProvider } from "./contexts/TeamContext";
import Home from "./pages/Home";
import LoginPage, { getStaffSession, type StaffSession } from "./pages/LoginPage";
import { useUpdateCheck } from "./hooks/useUpdateCheck";

function App() {
  const [session, setSession] = useState<StaffSession | null>(() => getStaffSession());

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

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TeamProvider staffSession={session}>
          <TooltipProvider>
            <Toaster position="top-center" />
            {session ? <Home onLogout={() => setSession(null)} /> : <LoginPage onLogin={handleLogin} />}
          </TooltipProvider>
        </TeamProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
