/**
 * Creator Thinking Model Runtime Integration（X Creator Thinking Model / PR-XT3）。
 *
 * これは第二のDailyX実行経路ではない。既存の DailyXPlan / SocialDraft（note/research/types.ts）を
 * 読み取るだけで、生成・Safety Gate・Fact Gate・Publish Eligibility・Buffer予約のいずれにも関与しない。
 * Hot Confidenceも変更しない。
 *
 * Modeは常にSHADOW固定（この定数を変える以外にACTIVEへ切り替える経路を持たない）。
 * SHADOW projectionはPublish Queueに入らず、Skill Promotionの昇格対象にもならない
 * （eligibleForSkillPromotionは常にfalse）。
 *
 * CreatorFitは実データに基づく評価パイプラインが無い限り"NOT_EVALUATED"のまま保持し、
 * HIGH/LOWへ推測で埋めない（XT2のPerformance-sourced CreatorLearningArtifactと同じ方針）。
 */

import type { ContentPurpose, DailyXPlan, SocialDraft } from "../../note/research/types";
import type { CreatorThinkingModel } from "./types";

export type CreatorThinkingRuntimeMode = "SHADOW" | "ACTIVE";

/** この定数を変更しない限りACTIVEへは絶対に切り替わらない。Production運用判断はPR-XT3の範囲外。 */
export const CREATOR_THINKING_RUNTIME_MODE: CreatorThinkingRuntimeMode = "SHADOW";

export type CreatorFitSignal = "NOT_EVALUATED";

export type CreatorThinkingSlotProjection = {
  id: string;
  planId: string;
  slotId: string;
  draftId: string | null;
  purpose: ContentPurpose | null;
  slotStatus: DailyXPlan["slots"][number]["status"];
  activeModelId: string | null;
  activeModelVersion: string | null;
  creatorFitSignal: CreatorFitSignal;
  mode: CreatorThinkingRuntimeMode;
  /** SHADOW projectionからSkill Promotionへ昇格する経路は無い。常にfalse。 */
  eligibleForSkillPromotion: false;
  projectedAt: string;
};

/** versionsの中からACTIVEを1件だけ返す。複数ACTIVEは不正状態なので最初の1件のみ（昇格はModel Versioning側の責務）。 */
export function activeCreatorThinkingModel(versions: CreatorThinkingModel[]): CreatorThinkingModel | null {
  return versions.find((model) => model.status === "ACTIVE") ?? null;
}

/** 当日Planのslot単位でCreator Thinking Modelの参照状態を投影する。純関数・I/Oなし。 */
export function buildCreatorThinkingRuntimeProjection(input: {
  plan: DailyXPlan;
  drafts: SocialDraft[];
  activeModel: CreatorThinkingModel | null;
  now?: Date;
}): CreatorThinkingSlotProjection[] {
  const projectedAt = (input.now ?? new Date()).toISOString();
  return input.plan.slots.map((slot) => {
    const matching = input.drafts.filter((draft) => draft.planId === input.plan.id && draft.planSlotId === slot.id);
    const draft = matching.length === 1 ? matching[0] : null;
    return {
      id: `${input.plan.id}:${slot.id}`,
      planId: input.plan.id,
      slotId: slot.id,
      draftId: draft?.id ?? null,
      purpose: draft?.purpose ?? slot.purpose ?? null,
      slotStatus: slot.status,
      activeModelId: input.activeModel?.id ?? null,
      activeModelVersion: input.activeModel?.version ?? null,
      creatorFitSignal: "NOT_EVALUATED",
      mode: CREATOR_THINKING_RUNTIME_MODE,
      eligibleForSkillPromotion: false,
      projectedAt,
    };
  });
}

/** PR-XT3の範囲ではどのprojectionもLearning Candidateへ自動昇格しない（常にfalse）。 */
export function isEligibleForLearningCandidate(_projection: Pick<CreatorThinkingSlotProjection, "mode">): boolean {
  return false;
}
