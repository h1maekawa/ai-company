import { NextResponse } from "next/server";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";
import { generateOpportunities, applyRevenueToOpportunities } from "@/app/lib/company/opportunity/engine";
import { generateMoneyQuests } from "@/app/lib/company/opportunity/moneyQuest";
import { effectiveEntries, loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { summarizeRevenue } from "@/app/lib/company/revenue";
import { loadOpportunities, saveOpportunities } from "@/app/lib/company/opportunity/store";
import { generateCreatorOpportunitiesFromKnowledge } from "@/app/lib/company/opportunity/knowledgeBridge";
import { vaultKnowledgeSearch } from "@/app/lib/knowledge/search";

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
    const [entries, existing, knowledge] = await Promise.all([
      loadRevenueEntries().catch(() => []),
      loadOpportunities().catch(() => []),
      vaultKnowledgeSearch
        .search({ status: ["promoted", "merged"], limit: 20 })
        .catch(() => []),
    ]);
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
    });
    const opportunities = applyRevenueToOpportunities(
      [...generated.opportunities, ...knowledgeOpportunities],
      entries
    );

    const quests = generateMoneyQuests({
      opportunities,
      aiGeneratedRevenueYen: entries.length > 0 ? aiRevenue : null,
    });

    // 生成結果を保存する（重複を防ぐため次回は既存として渡される）
    await saveOpportunities(opportunities).catch(() => undefined);

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
