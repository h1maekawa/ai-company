/**
 * Merge の Diff / Preview（Phase4 修正2）。
 *
 * Merge は Human Managed の既存 Knowledge を書き換えるため、
 *   Candidate → 対象選択 → 既存+追加予定の Diff 提示 → ユーザー承認 → Approved Write
 * を必須にする。ボタン1回で即追記はしない。
 *
 * 承認の担保: preview 時に「統合後の全文」のハッシュ(previewToken)を返し、
 * merge 実行時に同じトークンを要求する。サーバー側で再計算して一致を検証するので、
 * ユーザーが見た内容と実際に書き込まれる内容が一致することを保証できる
 * （対象ファイルが変わっていればトークンが不一致になり、再Previewが必要になる）。
 */

import { createHash } from "crypto";

export interface DiffLine {
  type: "context" | "added";
  text: string;
}

export interface MergePreview {
  targetPath: string;
  candidatePath: string;
  /** 統合前の既存Knowledge全文 */
  currentContent: string;
  /** 統合後の全文（実際に書き込まれる内容） */
  proposedContent: string;
  /** 追記される差分ブロック */
  addedBlock: string;
  /** 表示用の簡易diff（末尾の文脈 + 追加行） */
  diff: DiffLine[];
  /** merge実行時に必須。proposedContent のハッシュ。 */
  previewToken: string;
}

/** 統合時に追記されるブロックを組み立てる（preview と実行で必ず同じ関数を使う）。 */
export function buildMergeBlock(captureId: string, dateIso: string, body: string): string {
  return `## 統合メモ（${dateIso} / ${captureId}）\n\n${body.trim()}\n`;
}

export function buildProposedContent(currentContent: string, block: string): string {
  return `${currentContent.trimEnd()}\n\n${block}`;
}

export function computePreviewToken(proposedContent: string): string {
  return createHash("sha256").update(proposedContent, "utf8").digest("hex").slice(0, 32);
}

/** 表示用の簡易diff（既存の末尾数行 + 追加行）。 */
export function buildDiffLines(currentContent: string, addedBlock: string): DiffLine[] {
  const tailContext = currentContent.trimEnd().split("\n").slice(-5);
  const lines: DiffLine[] = tailContext.map((text) => ({ type: "context" as const, text }));
  lines.push({ type: "added", text: "" });
  for (const text of addedBlock.split("\n")) {
    lines.push({ type: "added", text });
  }
  return lines;
}
