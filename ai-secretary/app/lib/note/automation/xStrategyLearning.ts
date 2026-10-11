import type { DailyGrowthReview } from "../growthLoop";
import type { ContentGrowthStrategy, ContentPerformance, XAutoLearningChange, XDomainMix, XTopicDomain } from "../research/types";

const DAY = 86_400_000;
const COOLDOWN_MS = 7 * DAY;
const DOMAIN_TERMS: Record<XTopicDomain, RegExp> = {
  ai: /(^|[-_\s])ai($|[-_\s])|人工知能|llm|agent|エージェント|openai|anthropic|gemini|claude/i,
  investment: /investment|投資|株|市場|相場|半導体|銘柄|決算|需給|出来高|market|stock|equity|semiconductor|earnings|guidance|volume/i,
};

export function performanceDomain(record: ContentPerformance): XTopicDomain | null {
  const value = `${record.genreId} ${record.trendClusterId ?? ""}`;
  if (DOMAIN_TERMS.investment.test(value)) return "investment";
  if (DOMAIN_TERMS.ai.test(value)) return "ai";
  return null;
}

function observedDomain(records: ContentPerformance[], domain: XTopicDomain, since: number) {
  const items = records.filter((record) => record.platform === "x"
    && new Date(record.publishedAt).getTime() >= since
    && performanceDomain(record) === domain
    && record.impressions !== undefined);
  return {
    items,
    average: items.length ? items.reduce((sum, item) => sum + item.impressions!, 0) / items.length : undefined,
  };
}

function cooldownReady(strategy: ContentGrowthStrategy, field: XAutoLearningChange["field"], now: Date): boolean {
  const latest = [...strategy.xAutoLearningHistory].reverse().find((change) => change.field === field);
  return !latest || now.getTime() - new Date(latest.appliedAt).getTime() >= COOLDOWN_MS;
}

/**
 * Soft Strategyだけを既存Strategy Storeへ反映する。欠損値は除外し、各domain 3投稿未満なら変更しない。
 * Safety/Factなどのprotected controlsは入力にも出力にも含めない。
 */
export function applyBoundedXStrategyLearning(input: {
  strategy: ContentGrowthStrategy;
  review: DailyGrowthReview;
  records: ContentPerformance[];
  now: Date;
}): { strategy: ContentGrowthStrategy; changes: XAutoLearningChange[]; skipped: string[] } {
  const strategy: ContentGrowthStrategy = JSON.parse(JSON.stringify(input.strategy));
  strategy.xAutoLearningHistory ??= [];
  strategy.xDomainMix ??= { ai: 1, investment: 2 };
  const changes: XAutoLearningChange[] = [];
  const skipped: string[] = [];
  const appliedAt = input.now.toISOString();
  const sevenDays = input.now.getTime() - 7 * DAY;
  const thirtyDays = input.now.getTime() - 30 * DAY;
  const ai7 = observedDomain(input.records, "ai", sevenDays);
  const investment7 = observedDomain(input.records, "investment", sevenDays);
  const ai30 = observedDomain(input.records, "ai", thirtyDays);
  const investment30 = observedDomain(input.records, "investment", thirtyDays);

  if (ai7.items.length < 3 || investment7.items.length < 3 || ai30.items.length < 3 || investment30.items.length < 3) {
    skipped.push("INSUFFICIENT_SAMPLE:xDomainMix");
  } else if (!cooldownReady(strategy, "xDomainMix", input.now)) {
    skipped.push("COOLDOWN:xDomainMix");
  } else {
    const aiIndex = ai7.average! / Math.max(ai30.average!, 1);
    const investmentIndex = investment7.average! / Math.max(investment30.average!, 1);
    const after: XDomainMix = aiIndex > investmentIndex * 1.15 ? { ai: 2, investment: 1 } : { ai: 1, investment: 2 };
    if (JSON.stringify(after) !== JSON.stringify(strategy.xDomainMix)) {
      const evidence = [...ai7.items, ...investment7.items];
      changes.push({
        field: "xDomainMix", before: strategy.xDomainMix, after,
        reason: "7日Performanceを30日baselineで正規化し、15%以上の差があるdomainへ1枠だけ移動",
        evidenceRefs: evidence.map((record) => record.contentId), sampleSize: evidence.length,
        expectedEffect: "Monthly Impressionsの改善", appliedAt,
      });
      strategy.xDomainMix = after;
    }
  }

  for (const field of ["topicPriority", "genrePriority", "patternPriority"] as const) {
    const after = input.review.strategyAfter[field];
    if (JSON.stringify(after) === JSON.stringify(strategy[field])) continue;
    const evidenceRefs = field === "patternPriority"
      ? input.review.winningPatterns.flatMap((item) => item.sampleSize >= 3 ? [item.key] : [])
      : input.review.winningTopics.flatMap((item) => item.postCount >= 3 ? [item.topicId] : []);
    if (evidenceRefs.length === 0) { skipped.push(`INSUFFICIENT_SAMPLE:${field}`); continue; }
    if (!cooldownReady(strategy, field, input.now)) { skipped.push(`COOLDOWN:${field}`); continue; }
    changes.push({
      field, before: strategy[field], after,
      reason: "既存Growth Reviewの7日評価と30日baselineに基づくsoft priority更新",
      evidenceRefs, sampleSize: evidenceRefs.length,
      expectedEffect: "Monthly Impressionsの改善", appliedAt,
    });
    strategy[field] = [...after] as never;
  }

  if (changes.length) {
    strategy.xAutoLearningHistory = [...strategy.xAutoLearningHistory, ...changes].slice(-100);
    strategy.updatedAt = appliedAt;
  }
  return { strategy, changes, skipped };
}
