/**
 * LLMプロバイダ由来のエラー型。
 *
 * 方針:
 * - APIキー・リクエストURL・プロンプト全文はエラーに含めない（message は固定文字列）。
 * - レート制限（429）だけは「待てば成功しうる失敗」なので、他の失敗と区別できるようにする。
 *   これにより Benchmark 側だけが Retry-After を尊重した再試行を行える（本番は fail-open のまま）。
 */

export class AIRateLimitError extends Error {
  readonly isRateLimit = true;
  /** プロバイダが提示した待機時間（ms）。不明なら undefined。 */
  readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super("rate_limited");
    this.name = "AIRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitError(e: unknown): e is AIRateLimitError {
  return e instanceof AIRateLimitError || (typeof e === "object" && e !== null && (e as { isRateLimit?: boolean }).isRateLimit === true);
}

/**
 * Retry-After ヘッダ（秒 or HTTP-date）とプロバイダ本文の retryDelay("37s") から待機時間を求める。
 * Secretは一切参照しない。
 */
export function parseRetryAfterMs(headerValue?: string | null, bodyText?: string): number | undefined {
  if (headerValue) {
    const secs = Number(headerValue);
    if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
    const at = Date.parse(headerValue);
    if (Number.isFinite(at)) {
      const diff = at - Date.now();
      if (diff > 0) return diff;
    }
  }
  if (bodyText) {
    const m = bodyText.match(/"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s"?/i);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
  }
  return undefined;
}
