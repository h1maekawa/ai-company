/**
 * イベントの記録係 — §3 Organization Observer の観測部分
 *
 * Observer は「観測だけを担当し、会社構造を変更する権限を持たない」（§3）。
 * このファイルも読み書きするのは events.md だけで、
 * 設定・組織・投稿に一切触れない。
 *
 * 呼び出し側の約束:
 *   await せずに投げっぱなしにしない（Vercelの関数が先に終わると書き込みが飛ぶ）。
 *   ただし失敗しても本処理は続ける（内部でcatch済み）。
 */

import { appendCompanyEvents } from "./eventStore";
import { createCompanyEvent, type CreateEventInput } from "./events";
import { elapsedMs, type ExecutionContext } from "./trace";
import { resolveCost, type ExecutionCost, type RetryInfo } from "./cost";

/** 1件記録する */
export async function observe(input: CreateEventInput): Promise<void> {
  await appendCompanyEvents([createCompanyEvent(input)]);
}

/** 同じ処理内の複数イベントをまとめて記録する（Vaultへの書き込みを1回に抑える） */
export async function observeMany(inputs: CreateEventInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await appendCompanyEvents(inputs.map(createCompanyEvent));
}

/**
 * 処理時間を測りながら実行して記録する。
 * latency は Proposal Score の Time Saving（20点）の元データになるため、
 * 測れるところでは必ず測る。
 */
export async function observed<T>(
  input: Omit<CreateEventInput, "outcome" | "latencyMs">,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    await observe({ ...input, outcome: "success", latencyMs: Date.now() - started });
    return result;
  } catch (error) {
    await observe({
      ...input,
      outcome: "failure",
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/* ─── トレース付きの記録（Phase 4 §5〜§9） ───────── */

export type TracedObserveInput = Omit<
  CreateEventInput,
  "latencyMs" | "traceId" | "parentTraceId" | "startedAt" | "completedAt"
> & {
  /** 省略可。渡さなければトレースなしで従来どおり記録される */
  context?: ExecutionContext;
  cost?: ExecutionCost;
  retry?: RetryInfo;
};

/**
 * トレース・コスト・再試行を添えて記録する。
 *
 * コストは確定できたものだけ costUsd に入れる。
 * 確定できなければ理由を残して costUsd は undefined のままにする（§7）。
 * 推測値を実績として保存すると、Cost Reduction の点が架空の削減で付く。
 */
export async function observeTraced(input: TracedObserveInput, now: Date = new Date()): Promise<void> {
  const { context, cost, retry, ...rest } = input;
  const resolved = cost ? resolveCost(cost) : null;

  await observe({
    ...rest,
    now,
    ...(context
      ? {
          traceId: context.traceId,
          parentTraceId: context.parentTraceId,
          workflowId: context.workflowId,
          skillId: rest.skillId ?? context.skillId,
          startedAt: context.startedAt,
          completedAt: now.toISOString(),
          latencyMs: elapsedMs(context, now) ?? undefined,
        }
      : {}),
    ...(retry
      ? { attempt: retry.attempt, retries: retry.retryCount, retryReason: retry.retryReason }
      : {}),
    ...(resolved?.known
      ? {
          costUsd: resolved.usd,
          cost: {
            provider: resolved.cost.provider,
            model: resolved.cost.model,
            inputTokens: resolved.cost.inputTokens,
            outputTokens: resolved.cost.outputTokens,
          },
        }
      : resolved
        ? { costUnknownReason: resolved.reason }
        : {}),
  });
}
