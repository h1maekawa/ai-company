import { createHash } from "node:crypto";
import type { ContentPerformance } from "../../note/research/types";
import type { MonetizationCandidate, MonetizationCandidateType, Offer } from "./types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/**
 * Observed X Performanceから収益化Opportunity Candidateだけを作るv1 Generator。
 * 外部ProgramのResearch/Discoveryは行わず、申請・登録・URL生成・支払いも一切行わない。
 */
export function buildWeeklyMonetizationOpportunityCandidates(input: {
  performance: ContentPerformance[];
  offers: Offer[];
  existing?: MonetizationCandidate[];
  officialXNativeEvidenceRef?: string;
  now: Date;
}): MonetizationCandidate[] {
  const observed = input.performance.filter((record) => record.platform === "x" && record.impressions !== undefined);
  const byTopic = new Map<string, ContentPerformance[]>();
  for (const record of observed) {
    const topic = record.trendClusterId ?? record.genreId;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), record]);
  }
  const best = [...byTopic.entries()].filter(([, records]) => records.length >= 3)
    .sort((a, b) => b[1].reduce((sum, record) => sum + record.impressions!, 0) / b[1].length - a[1].reduce((sum, record) => sum + record.impressions!, 0) / a[1].length)[0];
  if (!best) return input.existing ?? [];
  const [topic, records] = best;
  const types: MonetizationCandidateType[] = ["affiliate", "paid-note", "pr", "sponsor", "own-product", "service", "subscription"];
  if (input.officialXNativeEvidenceRef) types.push("x-native");
  const stamp = input.now.toISOString();
  const generated = types.map((type): MonetizationCandidate => {
    const registeredAffiliate = type === "affiliate" ? input.offers.find((offer) => offer.type === "affiliate" && offer.status === "active" && offer.affiliateLinkId) : undefined;
    const reason = type === "affiliate"
      ? registeredAffiliate ? `登録済みAffiliate関係 ${registeredAffiliate.id} とDisclosureをHuman確認` : "新規Affiliate関係の登録・URL・DisclosureをHuman確認"
      : type === "x-native" ? "公式X収益化evidenceを確認しHumanが申請判断" : `${topic}の観測済みPerformanceからHumanが収益化適合を判断`;
    return { id: `monetization_candidate_${hash(`${input.now.toISOString().slice(0, 10)}:${topic}:${type}`)}`, type, status: "CANDIDATE", title: `${topic}: ${type}`, reason, evidenceRefs: [...records.map((record) => record.contentId), ...(type === "x-native" ? [input.officialXNativeEvidenceRef!] : [])], createdAt: stamp, requiresHumanAction: true, externalActionAllowed: false };
  });
  const all = [...(input.existing ?? []), ...generated];
  return all.filter((candidate, index) => all.findIndex((item) => item.id === candidate.id) === index).slice(-100);
}
