import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRevisions } from "@/api/revisions";
import type { PinShort } from "@/api/shorts";
import type { DesignEdgeDto, DesignGraphProjectionDto } from "@/api/types";
import type { TopologySummary } from "@/api/topology";
import { invalidateAllRevisionData, invalidateRevisionDomains } from "@/lib/revisionInvalidation";
import { buildWsUrl } from "@/lib/wsUrl";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";
import { useSessionStore } from "@/stores/sessionStore";

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

type MutationPatch =
  | {
      kind: "edge_created" | "edge_deleted";
      edge_id: string;
      pin_a_id: string;
      pin_b_id: string;
    }
  | {
      kind: "short_created" | "short_deleted";
      short_id: string;
      connector_instance_id: string;
      pin_a_id: string;
      pin_b_id: string;
      projection_edge_id: string;
    };

interface MutationPatchEvent {
  type: "mutation_patch";
  vehicle_id: string;
  revision_id: string;
  edit_sequence: number;
  domains: string[];
  covered_domains: string[];
  changed_by: string | null;
  event_id: string;
  occurred_at: string;
  patch: MutationPatch;
}

type SyncEvent = RevisionChangedEvent | RevisionPublishedEvent | MutationPatchEvent;

function makeWireProjectionEdge(edgeId: string, pinAId: string, pinBId: string): DesignEdgeDto {
  return {
    id: edgeId,
    source: `port:${pinAId}`,
    target: `port:${pinBId}`,
    kind: "wire",
    data: {},
  };
}

function makeShortProjectionEdge(
  projectionEdgeId: string,
  connectorId: string,
  shortId: string,
  pinAId: string,
  pinBId: string,
): DesignEdgeDto {
  return {
    id: projectionEdgeId,
    source: `port:${pinAId}`,
    target: `port:${pinBId}`,
    kind: "short",
    data: {
      short: true,
      connectorInstanceId: connectorId,
      shortId,
    },
  };
}

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
  const username = useSessionStore((s) => s.username);

  const dirtyRef = useRef(dirtyFormCount);
  const sequenceRef = useRef(editSequence);
  const patchCoverageBySequenceRef = useRef<Map<number, Set<string>>>(new Map());
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

    const applyMutationPatch = (event: MutationPatchEvent) => {
      const patch = event.patch;
      if (patch.kind === "edge_created") {
        queryClient.setQueriesData<DesignGraphProjectionDto>(
          { queryKey: ["design-projection", event.vehicle_id, event.revision_id] },
          (current) => {
            if (!current) return current;
            if (current.edges.some((edge) => edge.id === patch.edge_id)) return current;
            return {
              ...current,
              edges: [...current.edges, makeWireProjectionEdge(patch.edge_id, patch.pin_a_id, patch.pin_b_id)],
            };
          },
        );
        queryClient.setQueriesData<TopologySummary>(
          { queryKey: ["topology-summary", event.vehicle_id, event.revision_id] },
          (current) => {
            if (!current) return current;
            return { ...current, edge_count: current.edge_count + 1 };
          },
        );
        return;
      }

      if (patch.kind === "edge_deleted") {
        queryClient.setQueriesData<DesignGraphProjectionDto>(
          { queryKey: ["design-projection", event.vehicle_id, event.revision_id] },
          (current) => {
            if (!current) return current;
            if (!current.edges.some((edge) => edge.id === patch.edge_id)) return current;
            return {
              ...current,
              edges: current.edges.filter((edge) => edge.id !== patch.edge_id),
            };
          },
        );
        queryClient.setQueriesData<TopologySummary>(
          { queryKey: ["topology-summary", event.vehicle_id, event.revision_id] },
          (current) => {
            if (!current) return current;
            return { ...current, edge_count: Math.max(0, current.edge_count - 1) };
          },
        );
        return;
      }

      if (patch.kind === "short_created") {
        queryClient.setQueriesData<DesignGraphProjectionDto>(
          { queryKey: ["design-projection", event.vehicle_id, event.revision_id] },
          (current) => {
            if (!current) return current;
            if (current.edges.some((edge) => edge.id === patch.projection_edge_id)) return current;
            return {
              ...current,
              edges: [
                ...current.edges,
                makeShortProjectionEdge(
                  patch.projection_edge_id,
                  patch.connector_instance_id,
                  patch.short_id,
                  patch.pin_a_id,
                  patch.pin_b_id,
                ),
              ],
            };
          },
        );
        queryClient.setQueriesData<PinShort[]>(
          {
            queryKey: ["shorts", event.vehicle_id, event.revision_id, patch.connector_instance_id],
          },
          (current) => {
            if (!current) return current;
            if (current.some((item) => item.id === patch.short_id)) return current;
            return [...current, { id: patch.short_id, pin_a_id: patch.pin_a_id, pin_b_id: patch.pin_b_id }];
          },
        );
        return;
      }

      if (patch.kind !== "short_deleted") return;

      queryClient.setQueriesData<DesignGraphProjectionDto>(
        { queryKey: ["design-projection", event.vehicle_id, event.revision_id] },
        (current) => {
          if (!current) return current;
          if (!current.edges.some((edge) => edge.id === patch.projection_edge_id)) return current;
          return {
            ...current,
            edges: current.edges.filter((edge) => edge.id !== patch.projection_edge_id),
          };
        },
      );
      queryClient.setQueriesData<PinShort[]>(
        {
          queryKey: ["shorts", event.vehicle_id, event.revision_id, patch.connector_instance_id],
        },
        (current) => {
          if (!current) return current;
          if (!current.some((item) => item.id === patch.short_id)) return current;
          return current.filter((item) => item.id !== patch.short_id);
        },
      );
    };

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

      if (event.type === "mutation_patch") {
        if (event.revision_id !== revisionId) return;
        if (event.edit_sequence < sequenceRef.current) return;

        setEditSequence(event.edit_sequence);
        const isOwnEdit = Boolean(
          event.changed_by && username && event.changed_by === username,
        );
        if (dirtyRef.current > 0 && !isOwnEdit) {
          markStale(event.changed_by);
          return;
        }

        applyMutationPatch(event);
        patchCoverageBySequenceRef.current.set(
          event.edit_sequence,
          new Set(event.covered_domains),
        );
        return;
      }

      if (event.revision_id !== revisionId) return;
      if (event.edit_sequence < sequenceRef.current) return;

      setEditSequence(event.edit_sequence);

      const isOwnEdit = Boolean(
        event.changed_by && username && event.changed_by === username,
      );

      if (dirtyRef.current > 0) {
        if (isOwnEdit) return;
        markStale(event.changed_by);
        return;
      }

      const coverage = patchCoverageBySequenceRef.current.get(event.edit_sequence);
      if (coverage) {
        const remainingDomains = event.domains.filter((domain) => !coverage.has(domain));
        patchCoverageBySequenceRef.current.delete(event.edit_sequence);
        if (remainingDomains.length > 0) {
          invalidateRevisionDomains(queryClient, remainingDomains);
        }
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
      patchCoverageBySequenceRef.current.clear();
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
