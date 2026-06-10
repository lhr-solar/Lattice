import type { QueryClient } from "@tanstack/react-query";

export const ALL_REVISION_QUERY_KEYS = [
  "connection-table",
  "connection-scopes",
  "manufacturing-wire-table",
  "nets",
  "pins",
  "net-detail",
  "shorts",
  "design-projection",
  "topology-summary",
  "hierarchy",
  "revisions",
  "vehicles",
] as const;

export function invalidateRevisionDomains(
  queryClient: QueryClient,
  domains: string[],
): void {
  const keys = new Set<string>(domains);
  if (keys.has("revision_published")) {
    for (const key of ALL_REVISION_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    return;
  }
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function invalidateAllRevisionData(queryClient: QueryClient): void {
  invalidateRevisionDomains(queryClient, [...ALL_REVISION_QUERY_KEYS]);
}
