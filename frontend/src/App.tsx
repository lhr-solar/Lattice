import { useEffect, useState } from "react";
import { fetchMe } from "@/api/auth";
import { AppShell } from "@/components/shell/AppShell";
import { AdminPage } from "@/features/admin/AdminPage";
import { LoginGate } from "@/features/auth/LoginGate";
import { useSessionStore } from "@/stores/sessionStore";

export default function App() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const setUser = useSessionStore((s) => s.setUser);
  const clearSession = useSessionStore((s) => s.clearSession);
  const [screen, setScreen] = useState<"app" | "admin">("app");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function validateSession() {
      try {
        const auth = await fetchMe();
        if (!cancelled) {
          setUser(auth.user.username, auth.user.is_admin);
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }
    validateSession();
    return () => {
      cancelled = true;
    };
  }, [setUser, clearSession]);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tesla-bg text-tesla-muted">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginGate />;
  }

  if (screen === "admin") {
    return <AdminPage onBack={() => setScreen("app")} />;
  }

  return <AppShell onOpenAdmin={() => setScreen("admin")} />;
}
