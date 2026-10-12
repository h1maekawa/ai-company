/**
 * Creator Thinking Model Runtime Projectionの読み取りアダプタ（PR-XT3）。
 *
 * 既存Store（note/research/store.ts の DailyXPlan/SocialDraft、XT2の modelVersioningStore）を
 * 読むだけ。save/upsert/publish/executeは一切importしない（Observability adapterと同じ制約）。
 */

import { loadDailyXPlans, loadSocialDrafts } from "../../note/research/store";
import { loadModelVersions } from "./modelVersioningStore";
import {
  activeCreatorThinkingModel,
  buildCreatorThinkingRuntimeProjection,
  CREATOR_THINKING_RUNTIME_MODE,
  type CreatorThinkingSlotProjection,
} from "./runtimeProjection";

export type CreatorThinkingRuntimeProjectionResult = {
  mode: typeof CREATOR_THINKING_RUNTIME_MODE;
  generatedAt: string;
  activeModelVersion: string | null;
  slots: CreatorThinkingSlotProjection[];
};

export async function readCreatorThinkingRuntimeProjection(options?: {
  date?: string;
  accountKey?: string;
  now?: Date;
}): Promise<CreatorThinkingRuntimeProjectionResult> {
  const now = options?.now ?? new Date();
  const [plans, drafts, modelVersions] = await Promise.all([
    loadDailyXPlans(),
    loadSocialDrafts(),
    loadModelVersions(),
  ]);
  const activeModel = activeCreatorThinkingModel(modelVersions.versions);
  const targetPlans = options?.date
    ? plans.filter((plan) => plan.date === options.date && (!options.accountKey || plan.accountKey === options.accountKey))
    : plans;
  const slots = targetPlans.flatMap((plan) => buildCreatorThinkingRuntimeProjection({ plan, drafts, activeModel, now }));
  return {
    mode: CREATOR_THINKING_RUNTIME_MODE,
    generatedAt: now.toISOString(),
    activeModelVersion: activeModel?.version ?? null,
    slots,
  };
}
