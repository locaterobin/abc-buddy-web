import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface StaffSession {
  name: string;
  staffId: string;
  role: string;
  teamId: string;
  email: string;
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
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.airtable.login.useMutation({
    onSuccess: (data) => {
      const session: StaffSession = {
        name: data.name,
        staffId: data.staffId,
        role: data.role,
        teamId: data.teamId,
        email: data.email,
      };
      setStaffSession(session);
      onLogin(session);
      toast.success(`Welcome, ${data.name || data.email}`);
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    loginMutation.mutate({ email: email.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-2">
            AB
          </div>
          <h1 className="text-2xl font-bold text-foreground">ABC Buddy</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

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
