/**
 * 資産推移の履歴。
 *
 * 証券会社から過去の時系列は取れないため、ダッシュボードを開いた日の
 * 総評価額を1日1点だけ記録して積み上げる（実測値のみ・推定は入れない）。
 * 点が2つ未満の間、チャートは「蓄積中」を表示する。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import { ValuePoint } from "./types";

const HISTORY_PATH = "memory/personal/fund/value-history.md";
const MAX_POINTS = 1500; // 約4年分

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

ダッシュボードを開いた日の総評価額を1日1点だけ記録します（実測値のみ）。

- 記録期間: ${first?.date ?? "—"} 〜 ${latest?.date ?? "—"}
- 最新評価額: ${latest ? `¥${latest.totalValueJpy.toLocaleString("ja-JP")}` : "—"}
- 期間騰落: ${change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}

\`\`\`json
${JSON.stringify({ points }, null, 2)}
\`\`\`
`;
}

export async function loadHistory(): Promise<ValuePoint[]> {
  try {
    const file = await getVaultFile(HISTORY_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

/**
 * 今日の総評価額を記録する（同日に既に記録があれば上書き）。
 * 保存に失敗してもダッシュボード表示は止めない。
 */
export async function recordSnapshot(totalValueJpy: number | null): Promise<ValuePoint[]> {
  if (totalValueJpy === null || !Number.isFinite(totalValueJpy)) return loadHistory();

  const date = todayJst();
  let points: ValuePoint[] = [];
  let sha: string | undefined;

  try {
    const file = await getVaultFile(HISTORY_PATH);
    points = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  const rounded = Math.round(totalValueJpy);
  const existing = points.findIndex((p) => p.date === date);
  if (existing >= 0) {
    if (points[existing].totalValueJpy === rounded) return points; // 変化なしなら書き込まない
    points[existing] = { date, totalValueJpy: rounded };
  } else {
    points.push({ date, totalValueJpy: rounded });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  if (points.length > MAX_POINTS) points = points.slice(-MAX_POINTS);

  try {
    await saveVaultFile(HISTORY_PATH, buildMarkdown(points), sha);
  } catch (error) {
    console.error("[investing/history] 履歴の保存に失敗:", error);
  }
  return points;
}

/** 直近2点から本日の損益を算出する（点が足りなければ null） */
export function computeTodayChange(points: ValuePoint[]): {
  todayPnlJpy: number | null;
  todayPnlPct: number | null;
} {
  if (points.length < 2) return { todayPnlJpy: null, todayPnlPct: null };
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const diff = latest.totalValueJpy - previous.totalValueJpy;
  return {
    todayPnlJpy: diff,
    todayPnlPct: previous.totalValueJpy > 0 ? (diff / previous.totalValueJpy) * 100 : null,
  };
}
