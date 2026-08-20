/**
 * Shared Understanding の Quality Gate（Phase5.2）。
 *
 * 生成物をそのまま信用せず、コード側で最低限の欠落・捏造チェックを行う。
 * - 必須セクションの存在
 * - Major Decisions が空でない（空なら再生成に値する）
 * - ユーザーが決めていない事項をMajor Decisionとして捏造していないか（根拠照合）
 * - Rejected Alternatives がSession実データ由来か
 * - Implementation Scope / Acceptance Criteria が空なら警告
 */

import type { GrillSession, SharedUnderstanding } from "./types";

export interface SuGateResult {
  warnings: string[];
  /** 再生成する価値があるほど重大な欠落があるか（Retryは最大1回） */
  shouldRetry: boolean;
  unsupportedDecisions: number;
}

function normalize(t: string): string {
  return (t || "").toLowerCase().normalize("NFKC").replace(/[\s　]/g, "");
}

/** 決定が、実際に回答されたノード（title/answer）に根拠を持つかを緩く照合する。 */
function isSupported(decision: string, session: GrillSession): boolean {
  const d = normalize(decision);
  if (!d) return false;
  return session.designTree
    .filter((n) => n.status === "answered")
    .some((n) => {
      const title = normalize(n.title);
      const answer = normalize(n.answer ?? "");
      if (title && title.length >= 2 && d.includes(title)) return true;
      if (answer && answer.length >= 3 && (d.includes(answer) || answer.includes(d))) return true;
      // 部分一致（回答の先頭6文字）でも根拠ありとみなす
      if (answer.length >= 6 && d.includes(answer.slice(0, 6))) return true;
      return false;
    });
}

export function validateSharedUnderstanding(
  su: SharedUnderstanding | null | undefined,
  session: GrillSession,
  expectedRejectedCount: number
): SuGateResult {
  const warnings: string[] = [];
  if (!su) {
    return { warnings: ["Shared Understandingが生成されませんでした"], shouldRetry: true, unsupportedDecisions: 0 };
  }

  // 必須セクション
  const required: (keyof SharedUnderstanding)[] = [
    "summary",
    "majorDecisions",
    "rejectedAlternatives",
    "risks",
    "remainingAssumptions",
    "implementationScope",
  ];
  for (const key of required) {
    if (su[key] === undefined) warnings.push(`必須セクションが欠落: ${key}`);
  }

  const answeredCount = session.designTree.filter((n) => n.status === "answered").length;

  let shouldRetry = false;
  if (!su.summary || !su.summary.trim()) {
    warnings.push("summaryが空です");
    shouldRetry = true;
  }
  if (!Array.isArray(su.majorDecisions) || su.majorDecisions.length === 0) {
    if (answeredCount > 0) {
      warnings.push("回答があるのにMajor Decisionsが空です");
      shouldRetry = true;
    }
  }

  // 捏造チェック: 回答に根拠が見つからない決定
  let unsupportedDecisions = 0;
  for (const d of su.majorDecisions ?? []) {
    if (!isSupported(`${d.decision} ${d.reason ?? ""}`, session)) unsupportedDecisions++;
  }
  if (unsupportedDecisions > 0) {
    warnings.push(
      `回答に根拠が見つからないMajor Decisionが${unsupportedDecisions}件あります（未決事項はRemaining Assumptionsへ入れるべき）`
    );
  }

  // 却下案はSession実データ由来であること
  if ((su.rejectedAlternatives?.length ?? 0) !== expectedRejectedCount) {
    warnings.push(
      `Rejected AlternativesがSession実データと一致しません（期待${expectedRejectedCount}件 / 実際${su.rejectedAlternatives?.length ?? 0}件）`
    );
  }

  // 実装に使える品質かどうか
  if ((su.implementationScope?.length ?? 0) === 0) {
    warnings.push("Implementation Scopeが空です（そのまま実装指示に使えません）");
  }
  if ((su.acceptanceCriteria?.length ?? 0) === 0) {
    warnings.push("Acceptance Criteriaが空です（完了判定ができません）");
  }

  return { warnings, shouldRetry, unsupportedDecisions };
}
