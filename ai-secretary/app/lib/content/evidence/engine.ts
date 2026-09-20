import { buildFunnel, deriveMetrics } from "../monetization/metrics";
import { latestSnapshotByContent } from "../monetization/metrics";
import type {
  PerformanceSnapshot,
  PublishedContent,
  RevenueEvent,
} from "../monetization/types";
import type {
  ContentContribution,
  ContentRelation,
  CreatorDemandEvidence,
} from "./types";

const ENGAGEMENT_KEYS = ["likes", "comments", "replies", "reposts", "bookmarks"] as const;
const DEMAND_KEYS = [
  "impressions",
  "likes",
  "comments",
  "replies",
  "reposts",
  "bookmarks",
  "profileVisits",
  "follows",
  "linkClicks",
] as const;

// 1〜2件から「上位」と断定しないため、本人の過去投稿を最低5件要求する。
export const MIN_DEMAND_BASELINE_SAMPLES = 5;

const known = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function percentile(value: number, baseline: number[]): number {
  if (baseline.length === 0) return 0;
  return baseline.filter((candidate) => candidate <= value).length / baseline.length;
}

function comparableSignals(snapshot: PerformanceSnapshot): Array<number | undefined> {
  const derived = deriveMetrics(snapshot);
  return [
    known(snapshot.impressions) ? snapshot.impressions : undefined,
    derived.ctr,
    known(snapshot.profileVisits) ? snapshot.profileVisits : undefined,
  ];
}

export function createDemandEvidence(input: {
  published: PublishedContent;
  snapshot: PerformanceSnapshot;
  baselineSnapshots?: PerformanceSnapshot[];
}): CreatorDemandEvidence {
  const { published, snapshot } = input;
  const engagementValues = ENGAGEMENT_KEYS.map((key) => snapshot[key]).filter(known);
  const engagements = engagementValues.length > 0
    ? engagementValues.reduce((sum, value) => sum + value, 0)
    : undefined;
  const metrics = deriveMetrics({
    impressions: snapshot.impressions,
    linkClicks: snapshot.linkClicks,
  });
  const coverageCount = DEMAND_KEYS.filter((key) => known(snapshot[key])).length;
  const baselineByContent = new Map<string, PerformanceSnapshot>();
  for (const candidate of input.baselineSnapshots ?? []) {
    if (candidate.publishedContentId === snapshot.publishedContentId) continue;
    const current = baselineByContent.get(candidate.publishedContentId);
    if (!current || candidate.capturedAt > current.capturedAt) {
      baselineByContent.set(candidate.publishedContentId, candidate);
    }
  }
  const baseline = [...baselineByContent.values()];
  const currentSignals = comparableSignals(snapshot);
  const relativeParts: number[] = [];

  if (baseline.length >= MIN_DEMAND_BASELINE_SAMPLES) {
    const selectors = [
      (candidate: PerformanceSnapshot) => candidate.impressions,
      (candidate: PerformanceSnapshot) => deriveMetrics(candidate).ctr,
      (candidate: PerformanceSnapshot) => candidate.profileVisits,
    ];
    selectors.forEach((selector, index) => {
      const current = currentSignals[index];
      if (!known(current)) return;
      const values = baseline.map(selector).filter(known);
      if (values.length >= MIN_DEMAND_BASELINE_SAMPLES) {
        relativeParts.push(percentile(current, values));
      }
    });
  }

  const hasObserved = coverageCount > 0;
  const enoughBaseline = relativeParts.length > 0;
  return {
    sourcePublishedContentId: published.id,
    sourcePerformanceId: snapshot.id,
    sourceKnowledgeId: published.sourceKnowledgeId,
    opportunityId: published.opportunityId,
    impressions: known(snapshot.impressions) ? snapshot.impressions : undefined,
    engagements,
    engagementCoveragePct: Math.round((engagementValues.length / ENGAGEMENT_KEYS.length) * 100),
    engagementRate:
      engagements === undefined
        ? undefined
        : deriveMetrics({ impressions: snapshot.impressions, linkClicks: engagements }).ctr,
    profileVisits: known(snapshot.profileVisits) ? snapshot.profileVisits : undefined,
    follows: known(snapshot.follows) ? snapshot.follows : undefined,
    linkClicks: known(snapshot.linkClicks) ? snapshot.linkClicks : undefined,
    clickThroughRate: metrics.ctr,
    capturedAt: snapshot.capturedAt,
    coveragePct: Math.round((coverageCount / DEMAND_KEYS.length) * 100),
    status: !hasObserved ? "UNKNOWN" : enoughBaseline ? "OBSERVED" : "INSUFFICIENT_DATA",
    relativeScore: enoughBaseline
      ? Math.round((relativeParts.reduce((sum, value) => sum + value, 0) / relativeParts.length) * 100)
      : undefined,
    baselineSampleSize: baseline.length,
  };
}

/** Production RouteとEvidence APIが共有するPublished X→Demand変換。 */
export function buildCreatorDemandEvidence(
  published: PublishedContent[],
  snapshots: PerformanceSnapshot[]
): CreatorDemandEvidence[] {
  const xPublished = published.filter(
    (content) => content.channel === "x" && content.status === "published"
  );
  const latest = latestSnapshotByContent(snapshots);
  const baseline = xPublished
    .map((content) => latest.get(content.id))
    .filter((snapshot): snapshot is PerformanceSnapshot => Boolean(snapshot));
  return xPublished.flatMap((content) => {
    const snapshot = latest.get(content.id);
    return snapshot
      ? [createDemandEvidence({ published: content, snapshot, baselineSnapshots: baseline })]
      : [];
  });
}

export function buildRelationFunnel(input: {
  relation: ContentRelation;
  snapshots: PerformanceSnapshot[];
  revenueEvents: RevenueEvent[];
}) {
  const latest = new Map<string, PerformanceSnapshot>();
  for (const snapshot of input.snapshots) {
    const current = latest.get(snapshot.publishedContentId);
    if (!current || snapshot.capturedAt > current.capturedAt) {
      latest.set(snapshot.publishedContentId, snapshot);
    }
  }
  const source = latest.get(input.relation.sourcePublishedContentId);
  const target = latest.get(input.relation.targetPublishedContentId);
  const targetRevenue = input.revenueEvents.filter(
    (event) => event.publishedContentId === input.relation.targetPublishedContentId
  );
  return buildFunnel({
    impressions: source?.impressions,
    linkClicks: source?.linkClicks,
    noteViews: target?.views,
    ctaClicks: target?.ctaClicks,
    purchases: target?.paidPurchases,
    revenue:
      targetRevenue.length > 0
        ? targetRevenue.reduce((sum, event) => sum + event.amount, 0)
        : null,
  });
}

/** 貢献はRevenue IDを参照するだけで、会計金額の合計を一切変更しない。 */
export function referencedRevenueIds(contributions: ContentContribution[]): string[] {
  return [...new Set(contributions.map((contribution) => contribution.companyRevenueId))];
}
