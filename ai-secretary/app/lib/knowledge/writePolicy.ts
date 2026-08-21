/**
 * Vault 書き込み安全ポリシー（ADR-F, docs/14, Phase4修正3）。
 *
 * ルール（コード側で強制。Confirmation UI に依存しない）:
 *  1. AI による自動 create / overwrite は **AI Managed 領域のみ**。
 *  2. AI Managed 領域外（Human Managed）への新規作成・更新も、自動では禁止。
 *  3. managed_by: human の既存ファイルは、たとえ AI Managed パスでも自動書き込み禁止。
 *  4. Human Managed への書き込みは「Explicit Approved Write」経路のみ許可
 *     （AI Proposal → Diff → Human Approval → Apply。promote/merge がこれに当たる）。
 *
 * 破壊的操作（delete/move/rename）は vault.ts に存在しない（＝構造的に不可）。
 */

import type { ManagedBy } from "./types";
import { isValidApprovalGrant } from "./approval";

/**
 * AI が自動で書き込んでよい path プレフィックス（AI Managed 作業領域のみ）。
 * ※ memory/knowledge/ は **含めない**（正式Knowledge = Human Managed、promote 経由でのみ作成）。
 */
export const AI_MANAGED_PREFIXES = [
  "memory/personal/inbox/",
  "memory/personal/note/drafts/",
  "memory/personal/grilling/", // Grilling working state
  "memory/personal/summaries/", // temporary summaries
  "memory/personal/candidates/", // promotion candidates（別置きする場合）
  "memory/chat-log/",
  "memory/kaizen/",
] as const;

/** 明示的に Human Managed（AIの自動書き込み禁止）な既知 path。 */
export const HUMAN_MANAGED_PATHS = [
  "memory/personal/profile.md",
  "memory/personal/goals.md",
  "memory/personal/rules.md",
  "memory/shared/ai-development-rules.md",
] as const;

export function isAiManagedPath(path: string): boolean {
  const clean = path.replace(/^\/+/, "");
  if ((HUMAN_MANAGED_PATHS as readonly string[]).includes(clean)) return false;
  return AI_MANAGED_PREFIXES.some((p) => clean.startsWith(p));
}

/** frontmatter の managed_by を読む（無ければ null）。 */
export function readManagedBy(content: string): ManagedBy | null {
  const m = content.match(/^\s*managed_by:\s*(ai|human)\s*$/im);
  if (!m) return null;
  return m[1].toLowerCase() === "ai" ? "ai" : "human";
}

/**
 * ファイルの所有権を判定する（ADR-F 既定: 不明は human）。
 * frontmatter を最優先し、無ければ path で判定（AI Managed 領域なら ai、それ以外は human）。
 */
export function classifyOwnership(path: string, existingContent?: string): ManagedBy {
  if (existingContent && existingContent.trim()) {
    const declared = readManagedBy(existingContent);
    if (declared) return declared;
  }
  return isAiManagedPath(path) ? "ai" : "human";
}

export type WriteDecision = { allowed: boolean; ownership: ManagedBy; reason: string };

/**
 * AI が自動で（承認フローなしで）create/overwrite してよいか（Phase4修正3）。
 *
 * - managed_by: human の既存ファイル → 常に拒否
 * - AI Managed 領域（かつ human でない）→ 許可（新規/更新とも）
 * - それ以外（Human Managed 領域。新規作成含む）→ 拒否
 */
export function canAiAutoWrite(path: string, existingContent?: string): WriteDecision {
  const declared = existingContent ? readManagedBy(existingContent) : null;
  if (declared === "human") {
    return {
      allowed: false,
      ownership: "human",
      reason:
        "managed_by: human のファイルは AI が自動編集できません（Approved Write 経路が必要）。",
    };
  }

  if (isAiManagedPath(path)) {
    return { allowed: true, ownership: "ai", reason: "AI Managed 領域への書き込み" };
  }

  return {
    allowed: false,
    ownership: "human",
    reason:
      "AI Managed 領域外への自動 create/overwrite は禁止です（Human Managed。Approved Write 経路が必要）。",
  };
}

/**
 * Human Approval 済みの明示的書き込み（promote/merge/human_edit）。
 * canAiAutoWrite を迂回してよい唯一の経路。
 *
 * Phase4 修正1: boolean フラグではなく **ApprovalGrant オブジェクト** を要求する。
 * grant はサーバー内部でしか発行できず、HTTPリクエストのJSONからは偽造不可能。
 * これにより「外部入力で approved:true を渡して Human Managed 領域を書き換える」経路を
 * コード上で塞ぐ。
 */
export function canWrite(
  path: string,
  existingContent: string | undefined,
  grant?: unknown
): WriteDecision {
  if (isValidApprovalGrant(grant)) {
    return {
      allowed: true,
      ownership: classifyOwnership(path, existingContent),
      reason: `Explicit Approved Write (${grant.reason})`,
    };
  }
  return canAiAutoWrite(path, existingContent);
}

/** canAiAutoWrite が false のとき throw するヘルパー（自動経路用）。 */
export function assertAiAutoWritable(path: string, existingContent?: string): void {
  const d = canAiAutoWrite(path, existingContent);
  if (!d.allowed) {
    throw new Error(`[writePolicy] 自動書き込み拒否: ${path} — ${d.reason}`);
  }
}
