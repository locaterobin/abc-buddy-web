import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import type { StaffSession } from "../pages/LoginPage";

interface TeamContextType {
  teamId: string;
  setTeamId: (id: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  staffSession: StaffSession | null;
}

const TeamContext = createContext<TeamContextType | null>(null);

function generateFallbackId(): string {
  const adj = ["swift", "brave", "calm", "bold", "keen"];
  const noun = ["falcon", "tiger", "eagle", "panda", "otter"];
  return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}`;
}

const ENV_DEFAULT_TEAM_ID = import.meta.env.VITE_DEFAULT_TEAM_ID || "";
const ENV_DEFAULT_WEBHOOK_URL = import.meta.env.VITE_DEFAULT_WEBHOOK_URL || "";

export function TeamProvider({ children, staffSession = null }: { children: ReactNode; staffSession?: StaffSession | null }) {
  const [teamId, setTeamIdState] = useState<string>(() => {
    // If logged in via Airtable, use their teamId
    if (staffSession?.teamId) return staffSession.teamId;
    const stored = localStorage.getItem("abc-buddy-team-id");
    return stored || ENV_DEFAULT_TEAM_ID || generateFallbackId();
  });

  // When staffSession changes (login/logout), update teamId
  useEffect(() => {
    if (staffSession?.teamId) {
      setTeamIdState(staffSession.teamId);
      localStorage.setItem("abc-buddy-team-id", staffSession.teamId);
    }
  }, [staffSession?.teamId]);

  const [webhookUrl, setWebhookUrlState] = useState<string>(() => {
    return localStorage.getItem("abc-buddy-webhook-url") || ENV_DEFAULT_WEBHOOK_URL;
  });

  useEffect(() => {
    localStorage.setItem("abc-buddy-team-id", teamId);
  }, [teamId]);

  const setTeamId = useCallback((id: string) => {
    setTeamIdState(id);
    localStorage.setItem("abc-buddy-team-id", id);
  }, []);

  const setWebhookUrl = useCallback((url: string) => {
    setWebhookUrlState(url);
    localStorage.setItem("abc-buddy-webhook-url", url);
  }, []);

  return (
    <TeamContext.Provider value={{ teamId, setTeamId, webhookUrl, setWebhookUrl, staffSession }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
