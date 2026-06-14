/**
 * Unit + property tests for the `graphSubMode` slice of the Zustand appStore.
 *
 * Covers the store-reset behavior that backs the Canvas/Graph toggle:
 *   - `selectVehicle(...)` always resets `graphSubMode` to "canvas" regardless
 *     of the prior value (Req 1.5 — reset on vehicle/revision change; the
 *     "canvas" default is Req 1.4).
 *   - `setGraphSubMode(...)` toggles the sub-mode between "canvas" and "graph".
 *
 * Framework: Vitest + fast-check ({ numRuns: 100 }).
 */

import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

import { useAppStore, type GraphSubMode } from "./appStore";

const initialState = useAppStore.getState();

beforeEach(() => {
  // Restore the pristine store between tests (zustand store is a singleton).
  useAppStore.setState(initialState, true);
});

describe("appStore graphSubMode", () => {
  it("defaults to 'canvas' (Req 1.4)", () => {
    expect(useAppStore.getState().graphSubMode).toBe("canvas");
  });

  it("setGraphSubMode toggles the sub-mode", () => {
    const { setGraphSubMode } = useAppStore.getState();

    setGraphSubMode("graph");
    expect(useAppStore.getState().graphSubMode).toBe("graph");

    setGraphSubMode("canvas");
    expect(useAppStore.getState().graphSubMode).toBe("canvas");
  });

  it("selectVehicle resets graphSubMode to 'canvas' after it was set to 'graph' (Req 1.5)", () => {
    const store = useAppStore.getState();
    store.setGraphSubMode("graph");
    expect(useAppStore.getState().graphSubMode).toBe("graph");

    store.selectVehicle("veh-1", "rev-1");
    expect(useAppStore.getState().graphSubMode).toBe("canvas");
  });

  // Feature: topology-graph-view, Property: selectVehicle always yields
  // graphSubMode === "canvas" regardless of prior value, and setGraphSubMode
  // toggles state.
  // Validates: Requirements 1.4, 1.5
  it("selectVehicle always resets graphSubMode to 'canvas' for any prior value", () => {
    const subModeArb = fc.constantFrom<GraphSubMode>("canvas", "graph");
    const idArb = fc.option(fc.uuid(), { nil: null });

    fc.assert(
      fc.property(subModeArb, idArb, idArb, (prior, vehicleId, revisionId) => {
        // Arrange: force an arbitrary prior sub-mode.
        useAppStore.getState().setGraphSubMode(prior);
        expect(useAppStore.getState().graphSubMode).toBe(prior);

        // Act: select a (possibly null) vehicle/revision.
        useAppStore.getState().selectVehicle(vehicleId, revisionId);

        // Assert: the sub-mode is reset to "canvas" and the selection applied.
        const next = useAppStore.getState();
        expect(next.graphSubMode).toBe("canvas");
        expect(next.selectedVehicleId).toBe(vehicleId);
        expect(next.selectedRevisionId).toBe(revisionId);
      }),
      { numRuns: 100 },
    );
  });
});
