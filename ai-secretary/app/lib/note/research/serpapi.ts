/**
 * SerpAPI接続状態の判定。
 *
 * 判定に使うのは環境変数の有無だけ。APIキー自体はここからも、
 * この関数を呼ぶどのAPIレスポンス・ログからも返さない（booleanのみ）。
 */

export type SerpApiStatus = { configured: boolean };

export function isSerpApiConfigured(): boolean {
  return process.env.SERPAPI_ENABLED === "true" && Boolean(process.env.SERPAPI_KEY);
}

export function serpApiStatus(): SerpApiStatus {
  return { configured: isSerpApiConfigured() };
}
