/**
 * Office Map room model — pure data shaping, no React.
 *
 * SSOTは3つの既存read modelだけ:
 *  - DEPARTMENT_NAV（部署の人間向け入口。app/lib/config/navigation.ts）
 *  - PLATFORM_NODES（共有基盤の定義。app/lib/company/systemMapConfig.ts）
 *  - /api/company/home-summary・/api/system/connections・useCompanyOffice（Backendの現在値）
 *
 * ここで新しい部署やSkillやRuntimeは定義しない。見せ方（部屋という比喩）だけを足す。
 */

import { DEPARTMENT_NAV } from "@/app/lib/config/navigation";
import { PLATFORM_NODES } from "@/app/lib/company/systemMapConfig";
import type { AgentView, DepartmentView } from "../office/types";

export type RoomStatus = "active" | "attention" | "idle" | "unavailable" | "unknown";

export type RoomTheme = "lobby" | "content" | "investment" | "knowledge" | "ops" | "gate" | "automation" | "infra" | "personal";

export type ContentChannel = { id: string; label: string; href?: string; enabled: boolean };

export type RoomView = {
  id: string;
  zoneLabel: string;
  icon: string;
  href?: string;
  theme: RoomTheme;
  status: RoomStatus;
  description: string;
  agents: AgentView[];
  workingCount: number;
  attentionCount: number;
  /** AI社員もHuman Gateのような概念的な部屋もあるため、Mission要約は任意 */
  currentWork?: string[];
  channels?: ContentChannel[];
};

const navById = Object.fromEntries(DEPARTMENT_NAV.map((item) => [item.id, item]));
const platformById = Object.fromEntries(PLATFORM_NODES.map((node) => [node.id, node]));

/** Content部屋の内訳。既存route以外は作らない。TikTokは今回Runtime/Storeを持たないため非活性のまま出す。 */
export const CONTENT_CHANNELS: ContentChannel[] = [
  { id: "x", label: "X", href: "/content/x", enabled: true },
  { id: "note", label: "note", href: "/content/note", enabled: true },
  { id: "instagram", label: "Instagram", href: "/content/instagram", enabled: true },
  { id: "tiktok", label: "TikTok", enabled: false },
];

export type HomeSummaryDepartmentCard = {
  id: string;
  status: "active" | "attention" | "idle" | "unavailable";
  currentWork: string[];
  problems: string[];
};

export type HomeSummary = {
  generatedAt: string;
  unavailable?: string[];
  approvals: { pendingCount: number };
  departments: HomeSummaryDepartmentCard[];
  attention: { id: string; title: string; href: string; source: string; priority: string }[];
  yesterday: { date: string; facts: string[] };
};

export type ConnectionsSummary = {
  services?: { service: string; label: string; status: string; message?: string }[];
};

function agentsFor(departments: DepartmentView[], employeeIds: string[]): AgentView[] {
  const all = departments.flatMap((department) => department.agents);
  return all.filter((agent) => employeeIds.includes(agent.agentId));
}

function staffedRoomStatus(agents: AgentView[], card?: HomeSummaryDepartmentCard): RoomStatus {
  if (card) {
    return card.status;
  }
  if (agents.length === 0) return "unknown";
  if (agents.some((agent) => agent.status === "問題あり")) return "attention";
  if (agents.some((agent) => agent.status === "CEO確認待ち")) return "attention";
  if (agents.some((agent) => agent.status === "作業中" || agent.status === "レビュー中")) return "active";
  return "idle";
}

/**
 * 既存read modelから部屋の一覧を組み立てる。
 *
 * departments: useCompanyOffice().view.departments（AI社員の現在地と状態）
 * homeSummary: /api/company/home-summary（Homeと同じ集計。未取得ならcard/approvalsが欠け、該当部屋はunknownになる）
 */
export function buildRooms(departments: DepartmentView[], homeSummary?: HomeSummary): RoomView[] {
  const cardById = new Map((homeSummary?.departments ?? []).map((card) => [card.id, card]));

  const businessRoom = (id: "creator" | "fund" | "operations" | "knowledge" | "planning" | "engineering", zoneLabel: string, theme: RoomTheme, channels?: ContentChannel[]): RoomView => {
    const nav = navById[id];
    const agents = agentsFor(departments, nav.employeeIds);
    const card = cardById.get(id);
    return {
      id,
      zoneLabel,
      icon: nav.icon,
      href: nav.href,
      theme,
      status: staffedRoomStatus(agents, card),
      description: nav.description,
      agents,
      workingCount: agents.filter((agent) => agent.status === "作業中" || agent.status === "レビュー中").length,
      attentionCount: card?.problems.length ?? agents.filter((agent) => agent.status === "問題あり" || agent.status === "CEO確認待ち").length,
      currentWork: card?.currentWork,
      channels,
    };
  };

  const allAgents = departments.flatMap((department) => department.agents);
  const placedIds = new Set(DEPARTMENT_NAV.flatMap((item) => item.employeeIds));
  const unassigned = allAgents.filter((agent) => !placedIds.has(agent.agentId));

  const humanGate: RoomView = {
    id: "human",
    zoneLabel: "Quality / Human Gate",
    icon: platformById.human.icon,
    href: "/ceo/approvals",
    theme: "gate",
    status: homeSummary ? (homeSummary.approvals.pendingCount > 0 ? "attention" : "idle") : "unknown",
    description: platformById.human.description,
    agents: [],
    workingCount: 0,
    attentionCount: homeSummary?.approvals.pendingCount ?? 0,
  };

  const automation: RoomView = {
    id: "execution",
    zoneLabel: "Automation / Agent",
    icon: platformById.execution.icon,
    href: "/company",
    theme: "automation",
    status: allAgents.length === 0 ? "unknown" : allAgents.some((agent) => agent.status === "作業中" || agent.status === "レビュー中") ? "active" : "idle",
    description: platformById.execution.description,
    agents: [],
    workingCount: allAgents.filter((agent) => agent.status === "作業中" || agent.status === "レビュー中").length,
    attentionCount: allAgents.filter((agent) => agent.status === "問題あり").length,
  };

  const rooms: RoomView[] = [
    businessRoom("operations", "本部 / System", "ops"),
    businessRoom("knowledge", "Research / Knowledge", "knowledge"),
    businessRoom("creator", "Content", "content", CONTENT_CHANNELS),
    businessRoom("fund", "Investment", "investment"),
    humanGate,
    automation,
    businessRoom("engineering", "Infrastructure", "infra"),
    businessRoom("planning", "Personal OS", "personal"),
  ];

  if (unassigned.length > 0) {
    rooms.push({
      id: "shared-space",
      zoneLabel: "共有スペース",
      icon: "🧑‍💻",
      theme: "personal",
      status: staffedRoomStatus(unassigned),
      description: "個別の部屋を持たないAI社員",
      agents: unassigned,
      workingCount: unassigned.filter((agent) => agent.status === "作業中" || agent.status === "レビュー中").length,
      attentionCount: unassigned.filter((agent) => agent.status === "問題あり").length,
    });
  }

  return rooms;
}
