import type { KakeiCategoryBreakdown, KakeiSummary } from "./types";

/**
 * 家計簿アプリの月次集計スナップショットの書式。
 *
 * 正は常にあちら側。ここに置くのは (1) Slack日次が集計APIに依存せず動くこと
 * (2) 家計秘書が prompt から今月の数字を読めること、の2つのため。
 * したがって人が読める形（frontmatterの数値＋箇条書き＋内訳表）で書く。
 *
 * Vault I/O は snapshot.ts 側。ここは純関数だけに保ち、単体でテストする。
 */

const DIR = "memory/personal/kakei";
export const snapshotPath = (month: string) => `${DIR}/${month}.md`;

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function field(content: string, key: string): number | null {
  const m = content.match(new RegExp(`^${key}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`, "m"));
  return m ? Number(m[1]) : null;
}

function text(content: string, key: string): string {
  const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : "";
}

function parseCategories(content: string): KakeiCategoryBreakdown[] {
  const rows: KakeiCategoryBreakdown[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("category") || /^\|[-:\s|]+\|$/.test(line.trim())) continue;
    const c = line.split("|").map((s) => s.trim());
    if (c.length < 5 || !c[1]) continue;
    rows.push({
      category: c[1],
      amount: Number(c[2]) || 0,
      count: Number(c[3]) || 0,
      average: Number(c[4]) || 0,
    });
  }
  return rows;
}

export function serializeSnapshot(s: KakeiSummary): string {
  const table = s.byCategory
    .map((c) => `| ${c.category} | ${c.amount} | ${c.count} | ${c.average} |`)
    .join("\n");

  const lines = [
    `- 今月あと使える: ${yen(s.variable.remaining)}（1日あたり ${yen(s.variable.dailyAllowance)} / 残り${s.variable.daysLeft}日）`,
    `- 変動費: ${yen(s.variable.spent)} / 予算 ${yen(s.variable.budget)}（ペース ${s.variable.pace}、1.0超で使いすぎ）`,
    `- 固定費: ${yen(s.fixed.effective)}（未払い ${yen(s.fixed.unpaid)}）`,
    `- 収入: 予定 ${yen(s.income.planned)} / 確定 ${yen(s.income.actual)}`,
    `- 支出合計: ${yen(s.totalSpent)}`,
    s.needsReview.count > 0
      ? `- 要確認: ${s.needsReview.count}件（修正は家計簿アプリで行う: ${s.appUrl}）`
      : `- 要確認: なし`,
  ].join("\n");

  return [
    "---",
    `month: ${s.month}`,
    `synced_at: ${s.syncedAt}`,
    `currency: ${s.currency}`,
    `total_spent: ${s.totalSpent}`,
    `income_planned: ${s.income.planned}`,
    `income_actual: ${s.income.actual}`,
    `fixed_effective: ${s.fixed.effective}`,
    `fixed_unpaid: ${s.fixed.unpaid}`,
    `variable_budget: ${s.variable.budget}`,
    `variable_spent: ${s.variable.spent}`,
    `variable_remaining: ${s.variable.remaining}`,
    `daily_allowance: ${s.variable.dailyAllowance}`,
    `days_left: ${s.variable.daysLeft}`,
    `pace: ${s.variable.pace}`,
    `needs_review_count: ${s.needsReview.count}`,
    `app_url: ${s.appUrl}`,
    "---",
    "",
    `# ${s.month} の家計`,
    "",
    "家計簿アプリ（household-finance）の集計をそのまま写したもの。",
    "分類の修正はこのファイルではなく家計簿アプリ側で行う。",
    "",
    lines,
    "",
    "## 変動費のカテゴリ内訳",
    "",
    "| category | amount | count | average |",
    "|---|---:|---:|---:|",
    table,
    "",
  ].join("\n");
}

export function parseSnapshot(content: string): KakeiSummary | null {
  const month = text(content, "month");
  if (!month) return null;
  const n = (key: string) => field(content, key) ?? 0;

  return {
    month,
    syncedAt: text(content, "synced_at"),
    currency: text(content, "currency") || "JPY",
    totalSpent: n("total_spent"),
    income: { planned: n("income_planned"), actual: n("income_actual") },
    fixed: { effective: n("fixed_effective"), unpaid: n("fixed_unpaid") },
    variable: {
      budget: n("variable_budget"),
      spent: n("variable_spent"),
      remaining: n("variable_remaining"),
      dailyAllowance: n("daily_allowance"),
      daysLeft: n("days_left"),
      pace: n("pace"),
    },
    byCategory: parseCategories(content),
    // 明細はキャッシュしない（件数と導線だけあれば /kakei は成立する）
    needsReview: { count: n("needs_review_count"), items: [] },
    appUrl: text(content, "app_url"),
  };
}
