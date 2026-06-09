import { useState } from "react";
import { login } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useSessionStore } from "@/stores/sessionStore";

export function LoginGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUser = useSessionStore((s) => s.setUser);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await login(trimmedUsername, password);
      setUser(auth.user.id, auth.user.username, auth.user.is_admin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
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
        <label className="mb-2 block text-sm text-tesla-muted">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          autoComplete="username"
          className="mb-4 w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-2 text-tesla-text outline-none transition focus:border-tesla-accent"
          autoFocus
        />
        <label className="mb-2 block text-sm text-tesla-muted">Password</label>
        <div className="relative mb-4">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
            className="w-full rounded-md border border-tesla-border bg-tesla-bg py-2 pl-3 pr-10 text-tesla-text outline-none transition focus:border-tesla-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-tesla-muted transition hover:text-tesla-text"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          className="w-full rounded-md bg-tesla-accent px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
