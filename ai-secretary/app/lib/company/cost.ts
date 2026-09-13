/**
 * 実行コストと再試行の記録 — Phase 4 §7 / §8
 *
 * §7 の要点: Providerから正確なコストが取れない場合は unknown とする。
 * 推測値を実績として保存しない。
 * 推測を実績に混ぜると、Proposal Score の Cost Reduction が
 * 実在しない削減効果を根拠に点を付けることになる。
 */

export type ExecutionCost = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** 算出できた場合のみ。できなければ undefined（0にしない） */
  estimatedCostUsd?: number;
  externalApiCostUsd?: number;
};

export type CostResolution =
  | { known: true; usd: number; cost: ExecutionCost }
  | { known: false; reason: string; cost: ExecutionCost };

/**
 * 1トークンあたりの単価（USD）。
 * 分かっているものだけを載せる。載っていないモデルは unknown になる。
 * 「だいたいこれくらい」で埋めない。
 */
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  // 単価が確認できたモデルのみをここへ追加する
};

/**
 * コストを確定させる。
 * 単価が分からない、トークン数が無い場合は known: false を返す。
 */
export function resolveCost(cost: ExecutionCost): CostResolution {
  if (typeof cost.estimatedCostUsd === "number" && Number.isFinite(cost.estimatedCostUsd)) {
    return { known: true, usd: cost.estimatedCostUsd, cost };
  }
  if (typeof cost.externalApiCostUsd === "number" && Number.isFinite(cost.externalApiCostUsd)) {
    return { known: true, usd: cost.externalApiCostUsd, cost };
  }

  const price = cost.model ? TOKEN_PRICES[cost.model] : undefined;
  if (!price) {
    return { known: false, reason: `モデル ${cost.model ?? "不明"} の単価が未登録です`, cost };
  }
  if (typeof cost.inputTokens !== "number" || typeof cost.outputTokens !== "number") {
    return { known: false, reason: "トークン数が記録されていません", cost };
  }

  const usd = cost.inputTokens * price.input + cost.outputTokens * price.output;
  return { known: true, usd: Math.round(usd * 1_000_000) / 1_000_000, cost };
}

/* ─── 再試行（§8） ──────────────────────────────── */

export type RetryInfo = {
  /** 何回目の試行か。初回は1 */
  attempt: number;
  /** 再試行した回数。attempt - 1 */
  retryCount: number;
  retryReason?: string;
};

export function retryInfo(attempt: number, reason?: string): RetryInfo {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return {
    attempt: safeAttempt,
    retryCount: safeAttempt - 1,
    retryReason: reason,
  };
}
