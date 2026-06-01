import { AppShell } from "@/components/shell/AppShell";
import { LoginGate } from "@/features/auth/LoginGate";
import { useSessionStore } from "@/stores/sessionStore";

export default function App() {
  const displayName = useSessionStore((s) => s.displayName);

  if (!displayName) {
    return <LoginGate />;
  }

  return <AppShell />;
}
