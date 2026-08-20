/**
 * Rejected Alternatives を **Session の実データから** 導出する。
 *
 * LLMの想像で「却下された案」を捏造しないための決定論的モジュール。
 * 取得元:
 *   1. 選択肢があるノードで、ユーザーが選ばなかった案（＝推奨しなかった案／明示的に選ばれなかった案）
 *   2. 修正Roundで撤回された旧決定（再Grillで上書きされた回答）
 *
 * reason は、ユーザーが理由を述べていない場合に「採用案との比較により不採用」と明示し、
 * ユーザーが言っていない理由を事実として書かない。
 */

import type { GrillNode, GrillSession } from "./types";

export interface RejectedAlternative {
  alternative: string;
  reason: string;
  /** どのように却下されたか（監査用） */
  source: "not_chosen" | "withdrawn";
  nodeId: string;
}

const COMPARED_REASON = "採用案との比較により不採用（ユーザーによる明示的な理由なし）";

function chosenLabel(node: GrillNode): string | undefined {
  const answer = (node.answer ?? "").trim();
  if (!answer) return undefined;
  const hit = node.options?.find((o) => o.label.trim() === answer);
  return hit?.label ?? answer;
}

/** 回答済みノードから、選ばれなかった選択肢を集める。 */
export function deriveRejectedAlternatives(session: GrillSession): RejectedAlternative[] {
  const out: RejectedAlternative[] = [];

  for (const node of session.designTree) {
    if (node.status !== "answered") continue;
    const chosen = chosenLabel(node);
    if (!chosen || !node.options || node.options.length === 0) continue;

    for (const opt of node.options) {
      if (opt.label.trim() === chosen.trim()) continue;
      out.push({
        alternative: `${node.title}: ${opt.label}`,
        reason: opt.description
          ? `${COMPARED_REASON}。この案の位置づけ: ${opt.description}`
          : COMPARED_REASON,
        source: "not_chosen",
        nodeId: node.id,
      });
    }
  }

  return out;
}

/**
 * 再Grillで撤回された旧決定を記録する。
 * applyAnswers は上書き時に旧値を保持しないため、撤回はここで明示的に作る。
 */
export function buildWithdrawnAlternative(
  node: GrillNode,
  previousAnswer: string
): RejectedAlternative {
  return {
    alternative: `${node.title}: ${previousAnswer}`,
    reason: "再Grillにより撤回された旧決定",
    source: "withdrawn",
    nodeId: node.id,
  };
}

/** LLMへ渡すためのテキスト化（捏造防止のため、ここで作った事実だけを渡す）。 */
export function rejectedToPromptBlock(items: RejectedAlternative[]): string {
  if (items.length === 0) return "（選ばれなかった案なし）";
  return items
    .slice(0, 20)
    .map((r) => `- ${r.alternative} … ${r.reason}`)
    .join("\n");
}
