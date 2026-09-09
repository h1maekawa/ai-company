/**
 * 更新鮮度の共通ポリシー（TASK-C2）
 *
 * ノート事業部・株式会社事業部の両方で「更新時刻 + データソース + 鮮度区分」を
 * 同じ語彙で表示するための共有型。ここに無い表現をUIで作らないこと。
 *
 * 鮮度区分の意味:
 *   live    … 数分以内に更新される（為替・APIの現在値）
 *   delayed … 取引所準拠の遅延クオート（当日中の値だが数十分の遅れがある）
 *   daily   … 1日1回の更新（投信の基準価額・前営業日終値・日次バッチ）
 *   stale   … 本来より古い値を出している（取得失敗でフォールバック中）
 *   none    … データそのものが無い
 */

export type FreshnessLevel = "live" | "delayed" | "daily" | "stale" | "none";

export interface DataFreshness {
  level: FreshnessLevel;
  /** ISO8601 か YYYY-MM-DD。不明なら null */
  asOf: string | null;
  /** データの出所（例: "Yahoo Finance", "楽天証券CSV", "Buffer"） */
  source: string;
  /** 補足（例: "現在値を取得できずCSVの値を表示"） */
  note?: string | null;
}

export const FRESHNESS_LABELS: Record<FreshnessLevel, string> = {
  live: "リアルタイム",
  delayed: "遅延",
  daily: "日次",
  stale: "未更新",
  none: "未取得",
};

/** 悪い方（古い方）の鮮度を返す。複数ソースを束ねたカードの見出しに使う */
const SEVERITY: Record<FreshnessLevel, number> = {
  live: 0,
  delayed: 1,
  daily: 2,
  stale: 3,
  none: 4,
};

export function worstFreshness(levels: FreshnessLevel[]): FreshnessLevel {
  if (levels.length === 0) return "none";
  return levels.reduce((worst, l) => (SEVERITY[l] > SEVERITY[worst] ? l : worst));
}

function toDate(asOf: string | null | undefined): Date | null {
  if (!asOf) return null;
  // "YYYY-MM-DD" は取引所ローカルの日付として扱う（時刻は不明なので0時）
  const value = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T00:00:00+09:00` : asOf;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 経過分数（未来・不明は null） */
export function ageMinutes(asOf: string | null | undefined): number | null {
  const date = toDate(asOf);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
}

/** "たった今" / "12分前" / "3時間前" / "2日前" */
export function relativeAge(asOf: string | null | undefined): string {
  const minutes = ageMinutes(asOf);
  if (minutes === null) return "—";
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return `${Math.floor(days / 30)}ヶ月前`;
}

/** JSTで "9/7 14:32"（日付だけのデータは "9/7"） */
export function formatAsOf(asOf: string | null | undefined): string {
  const date = toDate(asOf);
  if (!date) return "—";
  const dateOnly = typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

/** 「Yahoo Finance · 遅延 · 9/7 14:32」形式の1行表現 */
export function describeFreshness(freshness: DataFreshness): string {
  return [freshness.source, FRESHNESS_LABELS[freshness.level], formatAsOf(freshness.asOf)]
    .filter(Boolean)
    .join(" · ");
}
