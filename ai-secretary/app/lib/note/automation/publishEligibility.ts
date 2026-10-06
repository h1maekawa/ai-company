import type { Brand } from "../types";
import type { ExperienceEntry, ResearchItem, SocialDraft, TrendCluster } from "../research/types";
import type { ResearchRun } from "../../company/research/types";
import { runXSafetyGate, X_MAX_WEIGHTED_LENGTH, xWeightedLength } from "../operations";
import { checkNumbersAgainstSources } from "../../qa/factChecks";

export type PublishEligibilityInput = {
  draft: SocialDraft;
  currentPlanId: string;
  currentPlanSlotId: string;
  brand: Brand;
  experiences: ExperienceEntry[];
  researchItems: ResearchItem[];
  researchProviderFailureUnresolved: boolean;
};

export type PublishEligibility = { eligible: boolean; reasons: string[] };

const FACTUAL_LANGUAGE = /(?:調査|統計|データ|報告|発表|によると|前年比|前月比|市場|売上|利益|株価|利回り|%|％|\d{2,})/;
const INVESTMENT_OR_HIGH_RISK = /(?:投資|株|銘柄|資産|金融|利回り|決算|医療|法律|政治|選挙)/;

/** Buffer予約専用のfail-closed gate。手動下書き保存には使わない。 */
export async function evaluatePublishEligibility(input: PublishEligibilityInput): Promise<PublishEligibility> {
  const reasons: string[] = [];
  const { draft } = input;
  if (draft.planId !== input.currentPlanId || draft.planSlotId !== input.currentPlanSlotId) {
    reasons.push("当日のcurrent DailyX Plan/slotに属していません");
  }
  if (draft.failureReason) reasons.push(`failureReasonがあります: ${draft.failureReason}`);

  const safety = runXSafetyGate({ draft, brand: input.brand, experiences: input.experiences });
  if (!safety.safe) reasons.push(...safety.reasons);
  if (xWeightedLength(draft.text) > X_MAX_WEIGHTED_LENGTH) reasons.push("weightedLengthが280を超えています");

  const factual = FACTUAL_LANGUAGE.test(draft.text);
  const sourceIds = new Set(draft.sourceResearchIds ?? []);
  const sources = input.researchItems.filter((item) => sourceIds.has(item.id)).map((item) => [item.title, item.textExcerpt, item.sourceUrl].filter(Boolean).join(" "));
  const numberCheck = checkNumbersAgainstSources({ text: draft.text, sources });
  if (numberCheck.status !== "pass") reasons.push(`数値の裏取り: ${numberCheck.detail ?? "検証できません"}`);
  if (factual && sources.length === 0) {
    reasons.push("factual / numeric claimのsource/evidenceを追跡できません");
  }
  const highRisk = draft.genreId === "asset-building" || INVESTMENT_OR_HIGH_RISK.test(draft.text);
  if (input.researchProviderFailureUnresolved && highRisk) {
    reasons.push("RESEARCH_PROVIDER_FAILURE未解決中のinvestment / high-risk factual contentです");
  }
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** 各departmentの最新Runだけを見て、失敗sourceが後続成功で解消されたか判定する。 */
export function hasUnresolvedResearchProviderFailure(runs: ResearchRun[]): boolean {
  const latest = new Map<string, ResearchRun>();
  for (const run of runs) {
    const current = latest.get(run.departmentId);
    if (!current || (run.completedAt ?? run.startedAt) > (current.completedAt ?? current.startedAt)) latest.set(run.departmentId, run);
  }
  return [...latest.values()].some((run) => run.failedSources.length > 0 || run.status === "FAILED");
}

/** Canaryの1枠目は低リスク・低source依存・Brand適合を優先する。 */
export function prioritizeCanaryCandidates(candidates: TrendCluster[]): TrendCluster[] {
  const score = (candidate: TrendCluster) =>
    (candidate.genreIds.includes("asset-building") ? 1_000 : 0) +
    candidate.sourceCount * 10 -
    candidate.brandFitScore;
  return [...candidates].sort((a, b) => score(a) - score(b) || b.totalScore - a.totalScore || a.id.localeCompare(b.id));
}
