import { NextRequest, NextResponse } from "next/server";
import { loadSocialDrafts, saveSocialDrafts } from "@/app/lib/note/research/store";
import { withLock } from "@/app/lib/note/publishing/queue";
import { applyDraftCleanup, planDraftCleanup } from "@/app/lib/note/maintenance/draftCleanup";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { getExecutionStore } from "@/app/lib/company/execution/store";

export const dynamic = "force-dynamic";

/**
 * 旧X下書きの一回限りの整理（Human-confirmed maintenance）。
 *
 * GET  = dry-run。件数とid/statusだけを返し、何も変更しない。
 * POST = 本実行。same-origin・idempotency-key・confirmedByHuman・dry-runのplanId一致が必須。
 *
 * - X Daily Automationと同じロック（daily-x-publish）を取り、同時書き込みを避ける。
 * - Buffer予約はキャンセルしない。published / queued / scheduled / Research / Performance には触れない。
 * - ログには削除したidとstatusだけを残し、本文は出力しない。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const plan = planDraftCleanup(await loadSocialDrafts());
    return NextResponse.json({ dryRun: true, ...plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DRY_RUN_FAILED" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (body.confirmedByHuman !== true) return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
  if (typeof body.planId !== "string" || !body.planId) return NextResponse.json({ error: "DRY_RUN_PLAN_ID_REQUIRED" }, { status: 400 });

  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult("x-draft-cleanup", key);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("x-draft-cleanup", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });

  try {
    const result = await withLock("daily-x-publish", async () => {
      const drafts = await loadSocialDrafts();
      const plan = planDraftCleanup(drafts);
      // dry-run後に下書きが増減していたら、確認していない下書きを消さないよう中止する
      if (plan.planId !== body.planId) return { error: "PLAN_CHANGED_RERUN_DRY_RUN" as const, planId: plan.planId };
      if (plan.targets.length) await saveSocialDrafts(applyDraftCleanup(drafts, plan));
      console.info("[x-draft-cleanup] removed", JSON.stringify(plan.targets));
      return { dryRun: false, removed: plan.targets, before: plan.before, after: plan.after, retainedLinked: plan.retainedLinked, bufferCancelled: false };
    });
    if (!result) return NextResponse.json({ error: "X_DAILY_AUTOMATION_RUNNING" }, { status: 409 });
    if ("error" in result) return NextResponse.json({ error: result.error, planId: result.planId }, { status: 409 });
    await store.completeIdempotency("x-draft-cleanup", key, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CLEANUP_FAILED" }, { status: 500 });
  }
}
