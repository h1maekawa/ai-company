/**
 * 組織の現在形 — v3.1 §5 Organization Architect が評価する対象
 *
 * DEPARTMENTS（静的config）を唯一の出所として、組織を数えられる形に畳む。
 * 別のレジストリを持たないのは、二重管理になった瞬間にどちらかが古くなるため。
 *
 * ここは読み取り専用。組織を変更するのは Proposal → CEO承認 の経路だけ（§21〜22）。
 */

import { DEPARTMENTS, type Department, type EmployeeAgent } from "../config/departments";
import { SKILL_REGISTRY } from "../skills/registry";
import {
  grantedPermissions,
  hasWriteAccess,
  RISK_INTERVENTION_TARGET,
  type RiskLevel,
} from "./agentTypes";

export type AgentSummary = {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  /** 部屋に属している場合のみ */
  roomId?: string;
  kind: EmployeeAgent["kind"];
  riskLevel: RiskLevel;
  /** 許可されている操作（"vault.write" 形式） */
  granted: string[];
  /** 書き込み系を持つか。監査で最初に見る */
  canWrite: boolean;
  /** §13 の目標介入率。R4 は null */
  interventionTarget: number | null;
  memoryScopeCount: number;
  skillIds: string[];
};

export type DepartmentSummary = {
  id: string;
  name: string;
  icon: string;
  agents: number;
  managers: number;
  /** この部門のAI社員が使えるSkillの延べ数 */
  skills: number;
  /** 書き込み権限を持つAI社員の数 */
  writers: number;
};

export type OrganizationSnapshot = {
  departments: DepartmentSummary[];
  agents: AgentSummary[];
  totals: {
    departments: number;
    agents: number;
    managers: number;
    /** 実装済みのSkill数 / 登録されているSkill総数 */
    implementedSkills: number;
    registeredSkills: number;
    /** Workflowは現状エンティティとして存在しない。0固定であることを明示する */
    workflows: number;
  };
  loadedAt: string;
};

/** 部門直下と部屋の中の両方からAI社員を取り出す */
function agentsOf(department: Department): { agent: EmployeeAgent; roomId?: string }[] {
  return [
    ...(department.secretaries ?? []).map((agent) => ({ agent, roomId: undefined })),
    ...(department.rooms ?? []).flatMap((room) =>
      room.secretaries.map((agent) => ({ agent, roomId: room.id }))
    ),
  ];
}

function toSummary(
  agent: EmployeeAgent,
  department: Department,
  roomId?: string
): AgentSummary {
  const skillIds = [
    ...new Set([
      ...(agent.skillIds ?? []),
      // registry 側で割り当てられているものも同じAI社員の能力として数える
      ...SKILL_REGISTRY.filter((skill) => skill.allowedSecretaries.includes(agent.id)).map((s) => s.id),
    ]),
  ];

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    departmentId: department.id,
    departmentName: department.name,
    roomId,
    kind: agent.kind,
    riskLevel: agent.riskLevel,
    granted: grantedPermissions(agent.permissions),
    canWrite: hasWriteAccess(agent.permissions),
    interventionTarget: RISK_INTERVENTION_TARGET[agent.riskLevel],
    memoryScopeCount: agent.memoryScope.length,
    skillIds,
  };
}

export function buildOrganizationSnapshot(now: Date = new Date()): OrganizationSnapshot {
  const agents: AgentSummary[] = [];
  const departments: DepartmentSummary[] = [];

  for (const department of DEPARTMENTS) {
    const members = agentsOf(department).map(({ agent, roomId }) =>
      toSummary(agent, department, roomId)
    );
    agents.push(...members);

    departments.push({
      id: department.id,
      name: department.name,
      icon: department.icon,
      agents: members.length,
      managers: members.filter((m) => m.kind === "manager").length,
      skills: members.reduce((sum, m) => sum + m.skillIds.length, 0),
      writers: members.filter((m) => m.canWrite).length,
    });
  }

  return {
    departments,
    agents,
    totals: {
      departments: departments.length,
      agents: agents.length,
      managers: agents.filter((a) => a.kind === "manager").length,
      implementedSkills: SKILL_REGISTRY.filter((s) => s.status === "implemented").length,
      registeredSkills: SKILL_REGISTRY.length,
      // Workflowは未実装。0であることを隠さず出す（§4 Workflow Candidate の前提）
      workflows: 0,
    },
    loadedAt: now.toISOString(),
  };
}
