import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildWsUrl } from "@/lib/wsUrl";
import { usePresenceStore } from "@/stores/presenceStore";

interface PresenceChangedEvent {
  type: "presence_changed";
  connected_user_ids: string[];
  connected_count: number;
}

function applyPresenceSnapshot(event: PresenceChangedEvent) {
  usePresenceStore.getState().setSnapshot(event.connected_user_ids, event.connected_count);
}

export function usePresence(enabled: boolean): void {
  const queryClient = useQueryClient();
  const resetPresence = usePresenceStore((s) => s.reset);

  useEffect(() => {
    if (!enabled) {
      resetPresence();
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let attempt = 0;
    const presenceUrl = buildWsUrl("/ws/presence");

    const handlePresenceEvent = (event: PresenceChangedEvent) => {
      applyPresenceSnapshot(event);
      queryClient.refetchQueries({ queryKey: ["admin-users"] });
      queryClient.refetchQueries({ queryKey: ["admin-connected-count"] });
    };

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(presenceUrl);

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as PresenceChangedEvent;
          if (event.type === "presence_changed") {
            handlePresenceEvent(event);
          }
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (closed) return;
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
    };
  }, [enabled, queryClient, resetPresence]);
}
