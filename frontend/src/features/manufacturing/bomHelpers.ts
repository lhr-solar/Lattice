import type { BomRow, ManufacturerGroup } from "@/api/manufacturing";

/** Formatting helper for BOM cells: null/empty becomes a dash. */
export function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Compute subtotal for a group (sum of quantities). */
export function groupSubtotal(group: ManufacturerGroup): number {
  return group.rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
}

/** Compute grand total across all groups. */
export function grandTotal(groups: ManufacturerGroup[]): number {
  return groups.reduce((sum, group) => sum + groupSubtotal(group), 0);
}
