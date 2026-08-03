/**
 * 調査結果の抽象化。
 *
 * ここがコピー防止の要になる。
 * 他者の本文をそのまま生成プロンプトへ渡さず、
 * 「なぜ反応された可能性があるか」の型だけを取り出して保存する。
 *
 * AIが失敗しても、決定的なフォールバックで型を埋めるので
 * リサーチ全体は止まらない。
 */

import { callAI } from "../../ai/client";
import { ResearchItem } from "./types";

const PROMPT = `あなたはコンテンツ編集者です。
与えられた「他者の投稿・記事のタイトルと抜粋」を分析し、
**文章を書き写すのではなく、型だけ**を抽出してください。

# 厳守
- 元の文章をそのまま引用しない。言い換えた文章も作らない
- 抽出するのは「構造」「切り口」だけ
- 事実として確認できない数字・成果を書かない
- 分からない項目は空文字にする

# 出力（JSONのみ）
{
  "items": [
    {
      "id": "入力のidをそのまま",
      "hookPattern": "冒頭の型（例：失敗談から入る／数字で提示する／問いかけで始める）",
      "structurePattern": "全体構成の型（例：問題→試したこと→手順→まとめ）",
      "emotionalAngle": "読者が感じる感情（例：安心・焦り・共感・好奇心）",
      "readerProblem": "この投稿が解いている読者の悩み",
      "ctaPattern": "最後の誘導の型（例：保存を促す／記事へ誘導／質問で締める）",
      "whyItWorked": "反応された可能性の仮説（断定しない）"
    }
  ]
}`;

/** AIが使えない/失敗したときの、決定的な型推定 */
function fallbackPattern(item: ResearchItem): Partial<ResearchItem> {
  const text = `${item.title ?? ""} ${item.textExcerpt}`;
  const hook = /^\d|[0-9]+[つ選個]/.test(text)
    ? "数字で提示する"
    : /[?？]/.test(text)
      ? "問いかけで始める"
      : /失敗|やめた|続かなかった/.test(text)
        ? "失敗談から入る"
        : "結論から提示する";
  return {
    hookPattern: hook,
    structurePattern: "（未分析）",
    emotionalAngle: "（未分析）",
    readerProblem: "（未分析）",
    ctaPattern: "（未分析）",
  };
}

type AbstractRow = {
  id?: string;
  hookPattern?: string;
  structurePattern?: string;
  emotionalAngle?: string;
  readerProblem?: string;
  ctaPattern?: string;
  whyItWorked?: string;
};

/**
 * ResearchItem に型情報を付与する。
 * 入力の本文はここで捨て、以後は型だけを使う。
 */
export async function abstractItems(
  items: ResearchItem[],
  options?: { useAI?: boolean }
): Promise<ResearchItem[]> {
  if (items.length === 0) return items;
  if (options?.useAI === false) {
    return items.map((item) => ({ ...item, ...fallbackPattern(item) }));
  }

  // 一度に投げすぎない
  const batch = items.slice(0, 25);
  const message = JSON.stringify(
    batch.map((i) => ({
      id: i.id,
      title: i.title ?? "",
      excerpt: i.textExcerpt.slice(0, 180),
      metrics: i.publicMetrics ?? {},
    })),
    null,
    1
  );

  let rows: AbstractRow[] = [];
  try {
    const response = await callAI(message, PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      rows = (JSON.parse(match[0]) as { items?: AbstractRow[] }).items ?? [];
    }
  } catch (error) {
    console.warn("[note/research] 型の抽出に失敗、フォールバックを使います:", error);
  }

  const byId = new Map(rows.filter((r) => r.id).map((r) => [String(r.id), r]));

  return items.map((item) => {
    const row = byId.get(item.id);
    if (!row) return { ...item, ...fallbackPattern(item) };
    return {
      ...item,
      hookPattern: row.hookPattern || fallbackPattern(item).hookPattern,
      structurePattern: row.structurePattern || "（未分析）",
      emotionalAngle: row.emotionalAngle || "（未分析）",
      readerProblem: row.readerProblem || "（未分析）",
      ctaPattern: row.ctaPattern || "（未分析）",
    };
  });
}
