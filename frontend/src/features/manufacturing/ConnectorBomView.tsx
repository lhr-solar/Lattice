import { useQuery } from "@tanstack/react-query";
import { fetchConnectorBom } from "@/api/manufacturing";
import { useAppStore } from "@/stores/appStore";
import { cell, groupSubtotal, grandTotal } from "./bomHelpers";

export function ConnectorBomView() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["manufacturing-connector-bom", vehicleId, revisionId],
    queryFn: () => fetchConnectorBom(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-tesla-muted">
        <p>Loading connector BOM…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-tesla-muted">
        <p className="mb-4">Failed to load connector BOM.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-tesla-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-tesla-accent/80"
        >
          Retry
        </button>
      </div>
    );
  }

  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-tesla-muted">
        <p>No connectors found in this revision.</p>
      </div>
    );
  }

  const total = grandTotal(groups);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="min-w-max">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-tesla-surface/95 text-tesla-muted backdrop-blur">
            <tr className="border-b border-tesla-border">
              <th className="px-3 py-2 font-medium">Connector Name</th>
              <th className="px-3 py-2 font-medium">Pin Count</th>
              <th className="px-3 py-2 font-medium">Wire Gauge (AWG)</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Default Role</th>
              <th className="px-3 py-2 font-medium">Male Part #</th>
              <th className="px-3 py-2 font-medium">Female Part #</th>
              <th className="px-3 py-2 font-medium">Male Crimp Part #</th>
              <th className="px-3 py-2 font-medium">Female Crimp Part #</th>
              <th className="px-3 py-2 font-medium">Key Code</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const subtotal = groupSubtotal(group);
              return (
                <React.Fragment key={group.manufacturer ?? "unassigned"}>
                  <tr className="bg-tesla-border/10">
                    <td colSpan={11} className="px-3 py-2 font-bold uppercase tracking-wider text-tesla-text">
                      {group.manufacturer ?? "Unassigned"}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.connector_template_id} className="border-b border-tesla-border/40 hover:bg-tesla-border/20">
                      <td className="px-3 py-2">{cell(row.name)}</td>
                      <td className="px-3 py-2">{cell(row.pin_count)}</td>
                      <td className="px-3 py-2">{cell(row.wire_gauge_awg)}</td>
                      <td className="px-3 py-2 uppercase">{cell(row.connector_category)}</td>
                      <td className="px-3 py-2 capitalize">{cell(row.default_role)}</td>
                      <td className="px-3 py-2">{cell(row.male_part_number)}</td>
                      <td className="px-3 py-2">{cell(row.female_part_number)}</td>
                      <td className="px-3 py-2">{cell(row.male_crimp_part_number)}</td>
                      <td className="px-3 py-2">{cell(row.female_crimp_part_number)}</td>
                      <td className="px-3 py-2">{cell(row.key_code)}</td>
                      <td className="px-3 py-2 font-bold text-tesla-text">{row.quantity}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-tesla-border">
                    <td colSpan={10} className="px-3 py-2 text-right font-semibold text-tesla-muted">
                      Subtotal:
                    </td>
                    <td className="px-3 py-2 font-bold text-tesla-accent">{subtotal}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            <tr className="bg-tesla-accent/5">
              <td colSpan={10} className="px-3 py-4 text-right text-sm font-bold text-tesla-text">
                GRAND TOTAL:
              </td>
              <td className="px-3 py-4 text-sm font-black text-tesla-accent">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React from "react";
