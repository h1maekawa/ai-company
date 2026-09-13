import { usesLocalExecutionStorage, readLocalExecution, writeLocalExecution } from "./localStore";
/**
 * 実行まわりの保存 — Phase 6 §57 / §58 / §59
 *
 * Mission / ActionRequest / Approval を1つのファイルにまとめて持つ。
 * 3つは常に一緒に読まれ、整合が崩れると承認の判断ができなくなるため、
 * 別ファイルに分けて片方だけ古い状態にならないようにしている。
 *
 * 履歴は消さない。状態遷移・承認判断はすべて追跡できる形で残す。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { ExecutionMission } from "./mission";
import type { ActionRequest } from "./actionGateway";
import type { ApprovalRequest } from "./approval";
import type { ExecutionPlan } from "./executionPlan";

const PATH = "memory/personal/company/execution.md";

import type { RunnerState } from "./runnerTypes";

export type ExecutionState = {
  runtime?: RunnerState;
  missions: ExecutionMission[];
  actionRequests: ActionRequest[];
  approvals: ApprovalRequest[];
  plans: ExecutionPlan[];
};

export function emptyExecutionState(): ExecutionState {
  return { missions: [], actionRequests: [], approvals: [], plans: [] };
}

function extractJson(markdown: string): ExecutionState {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) {
    if (markdown.trim()) throw new Error("INVALID_EXECUTION_STATE");
    return emptyExecutionState();
  }
  try {
    const parsed = JSON.parse(match[1]) as Partial<ExecutionState>;
    return {
      runtime: parsed.runtime,
      missions: parsed.missions ?? [],
      actionRequests: parsed.actionRequests ?? [],
      approvals: parsed.approvals ?? [],
      plans: parsed.plans ?? [],
    };
  } catch {
    throw new Error("INVALID_EXECUTION_STATE");
  }
}

export async function loadExecutionState(): Promise<ExecutionState> {
  const content = usesLocalExecutionStorage() ? await readLocalExecution() : (await getVaultFile(PATH)).content;
  return extractJson(content || "");
}

export async function saveExecutionState(state: ExecutionState): Promise<ExecutionState> {
  const existing = usesLocalExecutionStorage() ? { content: await readLocalExecution(), sha: undefined } : await getVaultFile(PATH);
  const sha = existing.sha;
  const previous = extractJson(existing.content || "");
  const oldEvents = previous.runtime?.learning ?? [];
  const nextEvents = state.runtime?.learning ?? [];
  if (oldEvents.some((event, index) => JSON.stringify(event) !== JSON.stringify(nextEvents[index]))) throw new Error("LEARNING_APPEND_ONLY");
  const oldArtifacts = previous.runtime?.artifacts ?? [];
  if (oldArtifacts.some((artifact, index) => JSON.stringify(artifact) !== JSON.stringify(state.runtime?.artifacts[index]))) throw new Error("ARTIFACT_APPEND_ONLY");

  const pending = state.approvals.filter((a) => a.status === "PENDING");
  const blocked = state.actionRequests.filter((a) => a.status === "BLOCKED");
  const active = state.missions.filter((m) =>
    ["ACTIVE", "EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(m.status)
  );

  const markdown = `---
type: mission_execution
missions: ${state.missions.length}
pending_approvals: ${pending.length}
updated: ${new Date().toISOString()}
---

# ミッションの実行状態

Mission・ActionRequest・承認をまとめて持ちます。
状態遷移と承認判断の履歴は消さずに残します。

- 進行中のMission: ${active.length}件
- 承認待ち: ${pending.length}件
- ブロックされたAction: ${blocked.length}件

## 承認待ち

${
  pending.length > 0
    ? pending.map((a) => `- [${a.riskLevel}] ${a.title}（${a.requestedBy}）`).join("\n")
    : "（ありません）"
}

## ブロックされたAction

${
  blocked.length > 0
    ? blocked.map((a) => `- ${a.actionType}: ${a.reason ?? "理由不明"}`).join("\n")
    : "（ありません）"
}

\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\`
`;

  if (usesLocalExecutionStorage()) await writeLocalExecution(markdown, nextEvents);
  else await saveVaultFile(PATH, markdown, sha);
  return state;
}
