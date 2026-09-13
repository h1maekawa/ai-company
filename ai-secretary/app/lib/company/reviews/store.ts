/**
 * レビューの保存 — Phase 4 §26
 *
 * Phase 3 の patterns / organization-proposals とは分離する。
 * 同じ場所へ混ぜると、「観測」と「経営レビュー」が区別できなくなる。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { DailyReview, MonthlyReview, WeeklyReview } from "./reviews";

const ROOT = "memory/company-review";

type AnyReview = DailyReview | WeeklyReview | MonthlyReview;

function pathFor(review: AnyReview): string {
  if (review.period === "monthly") return `${ROOT}/monthly/${review.date.slice(0, 7)}.md`;
  if (review.period === "weekly") return `${ROOT}/weekly/${review.date}.md`;
  return `${ROOT}/daily/${review.date}.md`;
}

const yen = (value: number | null): string =>
  value === null ? "未設定" : `¥${Math.round(value).toLocaleString("ja-JP")}`;

/** 表示の原則: 0円と未設定を混同しない（§30） */
function summaryLines(review: AnyReview): string[] {
  const f = review.metrics.financial;
  return [
    `- 収益レベル: ${review.level.label}（${review.level.description}）`,
    `- AI経由の収益: ${yen(f.aiGeneratedRevenueYen.value)}`,
    `- 純資産: ${yen(f.netWorthYen.value)}`,
    `- Company Health: ${review.companyHealth.score}（カバレッジ ${review.companyHealth.coveragePct}% / ${review.companyHealth.status}）`,
    `- FIRE進捗: ${
      review.fire.status === "NOT_CONFIGURED"
        ? "未設定"
        : `${Math.round((review.fire.progress.value ?? 0) * 100)}%`
    }`,
  ];
}

export async function saveReview(review: AnyReview): Promise<void> {
  const path = pathFor(review);
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }

  const markdown = `---
type: personal_company_review
period: ${review.period}
date: ${review.date}
health: ${review.companyHealth.score}
---

# ${review.period === "daily" ? "デイリー" : review.period === "weekly" ? "ウィークリー" : "マンスリー"}レビュー ${review.date}

${summaryLines(review).join("\n")}

\`\`\`json
${JSON.stringify(review, null, 2)}
\`\`\`
`;

  try {
    await saveVaultFile(path, markdown, sha);
  } catch (error) {
    console.error("[company/reviews] レビューの保存に失敗:", error);
  }
}

export async function loadReview(
  period: AnyReview["period"],
  key: string
): Promise<AnyReview | null> {
  const path =
    period === "monthly"
      ? `${ROOT}/monthly/${key}.md`
      : period === "weekly"
        ? `${ROOT}/weekly/${key}.md`
        : `${ROOT}/daily/${key}.md`;
  try {
    const file = await getVaultFile(path);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    return match ? (JSON.parse(match[1]) as AnyReview) : null;
  } catch {
    return null;
  }
}
