import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

interface TeamContextType {
  teamId: string;
  setTeamId: (id: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
}

const TeamContext = createContext<TeamContextType | null>(null);

function generateFallbackId(): string {
  const adj = ["swift", "brave", "calm", "bold", "keen"];
  const noun = ["falcon", "tiger", "eagle", "panda", "otter"];
  return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}`;
}

const ENV_DEFAULT_TEAM_ID = import.meta.env.VITE_DEFAULT_TEAM_ID || "";
const ENV_DEFAULT_WEBHOOK_URL = import.meta.env.VITE_DEFAULT_WEBHOOK_URL || "";

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teamId, setTeamIdState] = useState<string>(() => {
    const stored = localStorage.getItem("abc-buddy-team-id");
    return stored || ENV_DEFAULT_TEAM_ID || generateFallbackId();
  });

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
    <TeamContext.Provider value={{ teamId, setTeamId, webhookUrl, setWebhookUrl }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
