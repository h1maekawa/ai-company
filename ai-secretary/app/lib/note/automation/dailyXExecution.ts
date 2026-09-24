import type { BufferResult, CreatedPost } from "../publishing/buffer";
import { isAmbiguousBufferError } from "../publishing/buffer";
import type { ClaimResult } from "../publishing/queue";
import type { ContentGrowthStrategy, DailyXPlan, DailyXPlanSlot, DailyXSlotStatus, SocialDraft, TrendCluster } from "../research/types";
import { tokyoDateKey } from "../tokyoDate";
import { buildDailyXPlan } from "./dailyXPlan";

/**
 * Daily X 実行の中核（依存注入）。I/Oは deps だけを通す。
 *
 * 正しさの優先順位: 二重投稿しない > 上限を守る > retryできる > 最適化
 * - 当日Planを再利用し、生成は status=planned の slot だけ（retryでLLMを再実行しない）
 * - 予約経路は claimStrict のみ（fail-closed）。結果不明・永続化失敗・strict unavailable でそのRunの予約を即停止
 * - Buffer成功後は Plan → Draft → count → history の順で保存。Plan（二重予約防止の正）を最初に保存する
 */

export const MISSED_MARGIN_MS = 5 * 60_000;

export type DailyXContext = {
  accountKey: string;
  strategy: ContentGrowthStrategy;
  maxXPostsPerDay: number;
  /** publishingEnabled && xAutoPublish（socialOperationMode = autopilot） */
  autopilot: boolean;
  bufferConfigured: boolean;
  /** brand.xAccounts[0]。自動予約するのはこのaccountのDraftだけ */
  primaryAccountId: string | null;
};

export type SafetyOutcome = { draft: SocialDraft; safe: boolean; reasons: string[] };

export type DailyXDeps = {
  now(): Date;
  loadPlan(date: string, accountKey: string): Promise<DailyXPlan | null>;
  savePlan(plan: DailyXPlan): Promise<void>;
  /** status=candidate / !blocked / Hot confidence 済みの候補 */
  loadCandidates(): Promise<{ eligibleCount: number; candidates: TrendCluster[] }>;
  findCluster(id: string): Promise<TrendCluster | null>;
  markClustersUsed(ids: string[]): Promise<void>;
  /** 既存生成（investment bridge を含む）。生成できなければ draft: null */
  generateForSlot(slot: DailyXPlanSlot, cluster: TrendCluster): Promise<{ draft: SocialDraft | null; warning?: string }>;
  safetyGate(draft: SocialDraft): Promise<SafetyOutcome>;
  loadDrafts(): Promise<SocialDraft[]>;
  saveDrafts(drafts: SocialDraft[]): Promise<void>;
  claimStrict(key: string): Promise<ClaimResult>;
  releaseClaim(key: string): Promise<void>;
  countForTokyoDate(dateKey: string): Promise<number | "unavailable">;
  incrementForTokyoDate(dateKey: string): Promise<void>;
  createPost(draft: SocialDraft, scheduledAt: string): Promise<BufferResult<CreatedPost>>;
  appendHistory(entry: { id: string; platform: "x"; contentId: string; action: string; at: string; detail: string }): Promise<void>;
  notifySlack(text: string, drafts: SocialDraft[]): Promise<{ ok: boolean; error?: string }>;
  logError(message: string, detail: Record<string, unknown>): void;
};

export type PersistenceAfterPublishFailure = { planSlotId: string; draftId: string; bufferPostId: string; scheduledAt: string; failedSteps: string[] };

export type DailyXResult = {
  skipped?: boolean;
  reason?: string;
  planId?: string;
  slots?: Array<{ id: string; status: DailyXSlotStatus; failureKind?: string }>;
  clusterId?: string;
  generated: number;
  scheduledDraftId?: string;
  scheduledDraftIds?: string[];
  safetyBlocked?: number;
  haltedReason?: string;
  haltedAtSlotId?: string;
  persistenceAfterPublishFailures?: PersistenceAfterPublishFailure[];
  clusterUsedError?: string;
  escalated?: boolean;
  slackDelivered?: boolean;
  slackError?: string;
};

