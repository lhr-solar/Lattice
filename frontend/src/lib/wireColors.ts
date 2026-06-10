export const WIRE_COLOR_PRESETS = [
  "BLK",
  "WHT",
  "RED",
  "BLU",
  "GRN",
  "YEL",
  "ORG",
  "BRN",
  "GRY",
  "PPL",
] as const;

const WIRE_COLOR_CSS: Record<string, string> = {
  BLK: "#1a1a1a",
  WHT: "#f5f5f5",
  RED: "#dc2626",
  BLU: "#2563eb",
  GRN: "#16a34a",
  YEL: "#eab308",
  ORG: "#ea580c",
  BRN: "#78350f",
  GRY: "#6b7280",
  PPL: "#7c3aed",
};

const FALLBACK_CSS = "#374151";

function primaryToken(label: string): string {
  return label.trim().split(/[/\s,\-+|]+/)[0]?.toUpperCase() ?? "";
}

export function resolveWireColorCss(label: string | null | undefined): string {
  if (!label?.trim()) return FALLBACK_CSS;
  const token = primaryToken(label);
  return WIRE_COLOR_CSS[token] ?? FALLBACK_CSS;
}

export function wireColorTextContrast(bg: string): string {
  const hex = bg.replace("#", "");
  if (hex.length !== 6) return "#f9fafb";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#f9fafb";
}

export function wireColorNeedsBorder(bg: string): boolean {
  return bg === WIRE_COLOR_CSS.WHT;
}
