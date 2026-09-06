/**
 * 家計連携の型。
 *
 * ai-company は取引を分類しない。分類の正（merchant_rules / manual_category /
 * needs_review / 固定費カテゴリ）は元帳を持つ家計簿アプリ側にある。
 * ここで扱うのは、あちらが計算した集計だけ。
 */

/** 変動費のカテゴリ内訳1行 */
export type KakeiCategoryBreakdown = {
  category: string;
  amount: number;
  /** 件数と平均は「外食を1回減らせば戻せる」の材料になる */
  count: number;
  average: number;
};

/** 要確認の取引。修正は家計簿アプリ側で行うので、ここでは表示だけ */
export type KakeiReviewItem = {
  id: string;
  date: string;
  amount: number;
  category: string;
  memo: string | null;
};

/** 家計簿アプリの月次集計スナップショット */
export type KakeiSummary = {
  month: string;
  /** ai-company が取得した時刻。キャッシュの鮮度判定に使う */
  syncedAt: string;
  currency: string;
  /** 固定費(確定分)＋変動費 */
  totalSpent: number;
  income: { planned: number; actual: number };
  fixed: { effective: number; unpaid: number };
  variable: {
    budget: number;
    spent: number;
    /** 今月あと使える額。マイナスもあり得る */
    remaining: number;
    dailyAllowance: number;
    daysLeft: number;
    /** 1.0超で使いすぎ傾向 */
    pace: number;
  };
  byCategory: KakeiCategoryBreakdown[];
  needsReview: { count: number; items: KakeiReviewItem[] };
  /** 要確認を直しに行く先（家計簿アプリの取引画面） */
  appUrl: string;
};

/** 家計簿アプリからの集計取得 */
export interface KakeiSource {
  fetchSummary(month: string): Promise<KakeiSummary>;
}
