import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { candidateBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import { runResearch } from "@/app/lib/note/research/run";
import { checkpoint, dailyResearchPolicy, loadDailyCheckpoint, resolveDailyOperationId, saveDailyCheckpoint, withDailyJobLock } from "@/app/lib/note/research/dailyJob";
import {
  loadExperiences,
  loadResearchInbox,
  loadResearchSettings,
} from "@/app/lib/note/research/store";
import { runMarketIntake, type MarketIntakeResult } from "@/app/lib/agents/market";
import { recordPipelineSteps, type RecordStepInput } from "@/app/lib/agents/recorder";
import { startTrace } from "@/app/lib/company/trace";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { deliverNotifications } from "@/app/lib/notifications/router";
import { buildXResearchEvents, xResearchAdapters } from "@/app/lib/notifications/xResearch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const policy = dailyResearchPolicy();
    const operationId = await resolveDailyOperationId();
    if (req.nextUrl.searchParams.get("status") === "1") {
      const saved = await loadDailyCheckpoint(operationId);
      return NextResponse.json({ operationId, phase: saved?.phase ?? "not_started", reason: saved?.reason, updatedAt: saved?.updatedAt });
    }
    if (policy.paused) return NextResponse.json({ deferred: true, operationId, reason: "note department paused" }, { status: 202 });
    const response = await withDailyJobLock(operationId, async () => {
    const saved = await loadDailyCheckpoint(operationId);
    if (saved?.phase === "completed") return NextResponse.json({ ok: true, operationId, resumed: true, phase: "completed" });
    if (saved?.phase === "notifying" || saved?.phase === "needs_review" || saved?.phase === "collecting") {
      return NextResponse.json({ operationId, phase: "needs_review", reason: saved.reason ?? "Previous side effect or collection outcome is unknown; review before retry" }, { status: 409 });
    }
    const started = Date.now();
    const freshRun = !saved || saved.phase === "ready";
    if (freshRun) await saveDailyCheckpoint(checkpoint(operationId, "collecting"));
    /*
     * 市況をリサーチの材料として先に取り込む（要件5）。
     * runResearch より前に置くことで、その日の市況ネタも
     * 同じ実行の中でクラスタ化・候補化の対象に入る。
     * 既存の investmentBridgeEnabled で制御し、OFFなら何もしない。
     */
    let marketIntake: MarketIntakeResult | null = null;
    let marketIntakeError: string | undefined;
    try {
      if (freshRun) {
      const settings = await loadResearchSettings();
      if (settings.flags.investmentBridgeEnabled) {
        marketIntake = await runMarketIntake();
      }
      }
    } catch (error) {
      // 市況の取り込みが落ちても通常のリサーチは走らせる
      marketIntakeError = error instanceof Error ? error.message : "市況の取り込みに失敗しました";
      console.error("[cron/note-daily-research] 市況の取り込みに失敗:", error);
    }

    const result = saved?.result ?? await runResearch();
    if (freshRun) await saveDailyCheckpoint(checkpoint(operationId, "collected", {
      fetched: result.fetched, newItems: result.newItems,
      topCandidates: result.topCandidates.slice(0, policy.maxCandidates), failures: result.failures,
      xSkippedReason: result.xSkippedReason, estimatedCostUsd: result.estimatedCostUsd, ranAt: result.ranAt,
    }));
    if (Date.now() - started > policy.maxDurationMs) return NextResponse.json({ deferred: true, operationId, phase: "collected", reason: "time budget" }, { status: 202 });

    // 役割ごとの実行記録（要件3）
    const stepLog: RecordStepInput[] = [];
    if (marketIntake) {
      stepLog.push({
        stepId: "market.intake",
        status: marketIntakeError ? "failed" : "done",
        result: marketIntake.added > 0 ? `市況メモを${marketIntake.added}件取り込み` : marketIntake.reason,
        failureReason: marketIntakeError,
      });
    }
    stepLog.push({
      stepId: "research.collect",
      status: "done",
      result: `新規${result.newItems}件・候補${result.topCandidates.length}件`,
    });
    // 市況取り込み → リサーチ を1つのトレースにまとめる（Phase 4 §5）
    if (freshRun) await recordPipelineSteps(
      stepLog,
      startTrace({ departmentId: "note", workflowId: "daily-research" })
    );

    const [items, experiences] = await Promise.all([loadResearchInbox(), loadExperiences()]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const expById = new Map(experiences.map((e) => [e.id, e]));

    const candidates = result.topCandidates.slice(0, policy.maxCandidates);
    const blocks = candidates.flatMap((cluster) =>
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
      candidates.length > 0
        ? `今朝のリサーチが終わりました（新規 ${result.newItems}件 / 候補 ${candidates.length}件）`
        : `今朝のリサーチが終わりました。新しい候補はありません（取得 ${result.fetched}件）`;

    const notes = [
      result.xSkippedReason ? `X: ${result.xSkippedReason}` : "",
      result.failures.length > 0
        ? `取得できなかったソース ${result.failures.length}件（他は続行しました）`
        : "",
    ].filter(Boolean);

    const channel = process.env.X_NOTIFICATION_CHANNEL ?? "slack";
    await saveDailyCheckpoint(checkpoint(operationId, "notifying", {
      fetched: result.fetched, newItems: result.newItems, topCandidates: candidates,
      failures: result.failures, xSkippedReason: result.xSkippedReason,
      estimatedCostUsd: result.estimatedCostUsd, ranAt: result.ranAt,
    }));
    const slack = channel === "line" ? { ok: false, error: undefined } : await postToSlack(
      notes.length > 0 ? `${summary}\n${notes.join("\n")}` : summary,
      blocks.length > 0 ? blocks : undefined
    );
    let lineUnknown = false;
    const lineDeliveries = channel === "slack" ? [] : await deliverNotifications(
      buildXResearchEvents(candidates, items),
      getExecutionStore(),
      xResearchAdapters("line")
    ).catch(() => { lineUnknown = true; return []; });

    if ((channel !== "line" && !slack.ok) || lineUnknown || lineDeliveries.some((delivery) => delivery.status === "FAILED")) {
      await saveDailyCheckpoint(checkpoint(operationId, "needs_review", {
        fetched: result.fetched, newItems: result.newItems, topCandidates: candidates,
        failures: result.failures, xSkippedReason: result.xSkippedReason,
        estimatedCostUsd: result.estimatedCostUsd, ranAt: result.ranAt,
      }, "Notification outcome requires review"));
      return NextResponse.json({ operationId, phase: "needs_review", slackError: slack.error }, { status: 409 });
    }
    await saveDailyCheckpoint(checkpoint(operationId, "completed"));
    return NextResponse.json({
      ok: true,
      operationId,
      newItems: result.newItems,
      candidates: candidates.length,
      failures: result.failures,
      xSkippedReason: result.xSkippedReason,
      slackDelivered: slack.ok,
      slackError: slack.error,
      lineDelivered: lineDeliveries.some((delivery) => delivery.status === "SENT"),
      lineError: lineDeliveries.find((delivery) => delivery.status === "FAILED")?.error,
      marketIntake,
      marketIntakeError,
      usage: { estimatedCostUsd: result.estimatedCostUsd, providerUsage: null, providerUsageStatus: "unknown" },
      policy: { appLimitOnly: true, providerBillingCap: false },
    });
    });
    return response ?? NextResponse.json({ skipped: true, reason: "Another daily tick is active" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "リサーチに失敗しました";
    console.error("[cron/note-daily-research] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manual replay is only possible after an operator has checked the uncertain notification. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!["retry-notification", "restart-collection"].includes(body?.action) || body?.confirmedReviewed !== true) {
    return NextResponse.json({ error: "Explicit reviewed retry is required" }, { status: 400 });
  }
  try {
    const operationId = await resolveDailyOperationId();
    const saved = await loadDailyCheckpoint(operationId);
    if (body.action === "retry-notification") {
      if (saved?.phase !== "needs_review" || !saved.result) return NextResponse.json({ error: "No retryable notification" }, { status: 409 });
      await saveDailyCheckpoint(checkpoint(operationId, "collected", saved.result));
    } else {
      if (saved?.phase !== "collecting" && !(saved?.phase === "needs_review" && !saved.result)) return NextResponse.json({ error: "No collection requiring review" }, { status: 409 });
      await saveDailyCheckpoint(checkpoint(operationId, "ready"));
    }
    return GET(req);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry unavailable" }, { status: 503 });
  }
}
