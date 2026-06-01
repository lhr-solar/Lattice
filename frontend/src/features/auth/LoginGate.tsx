import { useState } from "react";
import { createSession } from "@/api/session";
import { useSessionStore } from "@/stores/sessionStore";

export function LoginGate() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useSessionStore((s) => s.setSession);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const session = await createSession(trimmed);
      setSession(session.display_name, session.session_id);
    } catch {
      setSession(trimmed, "local");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-tesla-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="panel-fade-in w-full max-w-md rounded-lg border border-tesla-border bg-tesla-surface p-8 shadow-xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tesla-accent/20 text-tesla-accent">
            ⚡
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Lattice</h1>
            <p className="text-sm text-tesla-muted">Wire harness topology planning</p>
          </div>
        </div>
        <label className="mb-2 block text-sm text-tesla-muted">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter display name"
          className="mb-4 w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-2 text-tesla-text outline-none transition focus:border-tesla-accent"
          autoFocus
        />
        {error && <p className="mb-3 text-sm text-tesla-accent">{error}</p>}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full rounded-md bg-tesla-accent px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
