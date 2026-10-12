/**
 * Portfolio Risk thresholds. Versioned constants, not numbers scattered through the code, per
 * the project's "no bare numeric literals" convention (see app/lib/fund/policy.ts,
 * app/lib/investing/intelligence/config.ts for the same pattern).
 *
 * These are display bands, not automatic action triggers: crossing HIGH never causes this
 * department to sell, rebalance, or otherwise mutate a holding. Concentration itself is never
 * judged "bad" — it is only surfaced so a human can decide.
 */
export const PORTFOLIO_RISK_THRESHOLDS = {
  /** Diversification across many themes is normal; flag only once one theme dominates. */
  themeConcentration: { mediumPct: 25, highPct: 50 },
  sectorConcentration: { mediumPct: 25, highPct: 50 },
  /**
   * Matches the 25%-full-score / 60%-zero-score breakpoints already used by
   * app/lib/investing/analysis.ts's concentrationFactor, so the two views don't disagree sharply
   * even though this one is not derived from that score.
   */
  singleStockExposure: { mediumPct: 25, highPct: 45 },
  /**
   * A JP-based investor's portfolio normally concentrates in 1-2 countries/currencies (home +
   * US); thresholds are set higher than theme/sector so the expected baseline isn't flagged.
   */
  countryExposure: { mediumPct: 60, highPct: 85 },
  currencyExposure: { mediumPct: 60, highPct: 85 },
  /** Average pairwise Pearson correlation of daily returns across valued holdings. */
  correlationRisk: { mediumCorrelation: 0.3, highCorrelation: 0.6 },
  /** Portfolio-level max drawdown over the trailing window available in value-history.md. */
  drawdownRisk: { mediumPct: 10, highPct: 20 },
  /** Share of valued holdings carrying at least one Thesis Risk signal. */
  thesisRisk: { mediumSharePct: 25, highSharePct: 50 },
} as const;
