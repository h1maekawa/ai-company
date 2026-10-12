import { loadClusters, loadDailyXPlans, loadPerformance, loadSocialDrafts } from "../../note/research/store";
import { tokyoDateKey } from "../../note/tokyoDate";
import { getExecutionStore } from "../execution/store";
import { readMorningBriefEvidence } from "./morningBriefEvidenceReader";
import { buildXObservabilityProjection } from "./xProjection";

/**
 * Read-only adapter over canonical Content stores.
 * Keep this module free of save/upsert/publish/execute imports.
 */
export async function readXObservabilityProjection() {
  const now = new Date();
  const [plans, drafts, performance, clusters, morningBrief] = await Promise.all([
    loadDailyXPlans(), loadSocialDrafts(), loadPerformance(), loadClusters(),
    readMorningBriefEvidence(getExecutionStore(), tokyoDateKey(now)).catch(() => null),
  ]);
  return buildXObservabilityProjection({ plans, drafts, performance: performance.records, clusters, morningBrief, now });
}
