import { loadClusters, loadDailyXPlans, loadPerformance, loadSocialDrafts } from "../../note/research/store";
import { buildXObservabilityProjection } from "./xProjection";

/**
 * Read-only adapter over canonical Content stores.
 * Keep this module free of save/upsert/publish/execute imports.
 */
export async function readXObservabilityProjection() {
  const [plans, drafts, performance, clusters] = await Promise.all([
    loadDailyXPlans(), loadSocialDrafts(), loadPerformance(), loadClusters(),
  ]);
  return buildXObservabilityProjection({ plans, drafts, performance: performance.records, clusters });
}
