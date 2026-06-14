import { ApiError, isStaleRevisionError } from "@/api/client";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

export function handleMutationError(error: unknown, fallback = "Save failed."): string {
  if (error instanceof ApiError) {
    if (isStaleRevisionError(error)) {
      useRevisionSyncStore.getState().markStale(null);
      if (error.staleRevision?.current_edit_sequence != null) {
        useRevisionSyncStore
          .getState()
          .setEditSequence(error.staleRevision.current_edit_sequence);
      }
      return "Design changed while you were editing. Refresh to continue.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
