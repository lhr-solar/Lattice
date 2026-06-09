const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/** Build a WebSocket URL that targets the same API host as REST calls. */
export function buildWsUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    const url = new URL(API_BASE);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const basePath = url.pathname.replace(/\/$/, "");
    return `${url.protocol}//${url.host}${basePath}${normalizedPath}`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(API_BASE, window.location.href);
  url.protocol = proto;
  const basePath = url.pathname.replace(/\/$/, "");
  return `${url.protocol}//${url.host}${basePath}${normalizedPath}`;
}
