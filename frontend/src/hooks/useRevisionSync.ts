import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRevisions } from "@/api/revisions";
import { invalidateAllRevisionData, invalidateRevisionDomains } from "@/lib/revisionInvalidation";
import { buildWsUrl } from "@/lib/wsUrl";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

interface RevisionChangedEvent {
  type: "revision_changed";
  vehicle_id: string;
  revision_id: string;
  edit_sequence: number;
  domains: string[];
  changed_by: string | null;
}

interface RevisionPublishedEvent {
  type: "revision_published";
  vehicle_id: string;
  old_revision_id: string;
  new_revision_id: string;
  edit_sequence: number;
  changed_by: string | null;
}

type SyncEvent = RevisionChangedEvent | RevisionPublishedEvent;

export function useRevisionSync(): void {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);

  const setEditSequence = useRevisionSyncStore((s) => s.setEditSequence);
  const markStale = useRevisionSyncStore((s) => s.markStale);
  const clearStale = useRevisionSyncStore((s) => s.clearStale);
  const dirtyFormCount = useRevisionSyncStore((s) => s.dirtyFormCount);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);
  const setSyncStatus = useRevisionSyncStore((s) => s.setSyncStatus);
  const syncStatus = useRevisionSyncStore((s) => s.syncStatus);
  const reset = useRevisionSyncStore((s) => s.reset);

  const dirtyRef = useRef(dirtyFormCount);
  const sequenceRef = useRef(editSequence);
  dirtyRef.current = dirtyFormCount;
  sequenceRef.current = editSequence;

  const { data: revisionsData } = useQuery({
    queryKey: ["revisions", vehicleId],
    queryFn: () => fetchRevisions(vehicleId!),
    enabled: Boolean(vehicleId),
    refetchInterval: syncStatus === "polling" ? 10_000 : false,
  });

  useEffect(() => {
    if (!revisionId || !revisionsData) return;
    const current = revisionsData.revisions.find((r) => r.id === revisionId);
    if (current?.edit_sequence != null) {
      setEditSequence(current.edit_sequence);
    }
  }, [revisionId, revisionsData, setEditSequence]);

  useEffect(() => {
    if (!vehicleId || !revisionId) {
      reset();
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let attempt = 0;

    const handleEvent = (event: SyncEvent) => {
      if (event.type === "revision_published") {
        if (event.old_revision_id === revisionId) {
          selectVehicle(vehicleId, event.new_revision_id);
          setEditSequence(event.edit_sequence);
          clearStale();
          invalidateAllRevisionData(queryClient);
        }
        return;
      }

      if (event.revision_id !== revisionId) return;
      if (event.edit_sequence <= sequenceRef.current) return;

      setEditSequence(event.edit_sequence);

      if (dirtyRef.current > 0) {
        markStale(event.changed_by);
        return;
      }

      invalidateRevisionDomains(queryClient, event.domains);
    };

    const connect = () => {
      if (closed) return;
      setSyncStatus("reconnecting");
      socket = new WebSocket(
        buildWsUrl(`/ws/vehicles/${vehicleId}/revisions/${revisionId}`),
      );

      socket.onopen = () => {
        attempt = 0;
        setSyncStatus("connected");
      };

      socket.onmessage = (message) => {
        try {
          handleEvent(JSON.parse(message.data as string) as SyncEvent);
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setSyncStatus("polling");
        const delay = Math.min(30_000, 1_000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      reset();
    };
  }, [
    vehicleId,
    revisionId,
    queryClient,
    selectVehicle,
    setEditSequence,
    markStale,
    clearStale,
    setSyncStatus,
    reset,
  ]);
}
