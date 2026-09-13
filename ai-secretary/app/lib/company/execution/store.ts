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

export type ExecutionState = {
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
  if (!match) return emptyExecutionState();
  try {
    const parsed = JSON.parse(match[1]) as Partial<ExecutionState>;
    return {
      missions: parsed.missions ?? [],
      actionRequests: parsed.actionRequests ?? [],
      approvals: parsed.approvals ?? [],
      plans: parsed.plans ?? [],
    };
  } catch {
    return emptyExecutionState();
  }
}

export async function loadExecutionState(): Promise<ExecutionState> {
  try {
    const file = await getVaultFile(PATH);
    return extractJson(file.content || "");
  } catch {
    return emptyExecutionState();
  }
}

export async function saveExecutionState(state: ExecutionState): Promise<ExecutionState> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(PATH)).sha;
  } catch {
    // 初回作成
  }

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

  await saveVaultFile(PATH, markdown, sha);
  return state;
}
