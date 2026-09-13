/**
 * Agent Assignment — Phase 6 §9 〜 §11
 *
 * §10 の優先順位:
 *   明示指定 → 必要Skillを持つ → 同一Department → AI COO
 * 適切な担当がいなければ NO_SUITABLE_AGENT とし、
 * 組織進化（Phase 3）へ「この仕事の担当がいない」という候補として渡せるようにする。
 * 無理に誰かへ割り当てると、専門外の仕事が黙って増えていく。
 */

import type { AgentSummary, OrganizationSnapshot } from "../organization";

export type AgentWorkload = {
  agentId: string;
  activeMissions: number;
  queuedMissions: number;
  recentFailures: number;
};

/** 同時に持てるMissionの上限。超える相手には回さない（§11） */
export const MAX_CONCURRENT_MISSIONS = 3;

export type AssignmentReason =
  | "explicit"
  | "skill_match"
  | "same_department"
  | "fallback_router";

export type AssignmentResult =
  | { assigned: true; agentId: string; reason: AssignmentReason }
  | { assigned: false; reason: "NO_SUITABLE_AGENT"; detail: string };

export type AssignmentInput = {
  organization: OrganizationSnapshot;
  workloads?: AgentWorkload[];
  /** Missionが明示するAI社員 */
  requiredAgents?: string[];
  requiredSkills?: string[];
  departmentId?: string;
  /** 最後の受け皿。いなければフォールバックしない */
  routerAgentId?: string;
};

/** 手が空いているか。上限に達している相手は候補から外す */
function hasCapacity(agentId: string, workloads: AgentWorkload[]): boolean {
  const load = workloads.find((w) => w.agentId === agentId);
  if (!load) return true;
  return load.activeMissions + load.queuedMissions < MAX_CONCURRENT_MISSIONS;
}

export function assignAgent(input: AssignmentInput): AssignmentResult {
  const workloads = input.workloads ?? [];
  const agents = input.organization.agents;
  const available = (agent: AgentSummary) => hasCapacity(agent.id, workloads);

  /* 1. 明示指定 */
  for (const agentId of input.requiredAgents ?? []) {
    const agent = agents.find((a) => a.id === agentId);
    if (agent && available(agent)) {
      return { assigned: true, agentId: agent.id, reason: "explicit" };
    }
  }

  /* 2. 必要Skillを持つAI社員。手の空いている順に選ぶ */
  const skills = input.requiredSkills ?? [];
  if (skills.length > 0) {
    const matches = agents
      .filter((agent) => skills.every((skill) => agent.skillIds.includes(skill)))
      .filter(available)
      .sort((a, b) => loadOf(a.id, workloads) - loadOf(b.id, workloads));
    if (matches.length > 0) {
      return { assigned: true, agentId: matches[0].id, reason: "skill_match" };
    }
  }

  /* 3. 同じ部門のAI社員 */
  if (input.departmentId) {
    const sameDept = agents
      .filter((agent) => agent.departmentId === input.departmentId)
      .filter(available)
      .sort((a, b) => loadOf(a.id, workloads) - loadOf(b.id, workloads));
    if (sameDept.length > 0) {
      return { assigned: true, agentId: sameDept[0].id, reason: "same_department" };
    }
  }

  /* 4. 最後の受け皿 */
  if (input.routerAgentId) {
    const router = agents.find((a) => a.id === input.routerAgentId);
    if (router && available(router)) {
      return { assigned: true, agentId: router.id, reason: "fallback_router" };
    }
  }

  return {
    assigned: false,
    reason: "NO_SUITABLE_AGENT",
    detail:
      skills.length > 0
        ? `必要なSkill（${skills.join(", ")}）を持つAI社員がいないか、全員が上限に達しています`
        : "担当できるAI社員がいません",
  };
}

function loadOf(agentId: string, workloads: AgentWorkload[]): number {
  const load = workloads.find((w) => w.agentId === agentId);
  return load ? load.activeMissions + load.queuedMissions : 0;
}

/** Missionの一覧から現在の負荷を数える */
export function computeWorkloads(
  missions: { assignedAgentId?: string; status: string }[]
): AgentWorkload[] {
  const byAgent = new Map<string, AgentWorkload>();

  for (const mission of missions) {
    if (!mission.assignedAgentId) continue;
    const current =
      byAgent.get(mission.assignedAgentId) ?? {
        agentId: mission.assignedAgentId,
        activeMissions: 0,
        queuedMissions: 0,
        recentFailures: 0,
      };

    if (["ACTIVE", "EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(mission.status)) {
      current.activeMissions += 1;
    } else if (["PLANNED", "open"].includes(mission.status)) {
      current.queuedMissions += 1;
    } else if (mission.status === "FAILED") {
      current.recentFailures += 1;
    }

    byAgent.set(mission.assignedAgentId, current);
  }

  return [...byAgent.values()];
}
