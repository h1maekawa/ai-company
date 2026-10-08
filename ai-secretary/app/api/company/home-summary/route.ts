import { NextResponse } from "next/server";
import { loadHomeAttention } from "@/app/lib/company/homeAttention";
import { emptyExecutionState, loadExecutionState } from "@/app/lib/company/execution/store";
import { applyExpiry } from "@/app/lib/company/execution/approval";
import { BUSINESS_DEPARTMENT_IDS, type NavigationDepartmentId } from "@/app/lib/config/navigation";

export const dynamic = "force-dynamic";
type DepartmentStatus = "active" | "attention" | "idle" | "unavailable";
type Card = { id: NavigationDepartmentId; status: DepartmentStatus; currentWork: string[]; problems: string[] };
type Attention = { id: string; title: string; href: string; source: string; priority: "critical" | "high" | "normal"; order?: number };
const jstDay = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const agentDepartment = (agent?: string): NavigationDepartmentId | null => {
  if (!agent) return null;
  if (agent.startsWith("creator-") || agent === "personal-note") return "creator";
  if (agent.startsWith("fund-") || agent === "personal-fund") return "fund";
  if (agent === "personal-morning") return "planning";
  if (agent.startsWith("executive-kaizen")) return "operations";
  if (agent.startsWith("engineering-")) return "engineering";
  return null;
};

/** One bounded state read for Home. A successful empty read is idle, not unavailable. */
export async function GET(): Promise<NextResponse> {
  try {
    const [execution, extra] = await Promise.all([
      loadExecutionState()
        .then((state) => ({ state, unavailable: false }))
        .catch((error: unknown) => {
          console.error("[home-summary] execution store unavailable", {
            code: error instanceof Error ? error.message : "UNKNOWN",
          });
          return { state: emptyExecutionState(), unavailable: true };
        }),
      loadHomeAttention().catch((error: unknown) => {
        console.error("[home-summary] external attention unavailable", {
          code: error instanceof Error ? error.message : "UNKNOWN",
        });
        return { attention: [], unavailable: ["コンテンツ", "投資", "資産"], contentStatus: null };
      }),
    ]);
    const state = execution.state;
    const pending = applyExpiry(state.approvals).filter((approval) => approval.status === "PENDING");
    const cards: Card[] = BUSINESS_DEPARTMENT_IDS.map((id) => {
      const missions = state.missions.filter((mission) => agentDepartment(mission.routingContext?.requiredAgentId ?? mission.assignedAgentId) === id);
      const problems = missions.filter((mission) => ["FAILED", "BLOCKED", "REPLAN_REQUIRED"].includes(mission.status)).slice(0, 2).map((mission) => mission.title);
      const currentWork = missions.filter((mission) => ["ACTIVE", "EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(mission.status)).slice(0, 2).map((mission) => mission.title);
      const status: DepartmentStatus = execution.unavailable
        ? "unavailable"
        : problems.length > 0
          ? "attention"
          : currentWork.length > 0
            ? "active"
            : "idle";
      return { id, status, currentWork, problems };
    });
    const attention: Attention[] = [];
    const failedMemory = state.slackMemory?.jobs.filter((job) => job.status === "failed" && job.attempts >= 3).length ?? 0;
    if (failedMemory) attention.push({ id: "slack-memory-failed", title: `Slack会話の保存・整理に失敗 ${failedMemory}件（再試行上限）`, href: "/admin/system-map", source: "会話メモリ", priority: "high" });
    if (pending.length) attention.push({ id: "approvals", title: `承認待ち ${pending.length}件`, href: "/ceo/approvals", source: "AI Company", priority: "high" });
    const activeRuntimeAttention = (state.runtime?.attention ?? []).filter((item) => !item.resolvedAt && item.type !== "FIRST_REVENUE" && item.type !== "APPROVAL_REQUIRED");
    for (const item of activeRuntimeAttention) {
      attention.push({ id: item.id, title: item.title, href: item.missionId ? "/ceo/work" : "/admin/system-map", source: "AI Company", priority: item.priority === "critical" ? "critical" : item.priority === "high" ? "high" : "normal" });
    }
    const alreadyReportedMissions = new Set(activeRuntimeAttention.map((item) => item.missionId));
    for (const mission of state.missions.filter((item) => ["BLOCKED", "FAILED", "REPLAN_REQUIRED"].includes(item.status) && !alreadyReportedMissions.has(item.id)).slice(0, 8)) {
      attention.push({ id: `mission:${mission.id}`, title: mission.title, href: "/ceo/work", source: "AI Company", priority: mission.status === "FAILED" ? "high" : "normal" });
    }
    const rank = { critical: 0, high: 1, normal: 2 };
    attention.forEach((item) => { item.order = item.priority === "critical" ? 0 : item.id === "approvals" ? 1 : 5; });
    attention.push(...extra.attention);
    attention.sort((a, b) => (a.order ?? rank[a.priority]) - (b.order ?? rank[b.priority]));

    const yesterday = jstDay(new Date(Date.now() - 86_400_000));
    const happenedYesterday = (at?: string) => Boolean(at && !Number.isNaN(Date.parse(at)) && jstDay(new Date(at)) === yesterday);
    const completedMissions = state.missions.filter((item) => item.status === "COMPLETED" && happenedYesterday(item.completedAt)).length;
    const researchRuns = (state.runtime?.researchRuns ?? []).filter((item) => item.completedAt && happenedYesterday(item.completedAt)).length;
    const decisions = state.approvals.filter((item) => item.status !== "PENDING" && happenedYesterday(item.decidedAt)).length;
    const yesterdayFacts = [
      completedMissions ? `Missionを${completedMissions}件完了しました` : null,
      researchRuns ? `Researchを${researchRuns}件実行しました` : null,
      decisions ? `承認判断を${decisions}件記録しました` : null,
    ].filter((item): item is string => Boolean(item));
    const unavailable = execution.unavailable ? ["AI Company", ...extra.unavailable] : extra.unavailable;
    return NextResponse.json({ generatedAt: new Date().toISOString(), unavailable, approvals: { pendingCount: pending.length }, content: { automation: extra.contentStatus }, departments: cards, attention: attention.slice(0, 20), yesterday: { date: yesterday, facts: yesterdayFacts } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    console.error("[home-summary] response build failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return NextResponse.json({ error: "HOME_SUMMARY_UNAVAILABLE" }, { status: 503 });
  }
}
