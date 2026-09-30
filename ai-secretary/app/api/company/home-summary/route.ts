import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { applyExpiry } from "@/app/lib/company/execution/approval";
import { BUSINESS_DEPARTMENT_IDS, type NavigationDepartmentId } from "@/app/lib/config/navigation";

export const dynamic = "force-dynamic";
type Card = { id: NavigationDepartmentId; status: "active" | "attention" | "unknown"; currentWork: string[]; problems: string[] };
const agentDepartment = (agent?: string): NavigationDepartmentId | null => {
  if (!agent) return null;
  if (agent.startsWith("creator-") || agent === "personal-note") return "creator";
  if (agent.startsWith("fund-") || agent === "personal-fund") return "fund";
  if (agent === "personal-morning") return "planning";
  if (agent.startsWith("executive-kaizen")) return "operations";
  if (agent.startsWith("engineering-")) return "engineering";
  return null;
};

/** One bounded state read for Home. Missing department evidence stays unknown. */
export async function GET(): Promise<NextResponse> {
  try {
    const state = await loadExecutionState();
    const pending = applyExpiry(state.approvals).filter((approval) => approval.status === "PENDING");
    const cards: Card[] = BUSINESS_DEPARTMENT_IDS.map((id) => {
      const missions = state.missions.filter((mission) => agentDepartment(mission.routingContext?.requiredAgentId ?? mission.assignedAgentId) === id);
      const problems = missions.filter((mission) => ["FAILED", "BLOCKED", "REPLAN_REQUIRED"].includes(mission.status)).slice(0, 2).map((mission) => mission.title);
      const currentWork = missions.filter((mission) => ["ACTIVE", "EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(mission.status)).slice(0, 2).map((mission) => mission.title);
      return { id, status: problems.length ? "attention" : currentWork.length ? "active" : "unknown", currentWork, problems };
    });
    return NextResponse.json({ generatedAt: new Date().toISOString(), approvals: { pendingCount: pending.length }, departments: cards });
  } catch {
    return NextResponse.json({ error: "HOME_SUMMARY_UNAVAILABLE" }, { status: 503 });
  }
}
