import { loadClusters, loadDailyXPlans, loadPerformance, loadSocialDrafts } from "../../note/research/store";
import { tokyoDateKey } from "../../note/tokyoDate";
import { getExecutionStore } from "../execution/store";
import { readMorningBriefEvidence } from "./morningBriefEvidenceReader";
import { buildXObservabilityProjection } from "./xProjection";
import { readCreatorThinkingRuntimeProjection } from "../../content/creator-thinking/runtimeProjectionReader";

/**
 * Read-only adapter over canonical Content stores.
 * Keep this module free of save/upsert/publish/execute imports.
 */
export async function readXObservabilityProjection() {
  const now = new Date();
  const [plans, drafts, performance, clusters, morningBrief, creatorThinking] = await Promise.all([
    loadDailyXPlans(), loadSocialDrafts(), loadPerformance(), loadClusters(),
    readMorningBriefEvidence(getExecutionStore(), tokyoDateKey(now)).catch(() => null),
    // PR-XT3: Creator Thinking Model Runtime ProjectionはSHADOW固定の追加フィールド。
    // 失敗してもX Observability本体を壊さない（空projectionへfallback）。
    readCreatorThinkingRuntimeProjection({ now }).catch(() => ({ mode: "SHADOW" as const, generatedAt: now.toISOString(), activeModelVersion: null, slots: [] })),
  ]);
  const projection = buildXObservabilityProjection({ plans, drafts, performance: performance.records, clusters, morningBrief, now });
  return { ...projection, creatorThinking };
}
