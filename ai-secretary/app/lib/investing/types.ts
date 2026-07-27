/**
 * AI投資パートナーのドメイン型。
 *
 * 重要な原則: ここに載る数字は必ず実データ（Vaultの保有記録・市場データ）由来にする。
 * 取得できない項目は 0 や推定値で埋めず null のままにし、UIで「未取得」と表示する。
 */

export type AssetClass = "us_stock" | "jp_stock" | "fund" | "cash" | "other";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  us_stock: "米国株",
  jp_stock: "日本株",
  fund: "投資信託",
  cash: "現金",
  other: "その他",
};

export type Position = {
  /** ティッカー or 銘柄コード（投信は識別用スラッグ） */
  code: string;
  name: string;
  assetClass: AssetClass;
  /** 株数・口数 */
  quantity: number | null;
  /** 取得単価（元通貨） */
  avgCost: number | null;
  /** 現在値（元通貨） */
  currentPrice: number | null;
  /** 円換算の評価額 */
  marketValueJpy: number | null;
  /** 円換算の含み損益 */
  pnlJpy: number | null;
  /** 損益率(%) */
  pnlPct: number | null;
  /** 通貨（表示用） */
  currency: "USD" | "JPY";
  /** 投資仮説・確信度（positions.md 由来。無ければ null） */
  thesis?: string | null;
  risk?: string | null;
  conviction?: string | null;
};

export type PortfolioSummary = {
  /** 総資産（保有評価額合計）。取得できなければ null */
  totalValueJpy: number | null;
  /** 含み益合計 */
  totalPnlJpy: number | null;
  /** 評価損益率(%) */
  totalPnlPct: number | null;
  /** 現金残高。未設定なら null（「未確定」表示） */
  cashJpy: number | null;
  /** 本日の損益。日次スナップショットが2点以上ないと出せないため null になりうる */
  todayPnlJpy: number | null;
  todayPnlPct: number | null;
  /** 資産クラス別の内訳 */
  allocation: { assetClass: AssetClass; label: string; valueJpy: number; pct: number }[];
};

export type Portfolio = {
  positions: Position[];
  summary: PortfolioSummary;
  /** データの出所（UIで明示する） */
  source: "holdings_csv" | "positions_md" | "none";
  updatedAt: string | null;
};

/** 資産推移チャートの1点 */
export type ValuePoint = {
  /** YYYY-MM-DD */
  date: string;
  totalValueJpy: number;
};

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export const CHART_RANGES: { id: ChartRange; label: string; days: number | null }[] = [
  { id: "1D", label: "1日", days: 1 },
  { id: "1W", label: "1週", days: 7 },
  { id: "1M", label: "1ヶ月", days: 30 },
  { id: "3M", label: "3ヶ月", days: 90 },
  { id: "1Y", label: "1年", days: 365 },
  { id: "ALL", label: "全期間", days: null },
];

export type Sentiment = "positive" | "neutral" | "negative";

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "ポジティブ",
  neutral: "中立",
  negative: "ネガティブ",
};

export type NewsItem = {
  id: string;
  title: string;
  /** AIによる要約。生成前は null */
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string;
  /** 関連ティッカー */
  tickers: string[];
  sentiment: Sentiment | null;
};

export function formatJpy(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const sign = opts.sign && rounded > 0 ? "+" : "";
  return `${sign}¥${rounded.toLocaleString("ja-JP")}`;
}

export function formatPct(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = opts.sign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
