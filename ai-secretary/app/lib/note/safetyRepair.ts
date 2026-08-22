import type { Brand } from "./types";
import type { ExperienceEntry, SocialDraft } from "./research/types";
import { runXSafetyGate, xWeightedLength, X_MAX_WEIGHTED_LENGTH } from "./operations";

const UNVERIFIED_EXPERIENCE_REASON = "本人確認済みの根拠がない体験表現を含みます";

export function isRecoverableUnverifiedExperience(reasons: string[]): boolean {
  return reasons.length === 1 && reasons[0] === UNVERIFIED_EXPERIENCE_REASON;
}
const factualTokens = (text: string) => new Set([
  ...(text.match(/\d+(?:[.,]\d+)?%?/g) ?? []),
  ...(text.match(/https?:\/\/[^\s]+/g) ?? []),
]);

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
  const repairedDraft = { ...input.draft, text: repairedText, updatedAt: new Date().toISOString() };
  const finalGate = runXSafetyGate({ ...input, draft: repairedDraft });
  return finalGate.safe
    ? { draft: repairedDraft, repaired: true, reasons: [] }
    : { draft: input.draft, repaired: false, reasons: finalGate.reasons };
}
