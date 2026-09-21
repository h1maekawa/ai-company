import type { ExecutionState } from "../execution/store";

export function normalizeExecutionState(state: Partial<ExecutionState> | null | undefined): ExecutionState {
  return {
    runtime: state?.runtime,
    missions: (state?.missions ?? []).map((mission) => ({ ...mission, version: mission.version ?? 0 })),
    actionRequests: state?.actionRequests ?? [],
    approvals: state?.approvals ?? [],
    plans: state?.plans ?? [],
    contentDraftCandidates: state?.contentDraftCandidates ?? [],
    skillCandidates: state?.skillCandidates ?? [],
  };
}

export function parseExecutionMarkdown(markdown: string): ExecutionState {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) {
    if (markdown.trim()) throw new Error("INVALID_EXECUTION_STATE");
    return normalizeExecutionState(null);
  }
  try {
    return normalizeExecutionState(JSON.parse(match[1]) as Partial<ExecutionState>);
  } catch {
    throw new Error("INVALID_EXECUTION_STATE");
  }
}

export function executionMarkdown(state: ExecutionState): string {
  const pending = state.approvals.filter((approval) => approval.status === "PENDING");
  const blocked = state.actionRequests.filter((action) => action.status === "BLOCKED");
  const active = state.missions.filter((mission) =>
    ["ACTIVE", "EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(mission.status),
  );
  return `---
type: mission_execution
missions: ${state.missions.length}
pending_approvals: ${pending.length}
updated: ${new Date().toISOString()}
---

# ミッションの実行状態

- 進行中のMission: ${active.length}件
- 承認待ち: ${pending.length}件
- ブロックされたAction: ${blocked.length}件

\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\`
`;
}

export function assertAppendOnly(previous: ExecutionState, next: ExecutionState) {
  const oldEvents = previous.runtime?.learning ?? [];
  const nextEvents = next.runtime?.learning ?? [];
  if (oldEvents.some((event, index) => JSON.stringify(event) !== JSON.stringify(nextEvents[index]))) {
    throw new Error("LEARNING_APPEND_ONLY");
  }
  const oldArtifacts = previous.runtime?.artifacts ?? [];
  const nextArtifacts = next.runtime?.artifacts ?? [];
  if (oldArtifacts.some((artifact, index) => JSON.stringify(artifact) !== JSON.stringify(nextArtifacts[index]))) {
    throw new Error("ARTIFACT_APPEND_ONLY");
  }
}
