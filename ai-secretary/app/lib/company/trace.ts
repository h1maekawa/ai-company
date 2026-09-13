/**
 * 実行トレース — Phase 4 §5 / §6 / §9
 *
 * Phase 3 の Workflow Candidate は traceId から手順を復元するが、
 * traceId を記録する経路が無く、実データでは動かなかった。ここがその解決。
 *
 * §6 の要請どおり、既存の関数シグネチャを壊さない形で入れる:
 *   ExecutionContext は常に optional。渡さなければ従来どおり動く。
 *   段階的に呼び出し側へ足していける。
 */

export type ExecutionContext = {
  /** 一連の処理を束ねるID。同じ仕事なら引き継ぐ */
  traceId: string;
  taskId?: string;
  /** 入れ子になった処理の親 */
  parentTraceId?: string;

  departmentId?: string;
  agentId?: string;
  skillId?: string;
  workflowId?: string;

  startedAt: string;
};

/** 新しいトレースを開始する */
export function startTrace(
  input: Omit<Partial<ExecutionContext>, "traceId" | "startedAt"> = {},
  now: Date = new Date()
): ExecutionContext {
  return {
    ...input,
    traceId: `tr_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now.toISOString(),
  };
}

/**
 * 既存のトレースを引き継ぐ。
 *
 * traceId は必ず維持する。ここで新しいIDを振ると、
 * Research → Draft → Publish が別の仕事として記録され、
 * Workflow Candidate が永久に検出されない。
 */
export function childContext(
  parent: ExecutionContext,
  overrides: Partial<Omit<ExecutionContext, "traceId">> = {},
  now: Date = new Date()
): ExecutionContext {
  return {
    ...parent,
    ...overrides,
    // traceId は上書きさせない
    traceId: parent.traceId,
    parentTraceId: parent.traceId,
    startedAt: now.toISOString(),
  };
}

/**
 * 与えられていなければ新規に開始する。
 * 呼び出し側が context を渡さなくても動くようにするための入口。
 */
export function ensureContext(
  context: ExecutionContext | undefined,
  fallback: Omit<Partial<ExecutionContext>, "traceId" | "startedAt"> = {},
  now: Date = new Date()
): ExecutionContext {
  return context ?? startTrace(fallback, now);
}

/** 経過ミリ秒。startedAt が壊れていれば null（0で埋めない） */
export function elapsedMs(context: ExecutionContext, now: Date = new Date()): number | null {
  const started = new Date(context.startedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = now.getTime() - started;
  return elapsed >= 0 ? elapsed : null;
}
