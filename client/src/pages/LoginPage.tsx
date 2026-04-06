import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldAlert, WifiOff } from "lucide-react";

export interface StaffSession {
  name: string;
  staffId: string;
  role: string;
  teamId: string;
  email: string;
  orgName?: string;
  webhookUrl?: string;
  formUrl?: string;
}

const SESSION_KEY = "abc-buddy-staff-session";

export function getStaffSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StaffSession;
  } catch {
    return null;
  }
}

export function setStaffSession(session: StaffSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStaffSession() {
  localStorage.removeItem(SESSION_KEY);
}

interface LoginPageProps {
  onLogin: (session: StaffSession) => void;
  isOffline?: boolean;
}

export default function LoginPage({ onLogin, isOffline = false }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Check if this IP is blocked before showing the login form.
  // When offline, the query will error — treat that as "not blocked" so the
  // login form is still accessible (staff can't log in offline anyway, but
  // if they already have a cached session they won't reach this page).
  const ipBlockQuery = trpc.airtable.checkIpBlock.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
    // Don't refetch on window focus to avoid unnecessary network calls
    refetchOnWindowFocus: false,
  });

  const loginMutation = trpc.airtable.login.useMutation({
    onSuccess: (data) => {
      const session: StaffSession = {
        name: data.name,
        staffId: data.staffId,
        role: data.role,
        teamId: data.teamId,
        email: data.email,
        orgName: data.orgName,
        webhookUrl: data.webhookUrl,
        formUrl: data.formUrl,
      };
      setStaffSession(session);
      onLogin(session);
      toast.success(`Welcome, ${data.name || data.email}`);
    },
    onError: (err) => {
      if (err.message === "IP_BLOCKED") {
        // Force a re-check so the blocked screen appears
        ipBlockQuery.refetch();
      } else {
        toast.error(err.message || "Login failed");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    loginMutation.mutate({ email: email.trim(), password });
  };

  // Show loading while checking IP status — but only if we're online.
  // If offline (query errored with a network error), skip straight to the login form.
  const isNetworkError = ipBlockQuery.isError && !ipBlockQuery.data;
  if (ipBlockQuery.isLoading && !isNetworkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show blocked screen if IP is blocked
  if (ipBlockQuery.data?.blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 mb-2">
            <ShieldAlert size={32} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Access Blocked</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your IP address has been blocked due to too many failed login attempts.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Please contact your administrator to restore access.
            </p>
          </div>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground font-mono break-all">
                Blocked IP: {ipBlockQuery.data.ip}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white mb-2 overflow-hidden">
            <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032736616/hPjpqQFScRPNzVz7QPH5a8/abc-buddy-icon-v2_b484f5a1.png" alt="ABC Buddy" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ABC Buddy</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        {isOffline && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <WifiOff size={15} className="flex-shrink-0" />
            <span>No internet connection — sign in when you’re back online.</span>
          </div>
        )}

        <Card>
          <CardContent className="pt-5 pb-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loginMutation.isPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginMutation.isPending}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending || !email.trim() || !password.trim()}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
