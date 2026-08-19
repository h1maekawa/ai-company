/**
 * Vault 書き込み安全ポリシー（ADR-F, docs/14）。
 *
 * AI が自動書き込みできるのは AI Managed 領域のみ。Human Managed の既存 Markdown に対し、
 * AI は自動 overwrite / delete / rename / move を行わない。
 * Confirmation UI だけに依存せず、この関数群で「コード側で」ポリシーを強制する。
 *
 * 破壊的操作（delete/move/rename）は vault.ts に存在しないため、ここでは
 * 「自動書き込み(create/overwrite)して良いか」だけを判定する。
 */

import type { ManagedBy } from "./types";

/**
 * AI が自動で書き込んでよい path プレフィックス（AI Managed 領域）。
 * 末尾 "/" のものはディレクトリ配下すべて。
 */
export const AI_MANAGED_PREFIXES = [
  "memory/personal/inbox/",
  "memory/personal/note/drafts/",
  "memory/personal/grilling/", // Grilling working state（将来）
  "memory/personal/summaries/", // temporary summaries（将来）
  "memory/personal/candidates/", // promotion candidates（将来）
  "memory/chat-log/",
  "memory/kaizen/",
  "memory/knowledge/", // Knowledge は AI が生成する（作成は可・既存の human 上書きは別途ガード）
] as const;

/**
 * 明示的に Human Managed（AIの自動上書き禁止）な既知 path。
 * これらは AI_MANAGED プレフィックスに一致しても Human 扱いを優先する。
 */
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

/**
 * frontmatter の managed_by を読む（無ければ null）。
 */
export function readManagedBy(content: string): ManagedBy | null {
  const m = content.match(/^\s*managed_by:\s*(ai|human)\s*$/im);
  if (!m) return null;
  return m[1].toLowerCase() === "ai" ? "ai" : "human";
}

/**
 * ファイルの所有権を判定する（ADR-F 既定: 不明は human）。
 * @param existingContent 既存ファイル本文（新規作成なら undefined/空）
 */
export function classifyOwnership(path: string, existingContent?: string): ManagedBy {
  if (existingContent && existingContent.trim()) {
    const declared = readManagedBy(existingContent);
    if (declared) return declared; // frontmatter を最優先
  }
  // frontmatter が無い場合は path で判定。AI管理領域なら ai、それ以外は human（既定）。
  return isAiManagedPath(path) ? "ai" : "human";
}

export type WriteDecision = { allowed: boolean; ownership: ManagedBy; reason: string };

/**
 * AI が自動で（承認フローなしで）このファイルを create/overwrite してよいか。
 *
 * - 新規作成 or AI Managed 領域 → 許可
 * - 既存の Human Managed ファイルの上書き → 拒否（AI Proposal → Diff → Human Approval → Apply が必要）
 */
export function canAiAutoWrite(path: string, existingContent?: string): WriteDecision {
  const hasExisting = Boolean(existingContent && existingContent.trim());
  const ownership = classifyOwnership(path, existingContent);

  if (!hasExisting) {
    // 新規作成: AI管理領域なら無条件OK。それ以外でも「新規作成」は破壊ではないので許可するが、
    // human 既定領域への新規作成は呼び出し側が意図しているはずなので ownership を返して委ねる。
    return {
      allowed: true,
      ownership,
      reason: isAiManagedPath(path)
        ? "AI Managed 領域への新規作成"
        : "新規作成（既存ファイルの破壊なし）",
    };
  }

  // 既存あり
  if (ownership === "ai") {
    return { allowed: true, ownership, reason: "AI Managed ファイルの更新" };
  }

  return {
    allowed: false,
    ownership,
    reason:
      "Human Managed の既存ファイルは AI が自動上書きできません（AI Proposal → Diff → Human Approval → Apply が必要）。",
  };
}

/** canAiAutoWrite が false のとき throw するヘルパー。 */
export function assertAiAutoWritable(path: string, existingContent?: string): void {
  const d = canAiAutoWrite(path, existingContent);
  if (!d.allowed) {
    throw new Error(`[writePolicy] 書き込み拒否: ${path} — ${d.reason}`);
  }
}
