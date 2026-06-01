import { apiFetch } from "./client";
import type { SessionResponse } from "./types";

export function createSession(displayName: string) {
  return apiFetch<SessionResponse>("/session", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
}
