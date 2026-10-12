import { THEME_UNIVERSE } from "../themes";
import type { EconomicNewsItem } from "../types";
import type { BottleneckAssessment } from "./types";

const CONSTRAINT_PATTERNS: RegExp[] = [
  /supply constraint/i,
  /shortage/i,
  /capacity constraint/i,
  /capacity-constrained/i,
  /bottleneck/i,
  /lead time/i,
  /backlog/i,
  /limited supply/i,
  /sold out/i,
  /allocation/i,
  /供給制約/,
  /供給不足/,
  /生産能力.{0,6}(制約|逼迫|不足)/,
  /ボトルネック/,
];

const fresh = (item: EconomicNewsItem) => !["stale", "unknown"].includes(item.freshness);
/** Look-ahead guard: evidence published after the research timestamp is never used. */
const notFromTheFuture = (item: EconomicNewsItem, now: Date) => !item.publishedAt || new Date(item.publishedAt).getTime() <= now.getTime();

/**
 * Finds explicitly evidenced supply/capacity constraints ("bottlenecks") in already-fetched news
 * text. A bottleneck is only emitted when at least one news item's factSummary or impact
 * rationale matches an explicit constraint pattern for that theme — never created from a theme
 * simply being "hot" or thematically related. See INVESTMENT_THINKING_MODEL.md and
 * skills/investing/bottleneck-discovery/SKILL.md. News published after `now` is excluded.
 */
export function buildBottleneckAssessments(news: EconomicNewsItem[], themes: string[], now = new Date()): BottleneckAssessment[] {
  const assessments: BottleneckAssessment[] = [];
  for (const theme of themes) {
    const matches = news.filter((item) => fresh(item) && notFromTheFuture(item, now) && item.relatedThemes.includes(theme) && CONSTRAINT_PATTERNS.some((pattern) => pattern.test(item.factSummary) || item.impacts.some((impact) => pattern.test(impact.rationale))));
    if (matches.length === 0) continue;

    const definition = THEME_UNIVERSE.find((item) => item.name === theme);
    const demandDriver = definition?.downstreamThemes[0] ?? theme;
    const evidenceRefs = [...new Set(matches.map((item) => item.id))];
    const confidence = Math.min(0.8, 0.3 + matches.length * 0.2);

    assessments.push({
      bottleneck: `${theme} supply/capacity constraint`,
      demandDriver,
      supplyConstraint: matches[0].factSummary,
      capacityConstraint: matches.find((item) => /capacity|生産能力/.test(item.factSummary))?.factSummary ?? null,
      expansionLeadTime: null,
      supplierConcentration: null,
      barrierToEntry: null,
      substitutes: [],
      beneficiaryTickers: definition?.tickers ?? [],
      evidenceRefs,
      confidence,
    });
  }
  return assessments;
}
