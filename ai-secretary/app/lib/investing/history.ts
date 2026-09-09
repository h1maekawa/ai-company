/**
 * 資産推移の履歴。
 *
 * 証券会社から過去の時系列は取れないため、こちらで実測した総評価額だけを積み上げる。
 *
 * 記録の粒度（TASK-F3）:
 *   - ダッシュボード表示時 … 1日1点（同日は上書き）
 *   - 市場時間中のcron    … 日中スナップショットを追記して推移を滑らかにする
 *   古い日付の日中点は「その日の最終点」だけに間引き、ファイルの肥大を防ぐ。
 * 点が2つ未満の間、チャートは「蓄積中」を表示する。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import { ValuePoint } from "./types";

const HISTORY_PATH = "memory/personal/fund/value-history.md";
const MAX_POINTS = 4000;
/** 日中点をそのまま残す日数（これより古い日は日次1点へ間引く） */
const INTRADAY_RETENTION_DAYS = 30;
/** 日中スナップショットの最小間隔（これ未満の連投は無視する） */
const MIN_INTRADAY_GAP_MS = 20 * 60 * 1000;

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 並び替え・比較用のキー（at があればそれを、無ければ日付の末尾扱い） */
function sortKey(point: ValuePoint): string {
  return point.at ?? `${point.date}T23:59:59.999Z`;
}

function extractJson(markdown: string): ValuePoint[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { points?: ValuePoint[] };
    return Array.isArray(parsed.points) ? parsed.points : [];
  } catch {
    return [];
  }
}

function buildMarkdown(points: ValuePoint[]): string {
  const latest = points[points.length - 1];
  const first = points[0];
  const change =
    first && latest && first.totalValueJpy > 0
      ? ((latest.totalValueJpy - first.totalValueJpy) / first.totalValueJpy) * 100
      : null;

  return `---
type: fund_value_history
points: ${points.length}
updated: ${todayJst()}
---

# 資産推移の記録

実測した総評価額のみを記録します（推定値は入れない）。
直近${INTRADAY_RETENTION_DAYS}日は日中スナップショットを含み、それ以前は1日1点へ間引かれます。

- 記録期間: ${first?.date ?? "—"} 〜 ${latest?.date ?? "—"}
- 最新評価額: ${latest ? `¥${latest.totalValueJpy.toLocaleString("ja-JP")}` : "—"}
- 期間騰落: ${change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}

\`\`\`json
${JSON.stringify({ points }, null, 2)}
\`\`\`
`;
}

/** 古い日付の日中点をその日の最終点だけに間引き、総点数も上限で切る */
function compact(points: ValuePoint[]): ValuePoint[] {
  const sorted = [...points].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INTRADAY_RETENTION_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const kept: ValuePoint[] = [];
  for (const point of sorted) {
    const previous = kept[kept.length - 1];
    if (previous && previous.date === point.date && point.date < cutoffDate) {
      kept[kept.length - 1] = point; // 古い日は最終点で置き換える
      continue;
    }
    kept.push(point);
  }

  return kept.length > MAX_POINTS ? kept.slice(-MAX_POINTS) : kept;
}

export async function loadHistory(): Promise<ValuePoint[]> {
  try {
    const file = await getVaultFile(HISTORY_PATH);
    return compact(extractJson(file.content || ""));
  } catch {
    return [];
  }
}

/**
 * 総評価額を記録する。保存に失敗してもダッシュボード表示は止めない。
 *
 * @param options.intraday true なら当日の点を上書きせず追記する（市場時間中のcron用）。
 *   直近点から MIN_INTRADAY_GAP_MS 経っていなければ書き込まない。
 */
export async function recordSnapshot(
  totalValueJpy: number | null,
  options: { intraday?: boolean } = {}
): Promise<ValuePoint[]> {
  if (totalValueJpy === null || !Number.isFinite(totalValueJpy)) return loadHistory();

  const date = todayJst();
  const now = new Date().toISOString();
  let points: ValuePoint[] = [];
  let sha: string | undefined;

  try {
    const file = await getVaultFile(HISTORY_PATH);
    points = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  points.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const rounded = Math.round(totalValueJpy);
  const last = points[points.length - 1];

  if (options.intraday) {
    // 値が動いていない、または間隔が短すぎるなら書き込まない（SHA競合を減らす）
    if (last && last.totalValueJpy === rounded) return compact(points);
    if (last?.at && Date.now() - new Date(last.at).getTime() < MIN_INTRADAY_GAP_MS) {
      return compact(points);
    }
    points.push({ date, totalValueJpy: rounded, at: now });
  } else {
    // 表示由来の記録は1日1点（その日の代表値を上書き）
    const sameDay = points.map((p, i) => ({ p, i })).filter(({ p }) => p.date === date);
    const target = sameDay[sameDay.length - 1];
    if (target) {
      if (target.p.totalValueJpy === rounded) return compact(points); // 変化なしなら書き込まない
      points[target.i] = { ...target.p, totalValueJpy: rounded, at: now };
    } else {
      points.push({ date, totalValueJpy: rounded, at: now });
    }
  }

  const compacted = compact(points);

  try {
    await saveVaultFile(HISTORY_PATH, buildMarkdown(compacted), sha);
  } catch (error) {
    console.error("[investing/history] 履歴の保存に失敗:", error);
  }
  return compacted;
}

/**
 * 本日の損益を算出する。
 * 日中スナップショットが入ると「直近2点の差」＝当日の損益ではなくなるため、
 * 「最新点」と「前営業日の最終点」を比べる。
 */
export function computeTodayChange(points: ValuePoint[]): {
  todayPnlJpy: number | null;
  todayPnlPct: number | null;
} {
  if (points.length < 2) return { todayPnlJpy: null, todayPnlPct: null };

  const latest = points[points.length - 1];
  // 最新点より前の日の、最後の点（＝前営業日の終わり）
  const previous = [...points].reverse().find((p) => p.date < latest.date);
  const base = previous ?? points[points.length - 2];

  const diff = latest.totalValueJpy - base.totalValueJpy;
  return {
    todayPnlJpy: diff,
    todayPnlPct: base.totalValueJpy > 0 ? (diff / base.totalValueJpy) * 100 : null,
  };
}
