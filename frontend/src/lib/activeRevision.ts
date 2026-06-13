import type { Revision } from "@/api/revisions";
import type { Vehicle } from "@/api/types";

/** Resolve the draft revision the user should be working on. */
export function resolveActiveRevision(
  revisions: Revision[] | undefined,
  vehicle: Vehicle | undefined,
  selectedRevisionId: string | null,
): Revision | undefined {
  if (!revisions?.length) return undefined;

  if (vehicle?.current_revision_id) {
    const head = revisions.find((r) => r.id === vehicle.current_revision_id);
    if (head && !head.is_immutable) return head;
  }

  const draft = revisions.find((r) => !r.is_immutable);
  if (draft) return draft;

  if (selectedRevisionId) {
    return revisions.find((r) => r.id === selectedRevisionId);
  }

  return undefined;
}

export function nextRevisionNumber(revisions: Revision[] | undefined): number | null {
  if (!revisions?.length) return null;
  return Math.max(...revisions.map((r) => r.revision_number)) + 1;
}
