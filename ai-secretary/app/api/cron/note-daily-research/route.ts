import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { candidateBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import { withLock } from "@/app/lib/note/publishing/queue";
import { runResearch } from "@/app/lib/note/research/run";
import {
  loadExperiences,
  loadResearchInbox,
  loadResearchSettings,
} from "@/app/lib/note/research/store";
import { runMarketIntake, type MarketIntakeResult } from "@/app/lib/agents/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/note-daily-research
 * 毎朝のリサーチ → 上位候補をSlackへ。
 * middleware は素通しなので、ここで CRON_SECRET を必ず検証する。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    /*
     * 市況をリサーチの材料として先に取り込む（要件5）。
     * runResearch より前に置くことで、その日の市況ネタも
     * 同じ実行の中でクラスタ化・候補化の対象に入る。
     * 既存の investmentBridgeEnabled で制御し、OFFなら何もしない。
     */
    let marketIntake: MarketIntakeResult | null = null;
    let marketIntakeError: string | undefined;
    try {
      const settings = await loadResearchSettings();
      if (settings.flags.investmentBridgeEnabled) {
        marketIntake = await runMarketIntake();
      }
    } catch (error) {
      // 市況の取り込みが落ちても通常のリサーチは走らせる
      marketIntakeError = error instanceof Error ? error.message : "市況の取り込みに失敗しました";
      console.error("[cron/note-daily-research] 市況の取り込みに失敗:", error);
    }

    const result = await withLock("research-run", () => runResearch());
    if (!result) {
      return NextResponse.json({ skipped: true, reason: "既に実行中のためスキップしました" });
    }

    const [items, experiences] = await Promise.all([loadResearchInbox(), loadExperiences()]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const expById = new Map(experiences.map((e) => [e.id, e]));

    const blocks = result.topCandidates.flatMap((cluster) =>
      candidateBlocks(
        cluster,
        cluster.researchItemIds
          .map((id) => itemById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i)),
        cluster.matchedExperienceIds
          .map((id) => expById.get(id)?.title)
          .filter((t): t is string => Boolean(t))
      )
    );

    const summary =
      result.topCandidates.length > 0
        ? `今朝のリサーチが終わりました（新規 ${result.newItems}件 / 候補 ${result.topCandidates.length}件）`
        : `今朝のリサーチが終わりました。新しい候補はありません（取得 ${result.fetched}件）`;

    const notes = [
      result.xSkippedReason ? `X: ${result.xSkippedReason}` : "",
      result.failures.length > 0
        ? `取得できなかったソース ${result.failures.length}件（他は続行しました）`
        : "",
    ].filter(Boolean);

    const slack = await postToSlack(
      notes.length > 0 ? `${summary}\n${notes.join("\n")}` : summary,
      blocks.length > 0 ? blocks : undefined
    );

    return NextResponse.json({
      ok: true,
      newItems: result.newItems,
      candidates: result.topCandidates.length,
      failures: result.failures,
      xSkippedReason: result.xSkippedReason,
      slackDelivered: slack.ok,
      slackError: slack.error,
      marketIntake,
      marketIntakeError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "リサーチに失敗しました";
    console.error("[cron/note-daily-research] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
