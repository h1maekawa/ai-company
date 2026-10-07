import type { Brand } from "../types";
import type { DailyXPlanSlot, SocialDraft } from "../research/types";
import { checkSimilarity } from "../research/similarity";
import { runXSafetyGate, xWeightedLength } from "../operations";
import { checkNumbersAgainstSources, checkForwardLookingClaims } from "../../qa/factChecks";

/** Editorial paraphrases of the approved internal brand concept, with no external source or personal claim. */
const BRAND_ONLY_TEXTS = [
  "AIも読書も、急いで答えを出すためではなく、考え方を少し広げるきっかけに。日々の小さな寄り道を、これからも大切にしたい。",
  "人生を少し豊かにするヒントは、大きな変化だけとは限らない。気になったことを立ち止まって考える時間も、いい寄り道になる。",
  "答えを急がず、気になったことを一つずつ考える。AIや読書は、そのための道具にもなる。人生を主役に、今日も小さな寄り道を。",
];

const PROHIBITED = /投資|株|資産|金融|収益|副業|PR|広告|アフィリエイト|医療|法律|政治|選挙|私が|自分が|実際に|試した|やってみた|https?:\/\/|@|\d/iu;

export function createOneTimeTransportDraft(input: {
  slot: DailyXPlanSlot;
  brand: Brand;
  primaryAccountId: string;
  existingDrafts: SocialDraft[];
  now: Date;
}): SocialDraft | null {
  if (!input.brand.concept.includes("人生") || input.slot.timeSource !== "one-time-transport-canary") return null;
  if (input.existingDrafts.some((draft) => draft.planSlotId === input.slot.id)) return null;
  for (const text of BRAND_ONLY_TEXTS) {
    if (PROHIBITED.test(text) || xWeightedLength(text) > 280) continue;
    const similarity = checkSimilarity(text, [], input.existingDrafts.map((draft) => ({ label: draft.id, text: draft.text })));
    if (similarity.blocked || similarity.score >= 0.72) continue;
    const stamp = input.now.toISOString();
    const draft: SocialDraft = {
      id: `x-canary-${input.slot.id}`, xAccountId: input.primaryAccountId,
      purpose: input.slot.purpose, genreId: "daily-thoughts", text,
      urls: [], needsDisclosure: false, similarityScore: similarity.score,
      sourceResearchIds: [], sourceExperienceIds: [], status: "draft", createdAt: stamp, updatedAt: stamp,
    };
    if (!runXSafetyGate({ draft, brand: input.brand, experiences: [] }).safe) continue;
    if (checkNumbersAgainstSources({ text, sources: [] }).status !== "pass") continue;
    if (checkForwardLookingClaims(text).status !== "pass") continue;
    return draft;
  }
  return null;
}
