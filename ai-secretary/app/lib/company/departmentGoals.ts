/**
 * Personal Company の部門目的 — Phase 4 §20 / §21
 *
 * §21 の要点: 既存の personal-fund / personal-note / personal-morning を
 * 新名称へ一括置換しない。稼働中のコマンド・ルーティングが壊れる。
 *
 * 代わりに「Personal Company から見た意味づけ」を上位のMapping Layerとして持つ。
 * 既存IDはそのまま、意味だけを重ねる。
 */

export type PersonalDepartmentGoal =
  | "wealth"
  | "income"
  | "media"
  | "business"
  | "organization_evolution"
  | "security";

export const DEPARTMENT_GOAL_LABELS: Record<PersonalDepartmentGoal, string> = {
  wealth: "資産を増やす",
  income: "収入を増やす",
  media: "発信して集める",
  business: "事業を作る",
  organization_evolution: "組織を進化させる",
  security: "守る",
};

export type DepartmentGoalMapping = {
  goal: PersonalDepartmentGoal;
  /** 既存のAI社員ID。改名しない */
  agentIds: string[];
  /** この目的が North Star にどう効くか */
  contribution: string;
};

/**
 * 既存AI社員 → Personal Company の目的への写像。
 * 新しいAI社員を足したらここにも追加する。
 */
export const DEPARTMENT_GOAL_MAP: DepartmentGoalMapping[] = [
  {
    goal: "wealth",
    agentIds: ["personal-fund"],
    contribution: "投資資産を増やし、不労所得の基盤を作る",
  },
  {
    goal: "income",
    agentIds: ["personal-finance"],
    contribution: "収支を把握し、貯蓄率を上げる",
  },
  {
    goal: "media",
    agentIds: ["personal-note"],
    contribution: "発信から収益導線を作る（AI Generated Revenue の主経路）",
  },
  {
    goal: "business",
    agentIds: [],
    contribution: "まだ担当なし。AI経由の事業収益が立ち始めたら置く",
  },
  {
    goal: "organization_evolution",
    agentIds: ["executive-kaizen"],
    contribution: "組織の無駄を見つけ、少ない手数で回るようにする",
  },
  {
    goal: "security",
    agentIds: [],
    contribution: "まだ担当なし。資産・個人情報の保護を扱う",
  },
];

export function goalOfAgent(agentId: string): PersonalDepartmentGoal | null {
  return DEPARTMENT_GOAL_MAP.find((m) => m.agentIds.includes(agentId))?.goal ?? null;
}

export function agentsForGoal(goal: PersonalDepartmentGoal): string[] {
  return DEPARTMENT_GOAL_MAP.find((m) => m.goal === goal)?.agentIds ?? [];
}
