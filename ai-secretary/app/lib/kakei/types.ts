/** 家計連携の共通型 */

/** 家計簿アプリから読んだ生取引（categoryは空でも可） */
export type RawTx = {
  date: string;        // YYYY-MM-DD
  merchantRaw: string; // 原文の店名
  amount: number;      // 支出は正の数（円）
  category: string;    // あちらが持っていれば尊重。無ければ ""
  sourceId: string;    // 家計簿アプリ側の一意ID（冪等化キー）
};

/** ai-company 側の台帳1行 */
export type KakeiTx = RawTx & {
  merchantNorm: string; // 正規化店名（ルール照合キー）
  confidence: number;   // 0.0〜1.0
  needsReview: boolean; // 低確信度＝要確認（未分類は作らない）
};

/** データソース抽象。Supabase直読み / エクスポートAPI の両方を差せる */
export interface KakeiSource {
  fetchTransactions(range: { from: string; to: string }): Promise<RawTx[]>;
}
