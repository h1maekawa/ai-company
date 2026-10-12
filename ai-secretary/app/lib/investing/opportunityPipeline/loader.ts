import { loadIntelligenceToday } from "../intelligence/store";
import { loadPortfolio } from "../portfolio";
import { loadWatchlist } from "../watchlist";
import { buildOpportunityPipelineItems } from "./build";
import type { OpportunityPipelineItem } from "./types";

/** Read-only loader: reuses the existing loadWatchlist/loadIntelligenceToday/loadPortfolio. */
export async function loadOpportunityPipeline(now = new Date()): Promise<OpportunityPipelineItem[]> {
  const [watchlist, today, portfolio] = await Promise.all([loadWatchlist(), loadIntelligenceToday(), loadPortfolio()]);
  return buildOpportunityPipelineItems({ watchlistThemes: watchlist.themes, opportunities: today?.opportunities ?? [], portfolio, now });
}
