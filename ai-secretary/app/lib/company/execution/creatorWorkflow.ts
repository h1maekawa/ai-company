import type { ExecutionPlan, ExecutionStep, ExecutionStepStatus } from "./executionPlan";

const RESEARCH = [/調査/u, /調べ/u, /市場/u, /競合/u, /source/u, /リサーチ/u];
const CONTENT = [/記事/u, /note/u, /投稿/u, /下書き/u, /書いて/u, /作って/u, /draft/u];
const KPI = [/kpi/u, /分析/u, /ctr/u, /収益/u, /成果/u, /改善/u, /performance/u];
const matches = (text: string, rules: RegExp[]) => rules.some((rule) => rule.test(text));

export function isCreatorMultiAgentDirective(instruction: string, goal = ""): boolean {
  const text = `${instruction} ${goal}`.toLowerCase();
  return [matches(text, RESEARCH), matches(text, CONTENT), matches(text, KPI)].filter(Boolean).length >= 2;
}

export function creatorWorkflowSteps(): Array<Omit<ExecutionStep, "status">> {
  return [
    { id: "creator_research", order: 1, title: "ResearchとSource整理", type: "research", assignedAgentId: "creator-research", inputRefs: ["mission:goal"], outputRefs: [], knowledgeRefs: [] },
    { id: "creator_kpi", order: 2, title: "既存KPIとPerformance分析", type: "analysis", assignedAgentId: "creator-kpi", inputRefs: ["content:ssot", "revenue:ssot"], outputRefs: [], knowledgeRefs: [] },
    { id: "creator_content", order: 3, title: "Research・Knowledge・KPIからDraft作成", type: "generate", assignedAgentId: "creator-content", dependsOn: ["creator_research", "creator_kpi"], inputRefs: ["step:creator_research", "step:creator_kpi", "knowledge:shared", "brand:creator"], outputRefs: [], knowledgeRefs: [] },
    { id: "creator_lead_review", order: 4, title: "Goal・Source・Knowledge・KPI・Draft品質を統合Review", type: "review", assignedAgentId: "personal-note", dependsOn: ["creator_content"], inputRefs: ["step:creator_research", "step:creator_kpi", "step:creator_content"], outputRefs: [], knowledgeRefs: [] },
    { id: "creator_human_review", order: 5, title: "CEO Human Review", type: "review", assignedAgentId: "personal-note", dependsOn: ["creator_lead_review"], inputRefs: ["step:creator_lead_review"], outputRefs: [], knowledgeRefs: [], humanRequired: true },
  ];
}

export function deriveCreatorWorkflowProgress(plan: ExecutionPlan) {
  const completed = plan.steps.filter((step) => step.status === "COMPLETE").length;
  const blocked = plan.steps.some((step) => ["BLOCKED", "FAILED"].includes(step.status));
  const waitingHuman = plan.steps.some((step) => step.humanRequired && ["PENDING", "WAITING", "RUNNING"].includes(step.status));
  const running = plan.steps.some((step) => step.status === "RUNNING");
  const status = blocked ? "BLOCKED" : completed === plan.steps.length ? "COMPLETED" : waitingHuman && completed === plan.steps.length - 1 ? "WAITING_APPROVAL" : running || completed > 0 ? "RUNNING" : "PENDING";
  return { completed, total: plan.steps.length, status } as const;
}

export function integrateCreatorResults(plan: ExecutionPlan, outputs: Record<string, string>) {
  const required = ["creator_research", "creator_kpi", "creator_content"];
  const missing = required.filter((id) => !outputs[id]?.trim());
  return {
    ready: missing.length === 0,
    missing,
    inputRefs: required.map((id) => `step:${id}`),
    summary: required.filter((id) => outputs[id]).map((id) => `${id}: ${outputs[id].slice(0, 500)}`).join("\n"),
  };
}

export type CreatorReplanProposal = { missionId: string; failedStepIds: string[]; action: "RETRY" | "LEAD_REPLAN" | "HUMAN_ATTENTION"; requiresHumanConfirmation: boolean };
export function proposeCreatorReplan(missionId: string, steps: Array<{ id: string; status: ExecutionStepStatus }>): CreatorReplanProposal | null {
  const failed = steps.filter((step) => ["BLOCKED", "FAILED"].includes(step.status)).map((step) => step.id);
  if (!failed.length) return null;
  return { missionId, failedStepIds: failed, action: failed.length === 1 ? "LEAD_REPLAN" : "HUMAN_ATTENTION", requiresHumanConfirmation: failed.length > 1 };
}

export function creatorSkillOpportunity(input: { missionIds: string[]; repeatedSteps: string[]; knowledgeIds: string[]; suggestedAgents: string[] }) {
  if (new Set(input.missionIds).size < 3) return null;
  return { status: "CANDIDATE" as const, sourceMissionIds: [...new Set(input.missionIds)], sourceKnowledgeIds: [...new Set(input.knowledgeIds)], repeatedSteps: [...new Set(input.repeatedSteps)], usageCount: new Set(input.missionIds).size, suggestedAgents: [...new Set(input.suggestedAgents)], reason: "同じCreator Workflow stepが3件以上のMissionで反復", engineeringRequestAllowed: false, registryMutationAllowed: false };
}
