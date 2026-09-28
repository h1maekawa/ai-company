import type { ResearchItem, TrendCluster } from "./research/types";

export type QuickXCandidate = TrendCluster & { items: ResearchItem[] };
export type QuickXSelection = { clusterId: string; sourceItemId: string };
export type QuickXRouteState =
  | { mode: "browse" }
  | { mode: "invalid-deep-link" }
  | { mode: "deep-link"; selection: QuickXSelection };

export function resolveQuickXRoute(
  candidates: QuickXCandidate[],
  params: { quickX?: string | null; clusterId?: string | null; sourceItemId?: string | null }
): QuickXRouteState {
  if (params.quickX !== "1") return { mode: "browse" };
  if (!params.clusterId || !params.sourceItemId) return { mode: "invalid-deep-link" };
  const cluster = candidates.find((candidate) =>
    candidate.id === params.clusterId && candidate.status === "candidate" && !candidate.blocked
  );
  const source = cluster?.items.find((item) =>
    item.id === params.sourceItemId && cluster.researchItemIds.includes(item.id)
  );
  return cluster && source
    ? { mode: "deep-link", selection: { clusterId: cluster.id, sourceItemId: source.id } }
    : { mode: "invalid-deep-link" };
}
