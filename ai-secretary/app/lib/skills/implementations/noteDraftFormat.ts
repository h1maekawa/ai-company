import { SkillImplementationOutput } from "./personalCapture";

export type NoteDraftFormatInput = {
  title?: string;
  theme?: string;
  targetReader?: string;
  hook?: string;
  bodyMemo?: string;
  cta?: string;
  paidPartIdea?: string;
};

function orDash(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "-";
}

/**
 * note-draft-format — noteのアイデアや話した内容を、下書きとして扱いやすい
 * Markdown形式に整形するSkill。/api/note/generate（LLMによる本文自動生成）とは別物で、
 * こちらは構成メモ・ブリーフを整えるための軽量フォーマッタ。Memory保存は行わない。
 */
export function runNoteDraftFormat(input: Record<string, unknown>): SkillImplementationOutput {
  const { title, theme, targetReader, hook, bodyMemo, cta, paidPartIdea } =
    input as NoteDraftFormatInput;

  const warnings: string[] = [];
  if (!title || typeof title !== "string" || !title.trim()) {
    warnings.push("title が空です。");
  }

  const markdown = `# note下書き

## タイトル
${orDash(title)}

## テーマ
${orDash(theme)}

## 想定読者
${orDash(targetReader)}

## 冒頭フック
${orDash(hook)}

## 本文メモ
${orDash(bodyMemo)}

## CTA
${orDash(cta)}

## 有料パート案
${orDash(paidPartIdea)}

## 次に追記すること
-
`;

  return {
    markdown,
    output: {
      title: orDash(title),
      theme: orDash(theme),
      targetReader: orDash(targetReader),
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
