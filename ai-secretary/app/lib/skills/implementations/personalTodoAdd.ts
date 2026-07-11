import { SkillImplementationOutput } from "./personalCapture";

export type PersonalTodoAddInput = {
  task?: string;
  priority?: "high" | "normal" | "low";
  dueDate?: string;
  memo?: string;
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "high",
  normal: "normal",
  low: "low",
};

/**
 * personal-todo-add — cc-secretaryの「タスク追加 [内容]」を参考にした
 * TODO行整形Skill。今日のTODOファイルへの追記自体はこのPhaseでは行わない。
 */
export function runPersonalTodoAdd(input: Record<string, unknown>): SkillImplementationOutput {
  const { task, priority, dueDate, memo } = input as PersonalTodoAddInput;
  const warnings: string[] = [];

  const safeTask = typeof task === "string" && task.trim() ? task.trim() : "";
  if (!safeTask) {
    warnings.push("task が空です。タスク内容なしの行を生成しました。");
  }

  const safePriority = priority && PRIORITY_LABEL[priority] ? PRIORITY_LABEL[priority] : "normal";
  const safeDue = typeof dueDate === "string" && dueDate.trim() ? dueDate.trim() : "-";
  const safeMemo = typeof memo === "string" && memo.trim() ? memo.trim() : "-";

  const markdown = `- [ ] ${safeTask || "(未入力)"}
  - Priority: ${safePriority}
  - Due: ${safeDue}
  - Memo: ${safeMemo}
`;

  return {
    markdown,
    output: { task: safeTask, priority: safePriority, dueDate: safeDue, memo: safeMemo },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
