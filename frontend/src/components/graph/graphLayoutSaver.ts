/**
 * Debounced layout saver for the Topology Graph View.
 *
 * When the user drags graph nodes, each drag-stop is recorded as a pending
 * layout record. Saves are debounced over a 500 ms quiet window: every new
 * drag-stop replaces that node's pending entry and resets a single shared
 * timer, so only the *final* position per node within the quiet window is ever
 * dispatched. When the timer fires, the whole pending map is flushed as one
 * batch (a single PATCH) and cleared.
 *
 * The core ({@link createLayoutSaver}) is a pure, framework-free state machine:
 * timer functions are injectable so it can be driven by fake timers and random
 * drag-stop sequences in property tests. A thin React hook
 * ({@link useDebouncedLayoutSaver}) wraps it for use inside `GraphView`.
 *
 * Requirements: 3.1
 */
import { useEffect, useRef } from "react";

import type { TopologyLayoutRecord } from "../../api/types";

/** Default debounce quiet window in milliseconds (Req 3.1). */
export const DEFAULT_DEBOUNCE_MS = 500;

/** Minimal timer surface so the core can run under real or fake timers. */
export type TimerHandle = ReturnType<typeof setTimeout>;
export type SetTimeoutFn = (cb: () => void, ms: number) => TimerHandle;
export type ClearTimeoutFn = (handle: TimerHandle) => void;

export interface LayoutSaverOptions {
  /** Called with the batch of pending records when the quiet window elapses. */
  onFlush: (records: TopologyLayoutRecord[]) => void;
  /** Debounce window in ms; defaults to {@link DEFAULT_DEBOUNCE_MS}. */
  delayMs?: number;
  /** Injectable timer scheduler; defaults to the global `setTimeout`. */
  setTimeoutFn?: SetTimeoutFn;
  /** Injectable timer canceller; defaults to the global `clearTimeout`. */
  clearTimeoutFn?: ClearTimeoutFn;
}

export interface LayoutSaver {
  /**
   * Record a drag-stop for `nodeId`. Replaces any pending entry for that node
   * (keeping only the latest position) and resets the debounce timer.
   */
  enqueue: (nodeId: string, record: TopologyLayoutRecord) => void;
  /** Immediately flush any pending records and clear the timer. No-op if empty. */
  flushNow: () => void;
  /** Discard any pending records and cancel the timer without flushing. */
  cancel: () => void;
  /** Number of nodes currently pending. */
  pendingSize: () => number;
  /** Snapshot of the pending records in insertion order (for inspection/tests). */
  pendingRecords: () => TopologyLayoutRecord[];
}

/**
 * Create a debounced layout saver.
 *
 * The pending map is keyed by node id so repeated drag-stops of the same node
 * coalesce to its most recent position. Each `enqueue` resets a single timer;
 * when it fires, the pending records are flushed as one batch and cleared.
 */
export function createLayoutSaver(opts: LayoutSaverOptions): LayoutSaver {
  const delayMs = opts.delayMs ?? DEFAULT_DEBOUNCE_MS;
  const schedule: SetTimeoutFn =
    opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const unschedule: ClearTimeoutFn =
    opts.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  // Insertion-ordered pending map; later sets for the same key overwrite the
  // value but preserve the original insertion position (Map semantics).
  const pending = new Map<string, TopologyLayoutRecord>();
  let timer: TimerHandle | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      unschedule(timer);
      timer = null;
    }
  }

  function flushNow(): void {
    clearTimer();
    if (pending.size === 0) return;
    const batch = Array.from(pending.values());
    pending.clear();
    opts.onFlush(batch);
  }

  function enqueue(nodeId: string, record: TopologyLayoutRecord): void {
    // Replace the node's entry with its latest position (Req 3.1).
    pending.set(nodeId, record);
    // Reset the single shared timer so the window restarts on every drag-stop.
    clearTimer();
    timer = schedule(flushNow, delayMs);
  }

  function cancel(): void {
    clearTimer();
    pending.clear();
  }

  return {
    enqueue,
    flushNow,
    cancel,
    pendingSize: () => pending.size,
    pendingRecords: () => Array.from(pending.values()),
  };
}

/**
 * React hook wrapping {@link createLayoutSaver}. The saver instance is stable
 * across renders; the latest `onFlush` is always invoked via a ref so callers
 * can pass an inline closure without recreating the saver. Any pending batch is
 * flushed on unmount so an in-flight quiet window is not silently dropped.
 */
export function useDebouncedLayoutSaver(
  onFlush: (records: TopologyLayoutRecord[]) => void,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): LayoutSaver {
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const saverRef = useRef<LayoutSaver | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createLayoutSaver({
      delayMs,
      onFlush: (records) => onFlushRef.current(records),
    });
  }

  useEffect(() => {
    const saver = saverRef.current;
    return () => {
      saver?.flushNow();
    };
  }, []);

  return saverRef.current;
}
