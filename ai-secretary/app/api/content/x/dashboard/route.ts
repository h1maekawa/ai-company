import { NextResponse } from "next/server";
import { loadLedger } from "@/app/lib/content/monetization/store";
import { buildXDashboard } from "@/app/lib/content/xDashboard";
import {
  loadDailyXPlans,
  loadGrowthReviews,
  loadPerformance,
  loadPublishedContent,
  loadResearchSettings,
  loadSocialDrafts,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/** Read-only X dashboard aggregator. Existing stores remain the source of truth. */
export async function GET(): Promise<NextResponse> {
  try {
    const [settings, performance, reviews, plans, drafts, published, ledger] = await Promise.all([
      loadResearchSettings(),
      loadPerformance(),
      loadGrowthReviews(),
      loadDailyXPlans(),
      loadSocialDrafts(),
      loadPublishedContent(),
      loadLedger(),
    ]);
    return NextResponse.json(buildXDashboard({
      mode: settings.flags.socialOperationMode,
      records: performance.records,
      reviews,
      plans,
      drafts,
      published,
      revenueEvents: ledger.revenueEvents,
    }));
  } catch (error) {
    console.error("[api/content/x/dashboard] GET failed:", error);
    return NextResponse.json({ error: "X Dashboardの取得に失敗しました" }, { status: 500 });
  }
}
