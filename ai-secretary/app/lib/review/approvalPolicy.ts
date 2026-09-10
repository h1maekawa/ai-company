/**
 * フェーズ単位の承認要否 — 要件10
 *
 * 全フェーズを一律で人間承認にすると全自動が成立しないため、
 * 工程ごとに「自動承認」「要人間承認」を選べるようにする。
 *
 * 自動承認が発火する条件（要件10の定義そのまま）:
 *   その工程が "auto" に設定されている
 *   かつ 自動テスト（要件9）を全て通過している
 *
 * ここで意図的に厳しくしている点:
 *   QaReport が無い（検査対象外・実行失敗）項目は自動承認しない。
 *   「テストが落ちていない」と「テストを通過した」は別物で、
 *   前者を自動承認の根拠にすると、検査の無い項目が素通りしてしまう。
 *   要件10の条件も「自動テストを全て通過した場合のみ」であり、それに合わせている。
 */

import type { QaReport } from "../qa/types";
import { REVIEW_PHASE_ORDER, type ReviewItem, type ReviewPhase } from "./types";

export type ApprovalMode = "auto" | "human";

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  auto: "自動承認",
  human: "要人間承認",
};

export type ApprovalPolicy = Record<ReviewPhase, ApprovalMode>;

/**
 * 既定値。全工程で自動承認。
 * 素通りを防ぐのはこの設定ではなく、下の canAutoApprove の
 * 「自動テストを通過していること」という条件が担う。
 */
export function defaultApprovalPolicy(): ApprovalPolicy {
  return {
    research: "auto",
    writing: "auto",
    seo: "auto",
    publish: "auto",
  };
}

/** 保存値が壊れていても既定へ倒す（未知のキー・値は捨てる） */
export function normalizeApprovalPolicy(value: unknown): ApprovalPolicy {
  const policy = defaultApprovalPolicy();
  if (!value || typeof value !== "object") return policy;
  const source = value as Record<string, unknown>;
  for (const phase of REVIEW_PHASE_ORDER) {
    const mode = source[phase];
    if (mode === "auto" || mode === "human") policy[phase] = mode;
  }
  return policy;
}

export type AutoApprovalVerdict =
  | { approve: true }
  | { approve: false; reason: string };

/**
 * この項目を自動承認してよいか。
 * 承認しない場合は理由を返し、そのまま人間承認へフォールバックする。
 */
export function canAutoApprove(
  item: Pick<ReviewItem, "phase" | "qa">,
  policy: ApprovalPolicy
): AutoApprovalVerdict {
  if (policy[item.phase] !== "auto") {
    return { approve: false, reason: "この工程は要人間承認に設定されています" };
  }

  const qa: QaReport | null = item.qa;
  if (!qa) {
    return {
      approve: false,
      reason: "自動テストの結果がないため自動承認できません",
    };
  }
  if (!qa.passed) {
    const failed = qa.checks
      .filter((c) => c.severity === "blocking" && c.status === "fail")
      .map((c) => c.label);
    return { approve: false, reason: `自動テスト未通過: ${failed.join(" / ")}` };
  }
  if (qa.skipped > 0) {
    // データ不足で検査できなかったものが残っている状態は「全て通過」ではない
    const skipped = qa.checks.filter((c) => c.status === "skipped").map((c) => c.label);
    return { approve: false, reason: `未検証の項目があります: ${skipped.join(" / ")}` };
  }

  return { approve: true };
}
