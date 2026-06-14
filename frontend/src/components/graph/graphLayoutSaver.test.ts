/**
 * Property-based tests for the debounced layout saver of the Topology Graph
 * View (`graphLayoutSaver.ts`).
 *
 * Covers design Correctness Property 5:
 *   - Property 5 → the drag-save debounce dispatches at most one PATCH per
 *                  500 ms quiet window, and each node's dispatched payload is
 *                  that node's most recent drag-stop within the window (Req 3.1)
 *
 * Framework: Vitest + fast-check ({ numRuns: 100 }). The saver's timer
 * functions are injected with a deterministic virtual clock (fake timers) so a
 * random sequence of drag-stops can be replayed exactly.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  createLayoutSaver,
  type SetTimeoutFn,
  type ClearTimeoutFn,
  type TimerHandle,
} from "./graphLayoutSaver";
import type { TopologyLayoutRecord } from "../../api/types";

const DELAY_MS = 500;

// --- deterministic virtual clock (injectable fake timers) -----------------

/**
 * A minimal virtual clock that mimics setTimeout/clearTimeout. Timers fire in
 * (time, insertion-order) order as virtual time is advanced. The saver only
 * uses a single timer at a time, but the clock supports many for safety.
 */
class FakeClock {
  now = 0;
  private seq = 0;
  private timers = new Map<number, { time: number; cb: () => void }>();

  readonly setTimeout: SetTimeoutFn = (cb, ms) => {
    const id = ++this.seq;
    this.timers.set(id, { time: this.now + ms, cb });
    return id as unknown as TimerHandle;
  };

  readonly clearTimeout: ClearTimeoutFn = (handle) => {
    this.timers.delete(handle as unknown as number);
  };

  /** Advance virtual time to `target`, firing every timer due at or before it. */
  advanceTo(target: number): void {
    for (;;) {
      let nextId: number | null = null;
      let nextTime = Infinity;
      for (const [id, t] of this.timers) {
        if (t.time <= target && (t.time < nextTime || (t.time === nextTime && (nextId === null || id < nextId)))) {
          nextId = id;
          nextTime = t.time;
        }
      }
      if (nextId === null) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.now = timer.time;
      timer.cb();
    }
    this.now = target;
  }
}

// --- reference model ------------------------------------------------------

interface DragStop {
  entityId: string;
  x: number;
  y: number;
  gap: number; // ms since the previous drag-stop (or since t=0 for the first)
}

/**
 * Reference debounce semantics: group drag-stops into clusters where each
 * consecutive gap is strictly below the quiet window. A gap >= DELAY_MS ends
 * the current cluster (the prior cluster's timer fires before the next stop).
 * Each cluster produces exactly one flush; within a cluster the latest stop per
 * node wins (last-write-wins coalescing).
 */
function expectedClusters(stops: DragStop[]): Map<string, { x: number; y: number }>[] {
  const clusters: Map<string, { x: number; y: number }>[] = [];
  let current: Map<string, { x: number; y: number }> | null = null;
  stops.forEach((stop, i) => {
    const breaks = i === 0 || stop.gap >= DELAY_MS;
    if (breaks || current === null) {
      current = new Map();
      clusters.push(current);
    }
    current.set(stop.entityId, { x: stop.x, y: stop.y });
  });
  return clusters;
}

function toRecord(stop: DragStop): TopologyLayoutRecord {
  return {
    entity_kind: "enclosure_instance",
    entity_id: stop.entityId,
    x: stop.x,
    y: stop.y,
  };
}

// =========================================================================
// Property 5 (Task 9.2)
// =========================================================================

// Feature: topology-graph-view, Property 5: Drag-save debounce sends only the
// final position per quiet window — for any sequence of drag-stop events the
// debounced saver dispatches at most one PATCH per 500 ms quiet window, and the
// dispatched payload for each node equals that node's most recent drag-stop
// within the window (earlier intermediate positions are never sent).
// Validates: Requirements 3.1
describe("Property 5: drag-save debounce sends only the final position per quiet window (Req 3.1)", () => {
  it("flushes once per quiet window with each node's latest position", () => {
    // Gaps avoid exactly DELAY_MS so cluster boundaries are unambiguous:
    // a short gap (< 500) continues the window, a long gap (> 500) breaks it.
    const gapArb = fc.oneof(
      fc.integer({ min: 1, max: DELAY_MS - 1 }),
      fc.integer({ min: DELAY_MS + 1, max: 3000 }),
    );

    const stopArb = fc.record({
      entityId: fc.constantFrom("a", "b", "c", "d"),
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
      gap: gapArb,
    });

    const arb = fc.array(stopArb, { minLength: 1, maxLength: 30 });

    fc.assert(
      fc.property(arb, (stops: DragStop[]) => {
        const clock = new FakeClock();
        const flushes: TopologyLayoutRecord[][] = [];

        const saver = createLayoutSaver({
          delayMs: DELAY_MS,
          onFlush: (records) => flushes.push(records),
          setTimeoutFn: clock.setTimeout,
          clearTimeoutFn: clock.clearTimeout,
        });

        // Replay the drag-stops at their absolute timestamps.
        let t = 0;
        for (const stop of stops) {
          t += stop.gap;
          clock.advanceTo(t);
          saver.enqueue(`tg-node:${stop.entityId}`, toRecord(stop));
        }
        // Let the final quiet window elapse so the last cluster flushes.
        clock.advanceTo(t + DELAY_MS);

        const expected = expectedClusters(stops);

        // At most one flush per quiet window: exactly one flush per cluster.
        expect(flushes.length).toBe(expected.length);

        flushes.forEach((batch, i) => {
          // No node appears twice in a single batch (positions are coalesced).
          const ids = batch.map((r) => r.entity_id);
          expect(new Set(ids).size).toBe(ids.length);

          // The batch payload equals the cluster's latest position per node.
          const got = new Map(batch.map((r) => [r.entity_id, { x: r.x, y: r.y }]));
          expect(got).toEqual(expected[i]);
        });
      }),
      { numRuns: 100 },
    );
  });
});
