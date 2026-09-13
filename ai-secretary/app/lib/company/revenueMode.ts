/**
 * 収益モード — Phase 5 §26 / §27 / §58 / §59
 *
 * 最初の1円に到達する前と後では、優先すべきものが違う。
 *
 *   FIRST_REVENUE_MODE … 金額の大きさより「売上が発生する確率」と「到達までの速さ」
 *   GROWTH_MODE        … 金額・再現性・拡張性・自動化・利益率
 *
 * 最初から大型事業を優先すると、いつまでも1円に届かない。
 * ここでモードを分けるのは、推薦の基準そのものを切り替えるため。
 */

export type RevenueMode = "FIRST_REVENUE_MODE" | "GROWTH_MODE";

export const REVENUE_MODE_LABELS: Record<RevenueMode, string> = {
  FIRST_REVENUE_MODE: "最初の1円モード",
  GROWTH_MODE: "成長モード",
};

/**
 * モードを決める。
 * 未計測（null）は「まだ稼げていない」と同じ扱いにする。
 * 計測できていない状態で成長モードに入ると、根拠なく大型案件を勧めてしまう。
 */
export function resolveRevenueMode(aiGeneratedRevenueYen: number | null): RevenueMode {
  return aiGeneratedRevenueYen !== null && aiGeneratedRevenueYen > 0
    ? "GROWTH_MODE"
    : "FIRST_REVENUE_MODE";
}

/**
 * §59 推薦の優先順位。
 * FIRST_REVENUE_MODE では既存資産を使うものほど上、新規開発ほど下。
 * 数字が小さいほど先に勧める。
 */
export const FIRST_REVENUE_PRIORITY: Record<string, number> = {
  content: 1,
  affiliate: 2,
  consulting: 3,
  service: 4,
  automation: 5,
  product: 6,
  saas: 7,
  other: 8,
};

/** GROWTH_MODE では拡張性の高いものを上へ */
export const GROWTH_PRIORITY: Record<string, number> = {
  saas: 1,
  product: 2,
  automation: 3,
  service: 4,
  affiliate: 5,
  content: 6,
  consulting: 7,
  other: 8,
};

export function categoryPriority(category: string, mode: RevenueMode): number {
  const table = mode === "FIRST_REVENUE_MODE" ? FIRST_REVENUE_PRIORITY : GROWTH_PRIORITY;
  return table[category] ?? 9;
}
