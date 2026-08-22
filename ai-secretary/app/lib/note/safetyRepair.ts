import type { Brand } from "./types";
import type { ExperienceEntry, SocialDraft } from "./research/types";
import { runXSafetyGate, xWeightedLength, X_MAX_WEIGHTED_LENGTH } from "./operations";
import { callAI } from "../ai/client";

const UNVERIFIED_EXPERIENCE_REASON = "本人確認済みの根拠がない体験表現を含みます";

export function isRecoverableUnverifiedExperience(reasons: string[]): boolean {
  return reasons.length === 1 && reasons[0] === UNVERIFIED_EXPERIENCE_REASON;
}
const factualTokens = (text: string) => new Set([
  ...(text.match(/\d+(?:[.,]\d+)?%?/g) ?? []),
  ...(text.match(/https?:\/\/[^\s]+/g) ?? []),
]);

export const repairXUnverifiedExperienceWithAI = (text: string): Promise<string> =>
  callAI(
    text,
    `X投稿から、本人確認済み根拠のない一人称体験表現だけを削除してください。意味・意見・ブランドトーンを維持し、「調べると〜」「〜という考え方があります」等の事実・学習・意見表現へ直してください。新しい数値・URL・経験・実績・事実・強い断定を追加せず、280 weighted characters以内の本文だけを返してください。`,
    { provider: "auto" }
  );

export async function repairUnverifiedExperience(input: {
  draft: SocialDraft;
  brand: Brand;
  experiences: ExperienceEntry[];
  repair: (text: string) => Promise<string>;
}): Promise<{ draft: SocialDraft; repaired: boolean; reasons: string[] }> {
  const initial = runXSafetyGate(input);
  if (!isRecoverableUnverifiedExperience(initial.reasons)) {
    return { draft: input.draft, repaired: false, reasons: initial.reasons };
  }
  const repairedText = (await input.repair(input.draft.text)).trim();
  const beforeTokens = factualTokens(input.draft.text);
  const addedFact = [...factualTokens(repairedText)].some((token) => !beforeTokens.has(token));
  if (addedFact || xWeightedLength(repairedText) > X_MAX_WEIGHTED_LENGTH) {
    return { draft: input.draft, repaired: false, reasons: initial.reasons };
  }
  const repairedDraft = {
    ...input.draft,
    text: repairedText,
    failureReason: undefined,
    updatedAt: new Date().toISOString(),
  };
  const finalGate = runXSafetyGate({ ...input, draft: repairedDraft });
  return finalGate.safe
    ? { draft: repairedDraft, repaired: true, reasons: [] }
    : { draft: input.draft, repaired: false, reasons: finalGate.reasons };
}

export async function prepareXDraftForPublishing(input: {
  draft: SocialDraft;
  brand: Brand;
  experiences: ExperienceEntry[];
  repair?: (text: string) => Promise<string>;
}): Promise<{ draft: SocialDraft; repaired: boolean; safe: boolean; reasons: string[] }> {
  const gate = runXSafetyGate(input);
  if (gate.safe) return { draft: input.draft, repaired: false, safe: true, reasons: [] };
  if (!isRecoverableUnverifiedExperience(gate.reasons)) {
    return { draft: input.draft, repaired: false, safe: false, reasons: gate.reasons };
  }

  const result = await repairUnverifiedExperience({
    ...input,
    repair: input.repair ?? repairXUnverifiedExperienceWithAI,
  });
  return {
    draft: result.draft,
    repaired: result.repaired,
    safe: result.repaired,
    reasons: result.reasons,
  };
}
