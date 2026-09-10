/**
 * 差し戻し・承認の記録 — 要件2「差し戻し時は理由をエージェントにフィードバックできる」
 *
 * ここに溜まる ReviewFeedback が、
 *   - 要件4（ブランドDNA学習）の教師データ
 *   - 要件10（自動承認の監査ログ）
 * の両方になる。自動承認で通過したものも必ず記録し、後から人が確認・差し戻せるようにする。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import type { ReviewFeedback } from "./types";

const FEEDBACK_PATH = "memory/personal/note/review-feedback.md";
/** 保持件数の上限。古いものから落とす */
const MAX_ENTRIES = 500;

function extractJson(markdown: string): ReviewFeedback[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { feedback?: ReviewFeedback[] };
    return Array.isArray(parsed.feedback) ? parsed.feedback : [];
  } catch {
    return [];
  }
}

function buildMarkdown(feedback: ReviewFeedback[]): string {
  const rejections = feedback.filter((f) => f.decision === "reject");
  const edits = feedback.filter((f) => f.decision === "edit_approve");
  const auto = feedback.filter((f) => f.decidedBy === "auto");

  const recentRejections = rejections
    .slice(-10)
    .reverse()
    .map((f) => `- [${f.kind}] ${f.reason}`)
    .join("\n");

  return `---
type: review_feedback
entries: ${feedback.length}
updated: ${new Date().toISOString()}
---

# 承認フィードの判断記録

承認・差し戻し・編集して承認の履歴です。
差し戻し理由と本人の編集内容は、次の生成へのフィードバックとして使います。

- 総件数: ${feedback.length}
- 差し戻し: ${rejections.length}件
- 編集して承認: ${edits.length}件
- 自動承認: ${auto.length}件

## 直近の差し戻し理由

${recentRejections || "（まだありません）"}

\`\`\`json
${JSON.stringify({ feedback }, null, 2)}
\`\`\`
`;
}

export async function loadReviewFeedback(): Promise<ReviewFeedback[]> {
  try {
    const file = await getVaultFile(FEEDBACK_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

/** 1件追記する。保存に失敗しても承認処理自体は止めない */
export async function appendReviewFeedback(entry: ReviewFeedback): Promise<void> {
  let feedback: ReviewFeedback[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(FEEDBACK_PATH);
    feedback = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  feedback.push(entry);
  if (feedback.length > MAX_ENTRIES) feedback = feedback.slice(-MAX_ENTRIES);

  try {
    await saveVaultFile(FEEDBACK_PATH, buildMarkdown(feedback), sha);
  } catch (error) {
    console.error("[review/feedback] 保存に失敗:", error);
  }
}

/**
 * 生成プロンプトへ差し込む「避けるべきこと」を、差し戻し理由から組み立てる。
 * 要件4（ブランドDNA学習）がここを読む想定。
 */
export function rejectionGuidance(feedback: ReviewFeedback[], limit = 8): string[] {
  return [
    ...new Set(
      feedback
        .filter((f) => f.decision === "reject" && f.reason.trim())
        .map((f) => f.reason.trim())
    ),
  ]
    .slice(-limit)
    .reverse();
}
