import type { ProjectionLevel } from "@/api/types";

export function connectionScopeForLevel(
  level: ProjectionLevel,
  focusId: string | null,
  selectedNodeKind: string | null,
): {
  kind: "all" | "vehicle" | "enclosure" | "node" | "connector";
  id: string | null;
} {
  if (focusId) {
    if (level === "enclosure") return { kind: "enclosure", id: focusId };
    if (level === "node") return { kind: "node", id: focusId };
    if (
      level === "connector" ||
      selectedNodeKind === "connector" ||
      selectedNodeKind === "inlineConnector" ||
      selectedNodeKind === "panelMount" ||
      selectedNodeKind === "group"
    )
      return { kind: "connector", id: focusId };
  }
  return { kind: "vehicle", id: null };
}
