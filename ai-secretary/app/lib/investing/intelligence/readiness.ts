import { loadPortfolioInventory } from "@/app/lib/investing/portfolio";
import { loadWatchlist } from "@/app/lib/investing/watchlist";
import { loadIntelligenceToday } from "./store";
import { deriveInvestmentPhase2Readiness } from "./readinessProjection";

/**
 * Builds the Phase 2 readiness report from current configuration presence and
 * already-recorded evidence. It never probes a provider, writes a Store, or
 * returns a secret value, holding, watchlist item, or research payload.
 */
export async function loadInvestmentPhase2Readiness(now = new Date()) {
  const [today, portfolio, watchlist] = await Promise.all([
    loadIntelligenceToday(),
    loadPortfolioInventory(),
    loadWatchlist(),
  ]);

  return deriveInvestmentPhase2Readiness({
    generatedAt: now.toISOString(),
    environment: {
      investmentIntelligenceFlag: process.env.INVESTING_INTELLIGENCE_ENABLED,
      fredApiKeyConfigured: Boolean(process.env.FRED_API_KEY),
      secUserAgentConfigured: Boolean(process.env.SEC_USER_AGENT),
      serpApiEnabled: process.env.SERPAPI_ENABLED === "true",
      serpApiKeyConfigured: Boolean(process.env.SERPAPI_KEY),
    },
    providerEvidence: today?.providerStatus ?? [],
    portfolio,
    watchlist: {
      themeCount: watchlist.themes.length,
      itemCount: watchlist.themes.reduce((count, theme) => count + theme.items.length, 0),
      updatedAt: watchlist.updatedAt,
    },
  });
}
