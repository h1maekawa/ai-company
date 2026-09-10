/**
 * エージェントタスクの保存 — 要件1「チャット履歴はタスクログとして残す」
 *
 * どのチャット指示から何のタスクが生まれたかを辿れるようにする。
 * タスクは実行状況の記録であって、承認の対象ではない
 * （承認は生成物に対して行う。承認フィードは要件2側）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import { AGENT_ROLE_LABELS, type AgentTask } from "./types";

const TASKS_PATH = "memory/personal/note/agent-tasks.md";
/** 保持件数の上限。古いものから落とす */
const MAX_TASKS = 300;

function extractJson(markdown: string): AgentTask[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { tasks?: AgentTask[] };
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}

function buildMarkdown(tasks: AgentTask[]): string {
  const open = tasks.filter((t) => t.status === "queued" || t.status === "running");
  const recent = tasks
    .slice(-15)
    .reverse()
    .map(
      (t) =>
        `| ${t.createdAt.slice(0, 16).replace("T", " ")} | ${AGENT_ROLE_LABELS[t.role]} | ${t.status} | ${t.instruction.slice(0, 40)} |`
    )
    .join("\n");

  return `---
type: agent_tasks
tasks: ${tasks.length}
updated: ${new Date().toISOString()}
---

# エージェントのタスクログ

チャットでの指示が、どの担当のどのタスクになったかの記録です。

- 総件数: ${tasks.length}
- 未完了: ${open.length}件

## 直近のタスク

| 作成 | 担当 | 状態 | 指示 |
|---|---|---|---|
${recent || "| — | — | — | （まだありません） |"}

\`\`\`json
${JSON.stringify({ tasks }, null, 2)}
\`\`\`
`;
}

export async function loadAgentTasks(): Promise<AgentTask[]> {
  try {
    const file = await getVaultFile(TASKS_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

export async function saveAgentTasks(tasks: AgentTask[]): Promise<AgentTask[]> {
  const trimmed = tasks.length > MAX_TASKS ? tasks.slice(-MAX_TASKS) : tasks;
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(TASKS_PATH)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(TASKS_PATH, buildMarkdown(trimmed), sha);
  return trimmed;
}

/** 1件追記する。保存に失敗してもチャットの応答自体は止めない */
export async function appendAgentTask(task: AgentTask): Promise<void> {
  try {
    const tasks = await loadAgentTasks();
    tasks.push(task);
    await saveAgentTasks(tasks);
  } catch (error) {
    console.error("[agents/store] タスクの保存に失敗:", error);
  }
}

export async function updateAgentTask(
  id: string,
  patch: Partial<Pick<AgentTask, "status" | "result" | "failureReason">>
): Promise<AgentTask | null> {
  const tasks = await loadAgentTasks();
  const target = tasks.find((t) => t.id === id);
  if (!target) return null;

  const next: AgentTask = { ...target, ...patch, updatedAt: new Date().toISOString() };
  await saveAgentTasks(tasks.map((t) => (t.id === id ? next : t)));
  return next;
}
