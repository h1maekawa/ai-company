import type { InvestmentOpportunity } from "../intelligence/types";
import type { Portfolio } from "../types";
import type { WatchTheme } from "../watchlist";
import { deriveOpportunityPipelineStatus } from "./deriveStatus";
import type { OpportunityPipelineItem } from "./types";

const CRITICAL_THESIS_CODES = new Set(["NEGATIVE_DEMAND", "FUNDAMENTAL_STALE", "MACRO_CONFLICT", "NEGATIVE_CATALYST"]);

/**
 * Projects the existing watchlist (app/lib/investing/watchlist.ts, unchanged) into
 * OpportunityPipelineItem[], reusing today's InvestmentOpportunity (including PR-C's
 * shortTerm/midTerm/longTerm/tripleGate) and the existing Portfolio for held-detection. Pure,
 * read-only: it mutates neither the watchlist nor the portfolio.
 *
 * `previousItems` is optional. Without it, `status` is derived fresh from today's gates alone
 * (see deriveStatus.ts for why no pipeline store is persisted in this PR).
 */
export function buildOpportunityPipelineItems(input: {
  watchlistThemes: WatchTheme[];
  opportunities: InvestmentOpportunity[];
  portfolio: Portfolio;
  previousItems?: OpportunityPipelineItem[];
  now?: Date;
}): OpportunityPipelineItem[] {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const byTicker = new Map(input.opportunities.map((opportunity) => [opportunity.ticker, opportunity]));
  const heldTickers = new Set(input.portfolio.positions.map((position) => position.code.toUpperCase()));
  const previousByTicker = new Map((input.previousItems ?? []).map((item) => [item.ticker, item]));

  const items: OpportunityPipelineItem[] = [];
  const seen = new Set<string>();
  for (const watchTheme of input.watchlistThemes) {
    for (const watchItem of watchTheme.items) {
      const ticker = watchItem.ticker.trim().toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);

      const opportunity = byTicker.get(ticker);
      const previous = previousByTicker.get(ticker);
      const held = heldTickers.has(ticker);
      const criticalFlags = opportunity?.riskFlags.filter((flag) => CRITICAL_THESIS_CODES.has(flag.code)) ?? [];
      const invalidated = criticalFlags.length > 0;
      const tripleGate = opportunity?.tripleGate ?? null;

      items.push({
        ticker,
        theme: watchTheme.theme,
        subTheme: opportunity?.theme ?? null,
        shortGate: opportunity?.shortTerm?.gate ?? null,
        midGate: opportunity?.midTerm?.gate ?? null,
        longGate: opportunity?.longTerm?.gate ?? null,
        tripleGate,
        whyWatching: opportunity?.whyNow ?? watchItem.reason ?? null,
        targetCatalyst: opportunity?.catalyst ?? null,
        // No existing provider carries an earnings-calendar date; always null, not guessed.
        nextEarnings: null,
        invalidation: [...new Set([...criticalFlags.map((flag) => flag.detail), ...(opportunity?.longTerm?.invalidationConditions ?? [])])],
        status: deriveOpportunityPipelineStatus({ held, invalidated, tripleGate, previousStatus: previous?.status }),
        held,
        createdAt: previous?.createdAt ?? nowIso,
        updatedAt: nowIso,
      });
    }
  }
  return items;
}
