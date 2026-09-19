import { NextResponse } from "next/server";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";
import { generateOpportunities, applyRevenueToOpportunities } from "@/app/lib/company/opportunity/engine";
import { generateMoneyQuests } from "@/app/lib/company/opportunity/moneyQuest";
import { effectiveEntries, loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { summarizeRevenue } from "@/app/lib/company/revenue";
import { loadOpportunities, saveOpportunities } from "@/app/lib/company/opportunity/store";
import { generateCreatorOpportunitiesFromKnowledge } from "@/app/lib/company/opportunity/knowledgeBridge";
import { vaultKnowledgeSearch } from "@/app/lib/knowledge/search";
import { loadPublishedContent, loadPerformance } from "@/app/lib/note/research/store";
import { buildCreatorDemandEvidence } from "@/app/lib/content/evidence/engine";
import type { CreatorDemandEvidence } from "@/app/lib/content/evidence/types";
import { loadBusinessCostEntries } from "@/app/lib/company/businessCostStore";
import {
  applyCreatorDecisionRanking,
  withoutCreatorDecisionReadModel,
} from "@/app/lib/company/opportunity/creatorRanking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/company/opportunities — 収益機会と今日のMoney Quest（Phase 5）
 *
 * 読み取りと生成のみ。公開・送信・取引は一切行わない（§45 / §46）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const organization = buildOrganizationSnapshot();
    const [entries, costs, existing, knowledge, published, performance] = await Promise.all([
      loadRevenueEntries().catch(() => []),
      loadBusinessCostEntries().catch(() => []),
      loadOpportunities().catch(() => []),
      vaultKnowledgeSearch
        .search({ status: ["promoted", "merged"], limit: 20 })
        .catch(() => []),
      loadPublishedContent().catch(() => []),
      loadPerformance().catch(() => null),
    ]);
    let demandEvidence: CreatorDemandEvidence[] = [];
    try {
      demandEvidence = buildCreatorDemandEvidence(
        published,
        performance?.snapshots ?? []
      );
    } catch (error) {
      console.warn("[api/company/opportunities] Demand Evidence生成をskip:", error);
    }
    const effective = effectiveEntries(entries);
    const aiRevenue = summarizeRevenue(effective).aiGeneratedYen;

    const generated = generateOpportunities({
      organization,
      revenueEntries: entries,
      existing,
    });
    const knowledgeOpportunities = generateCreatorOpportunitiesFromKnowledge({
      knowledge,
      organization,
      existing,
      demandEvidence,
    });
    const revenueApplied = applyRevenueToOpportunities(
      [...generated.opportunities, ...knowledgeOpportunities],
      entries
    );
    const opportunities = applyCreatorDecisionRanking({
      opportunities: revenueApplied,
      revenueEntries: entries,
      costEntries: costs,
    });

    const quests = generateMoneyQuests({
      opportunities,
      aiGeneratedRevenueYen: entries.length > 0 ? aiRevenue : null,
    });

    // 生成結果を保存する（重複を防ぐため次回は既存として渡される）
    await saveOpportunities(
      opportunities.map(withoutCreatorDecisionReadModel)
    ).catch(() => undefined);

    return NextResponse.json({
      mode: generated.mode,
      opportunities,
      quests: quests.quests,
      deferredQuests: quests.deferred,
      learning: generated.learning,
    });
  } catch (error) {
    console.error("[api/company/opportunities] 失敗:", error);
    return NextResponse.json({ error: "収益機会の取得に失敗しました" }, { status: 500 });
  }
}
