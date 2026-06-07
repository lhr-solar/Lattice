import { apiFetch } from "./client";

export function clearLibraries() {
  return apiFetch<void>("/dev-tools/clear-libraries", {
    method: "POST",
  });
}
