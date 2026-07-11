import { todayJstDateString } from "./dateUtil";

export type PersonalCaptureInput = {
  content?: string;
  source?: string;
  tags?: string[];
};

export type SkillImplementationOutput = {
  markdown: string;
  output?: Record<string, unknown>;
  warnings?: string[];
};

/**
 * personal-capture — cc-secretaryの「メモ [内容] / capture [text]」を参考にした
 * Inboxキャプチャ整形Skill。Memoryへの保存はこのPhaseでは行わない（Markdownを返すだけ）。
 */
export function runPersonalCapture(input: Record<string, unknown>): SkillImplementationOutput {
  const { content, source, tags } = input as PersonalCaptureInput;
  const warnings: string[] = [];

  const safeContent = typeof content === "string" && content.trim() ? content.trim() : "";
  if (!safeContent) {
    warnings.push("content が空です。空のInbox Captureを生成しました。");
  }

  const safeSource = typeof source === "string" && source.trim() ? source.trim() : "unknown";
  const safeTags = Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && t.trim()) : [];

  const markdown = `# Inbox Capture

- Date: ${todayJstDateString()}
- Source: ${safeSource}
- Tags: ${safeTags.length > 0 ? safeTags.join(", ") : "-"}

## 内容
${safeContent || "-"}
`;

  return {
    markdown,
    output: { date: todayJstDateString(), source: safeSource, tags: safeTags },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