const planDraftLineage = (plan: DailyXPlan, slot: DailyXPlanSlot) => ({
  planId: plan.id,
  planSlotId: slot.id,
  exploration: slot.exploration,
  strategySnapshot: {
    purposeMix: { ...plan.strategySnapshot.purposeMix },
    explorationRate: plan.strategySnapshot.explorationRate,
    ...(plan.strategySnapshot.strategyUpdatedAt ? { strategyUpdatedAt: plan.strategySnapshot.strategyUpdatedAt } : {}),
  },
});

export async function executeDailyXPlan(ctx: DailyXContext, deps: DailyXDeps): Promise<DailyXResult> {
  const now = deps.now();
  const date = tokyoDateKey(now);
  const stamp = () => deps.now().toISOString();

  /* 1. 当日Plan（あれば必ず再利用。再計算しない） */
  let plan = await deps.loadPlan(date, ctx.accountKey);
  if (!plan) {
    const { eligibleCount, candidates } = await deps.loadCandidates();
    const built = buildDailyXPlan({ date, accountKey: ctx.accountKey, now, strategy: ctx.strategy, maxXPostsPerDay: ctx.maxXPostsPerDay, candidates });
    if (!built) {
      return {
        skipped: true,
        reason: eligibleCount > 0 ? "Hot判定の信頼度がLOWのみのため、本日の自動投稿を見送りました" : "利用可能な候補がありません",
        generated: 0,
        escalated: false,
      };
    }
    await deps.savePlan(built);
    plan = built;
  }
  const savePlan = async () => { plan!.updatedAt = stamp(); await deps.savePlan(plan!); };
  const setSlot = (slot: DailyXPlanSlot, patch: Partial<DailyXPlanSlot>) => { Object.assign(slot, patch, { updatedAt: stamp() }); };

  /* S4.1 Plan保存後に unique cluster を idempotent に used 化（失敗しても止めない） */
  let clusterUsedError: string | undefined;
  const clusterIds = [...new Set(plan.slots.flatMap((slot) => slot.candidateRef?.kind === "cluster" ? [slot.candidateRef.id] : []))];
  try { await deps.markClustersUsed(clusterIds); } catch (error) {
    clusterUsedError = error instanceof Error ? error.message : "cluster used化に失敗";
    deps.logError("[daily-x] cluster used化に失敗（Planのcandidateが正なので続行）", { planId: plan.id, clusterIds, error: clusterUsedError });
  }

  /* S7 予定時刻を過ぎたslotは missed（翌日へ繰り越さない） */
  let changed = false;
  for (const slot of plan.slots) {
    if (["planned", "generated", "failed"].includes(slot.status) && Date.parse(slot.scheduledAt) <= now.getTime() + MISSED_MARGIN_MS) {
      setSlot(slot, { status: "missed", failureKind: "past-slot", failureReason: "予定時刻を過ぎたため実行しませんでした" });
      changed = true;
    }
  }
  if (changed) await savePlan();

  /* 2. 生成（planned のslotだけ） */
  let drafts = await deps.loadDrafts();
  const newlyGenerated: SocialDraft[] = [];
  const warnings: string[] = [];
  let generationFailures = 0;
  for (const slot of plan.slots.filter((item) => item.status === "planned")) {
    const cluster = slot.candidateRef ? await deps.findCluster(slot.candidateRef.id) : null;
    if (!cluster) {
      setSlot(slot, { status: "skipped", failureKind: "candidate-missing", failureReason: "Planの候補clusterが見つかりません" });
      await savePlan();
      continue;
    }
    const generated = await deps.generateForSlot(slot, cluster);
    if (generated.warning) warnings.push(generated.warning);
    if (!generated.draft) {
      // 生成できなかった slot は planned のまま（次回実行で再生成できる）
      generationFailures++;
      setSlot(slot, { failureKind: "generation-failed", failureReason: generated.warning ?? "生成できませんでした" });
      await savePlan();
      continue;
    }
    const gate = await deps.safetyGate({ ...generated.draft, ...planDraftLineage(plan, slot) });
    const draft = gate.safe ? gate.draft : { ...gate.draft, failureReason: gate.reasons.join(" / ") };
    newlyGenerated.push(draft);
    drafts = [draft, ...drafts.filter((item) => item.id !== draft.id)];
    await deps.saveDrafts(drafts);
    setSlot(slot, gate.safe
      ? { status: "generated", draftId: draft.id, failureKind: undefined, failureReason: undefined }
      : { status: "blocked", draftId: draft.id, failureKind: "safety-gate", failureReason: draft.failureReason });
    await savePlan();
  }

  const safetyBlocked = newlyGenerated.filter((draft) => Boolean(draft.failureReason)).length;
  const scheduledDraftIds: string[] = [];
  const messages: string[] = [];
  const persistenceFailures: PersistenceAfterPublishFailure[] = [];
  let haltedReason: string | undefined;
  let haltedAtSlotId: string | undefined;
  const halt = (reason: string, slotId?: string) => { haltedReason = reason; haltedAtSlotId = slotId; };

  /* 3. 予約（autopilot + Buffer設定済みのときだけ） */
  if (!ctx.autopilot) {
    messages.push("自動投稿フラグがOFFのため下書き保存で停止しました。");
  } else if (!ctx.bufferConfigured) {
    messages.push("自動予約は行いませんでした: Bufferの環境変数が未設定です。");
  } else {
    const pendingAmbiguous = plan.slots.find((slot) => slot.status === "ambiguous");
    if (pendingAmbiguous) halt("ambiguous-slot-pending", pendingAmbiguous.id);
    for (const slot of plan.slots.filter((item) => item.status === "generated" || item.status === "failed").sort((a, b) => a.slotIndex - b.slotIndex)) {
      if (haltedReason) break;
      const draft = drafts.find((item) => item.id === slot.draftId);
      if (!draft) {
        setSlot(slot, { status: "skipped", failureKind: "draft-missing", failureReason: "Draftが見つかりません" });
        await savePlan();
        continue;
      }
      // S15: Buffer送信先はenvの単一channel。primary account以外のDraftは自動予約しない
      if (!ctx.primaryAccountId || draft.xAccountId !== ctx.primaryAccountId) {
        setSlot(slot, { status: "skipped", failureKind: "non-primary-account", failureReason: "primary X account以外のため自動予約しません（REVIEW / 手動で扱えます）" });
        await savePlan();
        continue;
      }
      const count = await deps.countForTokyoDate(plan.date);
      if (count === "unavailable") { halt("daily-count-unavailable", slot.id); break; }
      if (count >= ctx.maxXPostsPerDay) {
        for (const rest of plan.slots.filter((item) => (item.status === "generated" || item.status === "failed") && item.slotIndex >= slot.slotIndex)) {
          setSlot(rest, { status: "skipped", failureKind: "daily-limit", failureReason: `1日の上限（${ctx.maxXPostsPerDay}件）に達しました` });
        }
        await savePlan();
        messages.push(`上限到達（${ctx.maxXPostsPerDay}件/日）`);
        break;
      }
      const claim = await deps.claimStrict(slot.id);
      if (claim === "unavailable") { halt("claim-unavailable", slot.id); break; }
      if (claim === "duplicate") {
        // claimは残っているのにPlanは未予約 = 前回Runで永続化に失敗した可能性。人間確認まで予約しない
        halt("claim-duplicate-unscheduled", slot.id);
        break;
      }
      const post = await deps.createPost(draft, slot.scheduledAt);
      if (post.ok === false) {
        if (isAmbiguousBufferError(post.error)) {
          setSlot(slot, { status: "ambiguous", failureKind: post.error.kind, failureReason: post.error.message });
          await savePlan();
          messages.push(`予約結果不明 ${slot.scheduledTime}: ${post.error.message}`);
          halt("buffer-ambiguous", slot.id);
          break;
        }
        await deps.releaseClaim(slot.id);
        setSlot(slot, { status: "failed", failureKind: post.error.kind, failureReason: post.error.message });
        await savePlan();
        messages.push(`予約失敗 ${slot.scheduledTime}: ${post.error.message}`);
        continue;
      }

      /* S4.2 Buffer成功後の永続化。失敗してもclaimは解放せず、blind retryしない */
      const bufferPostId = post.data.id;
      const scheduledAt = post.data.dueAt ?? slot.scheduledAt;
      const at = stamp();
      const failedSteps: string[] = [];
      try { setSlot(slot, { status: "scheduled", bufferPostId, failureKind: undefined, failureReason: undefined }); await savePlan(); } catch { failedSteps.push("plan"); }
      try {
        drafts = drafts.map((item) => item.id === draft.id
          ? { ...item, status: "queued" as const, bufferPostId, scheduledAt, text: post.data.draft.text, updatedAt: at }
          : item);
        await deps.saveDrafts(drafts);
      } catch { failedSteps.push("draft"); }
      try { await deps.incrementForTokyoDate(plan.date); } catch { failedSteps.push("daily-count"); }
      try {
        await deps.appendHistory({ id: `h${Date.now().toString(36)}${slot.slotIndex}`, platform: "x", contentId: draft.id, action: "毎日自動化でBufferへ予約", at, detail: `${slot.purpose} / 予定 ${scheduledAt} / plan ${plan.id} / slot ${slot.id} / cluster ${slot.candidateRef?.id ?? "none"}` });
      } catch { failedSteps.push("history"); }
      scheduledDraftIds.push(draft.id);
      if (failedSteps.length) {
        const failure = { planSlotId: slot.id, draftId: draft.id, bufferPostId, scheduledAt, failedSteps };
        // Slack送信より先に必ずログへ残す（本文は含めない）
        deps.logError("[daily-x] persistence-after-publish failure", failure);
        persistenceFailures.push(failure);
        halt("persistence-after-publish", slot.id);
        break;
      }
      messages.push(`予約完了: ${slot.scheduledTime} ${slot.purpose}`);
    }
  }

  /* 4. Human Escalation（既存条件 + ambiguous / 予約停止 / 永続化失敗） */
  const ambiguousCount = plan.slots.filter((slot) => slot.status === "ambiguous").length;
  const bufferFailureCount = messages.filter((message) => message.startsWith("予約失敗")).length;
  const bufferAuthOrConfigError = plan.slots.some((slot) => slot.status === "failed" && (slot.failureKind === "auth" || slot.failureKind === "config"));
  const secretOrPersonalDataDetected = newlyGenerated.some((draft) => draft.failureReason?.includes("機密情報") || draft.failureReason?.includes("個人情報"));
  const escalate = generationFailures > 0 || safetyBlocked > 0 || bufferFailureCount >= 2 || bufferAuthOrConfigError || secretOrPersonalDataDetected || ambiguousCount > 0 || Boolean(haltedReason) || persistenceFailures.length > 0;

  let slack: { ok: boolean; error?: string } = { ok: true };
  if (escalate) {
    slack = await deps.notifySlack([
      "⚠️ SNS事業部 異常検知",
      `Plan ${plan.id}: ${plan.slots.map((slot) => `${slot.scheduledTime}=${slot.status}`).join(" / ")}`,
      newlyGenerated.length ? `本日のX投稿案を${newlyGenerated.length}件作成しました。` : "",
      generationFailures ? `投稿案を生成できなかったslotが${generationFailures}件あります（次回実行で再生成します）。` : "",
      messages.join(" / "),
      haltedReason ? `予約を停止しました: ${haltedReason}（slot ${haltedAtSlotId ?? "-"}）。人間の確認が必要です。` : "",
      ...persistenceFailures.map((failure) => `Buffer予約後の保存に失敗: bufferPostId=${failure.bufferPostId} / slot=${failure.planSlotId} / draft=${failure.draftId} / 予定=${failure.scheduledAt} / 失敗=${failure.failedSteps.join(",")}`),
      ambiguousCount ? `送信結果不明のslotが${ambiguousCount}件あります。Buffer画面で予約の有無を確認してください。` : "",
      warnings.length ? `注意: ${[...new Set(warnings)].join(" / ")}` : "",
      safetyBlocked > 0 ? `Safety/Fact Gateで${safetyBlocked}件却下しました。` : "",
      secretOrPersonalDataDetected ? "機密情報・個人情報らしき文字列を検出したため却下しました。" : "",
    ].filter(Boolean).join("\n"), newlyGenerated).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "Slack送信に失敗" }));
  }

  return {
    planId: plan.id,
    slots: plan.slots.map((slot) => ({ id: slot.id, status: slot.status, ...(slot.failureKind ? { failureKind: slot.failureKind } : {}) })),
    clusterId: plan.slots[0]?.candidateRef?.id,
    generated: newlyGenerated.length,
    scheduledDraftId: scheduledDraftIds[0],
    scheduledDraftIds,
    safetyBlocked,
    ...(haltedReason ? { haltedReason, haltedAtSlotId } : {}),
    ...(persistenceFailures.length ? { persistenceAfterPublishFailures: persistenceFailures } : {}),
    ...(clusterUsedError ? { clusterUsedError } : {}),
    escalated: escalate,
    slackDelivered: slack.ok,
    slackError: slack.error,
  };
}
