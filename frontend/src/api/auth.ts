import { apiFetch } from "./client";
import type { AuthResponse } from "./types";

export function login(username: string, password: string) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return apiFetch<AuthResponse>("/auth/me");
}
