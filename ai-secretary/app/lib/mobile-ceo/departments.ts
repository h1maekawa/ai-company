import { randomUUID } from "node:crypto";
import type { DerivedMetrics } from "@/app/lib/content/monetization/metrics";
import type { FundDecision, FundRecommendation } from "@/app/lib/fund/engine";
import type { Portfolio } from "@/app/lib/investing/types";
import { DEPARTMENT_IDS, type NavigationDepartmentId } from "@/app/lib/config/navigation";

export { DEPARTMENT_IDS };
export type DepartmentId = NavigationDepartmentId;
export type MetricAvailability = "CONFIRMED" | "PARTIAL" | "UNKNOWN";
export type DepartmentMetric = { metric: string; label: string; value: number | null; displayValue?: string; availability: MetricAvailability; unit?: string; asOf?: string; source: string };
export type DepartmentReadModel = {
  id: DepartmentId; name: string; northStar: DepartmentMetric; outcomes: DepartmentMetric[]; operations: DepartmentMetric[];
  currentWork: string[]; problems: string[]; suggestions: Array<{ observation: string; interpretation: string; suggestion: string }>;
  executionAuthority?: "HUMAN_ONLY"; aiExecutionAllowed?: false;
};
type Json = Record<string, any>;
type ContentKpiPayload = { publishedCount?: number; conversions?: number; xImpressions?: number|null; noteViews?: number|null; linkClicks?: number|null; ctaClicks?: number|null; dataAsOf?: string|null; derived?: DerivedMetrics };
type MobileFundRecommendation = FundRecommendation & { id?: string };
type FundPayload = { recommendations?: { recommendations?: MobileFundRecommendation[] }; portfolio?: Portfolio | null };
const arr = (v: unknown): any[] => Array.isArray(v) ? v : [];
const n = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const metric = (key: string, label: string, value: unknown, source: string, unit?: string, availability?: MetricAvailability): DepartmentMetric => ({ metric: key, label, value: n(value), availability: availability ?? (n(value) === null ? "UNKNOWN" : "CONFIRMED"), unit, source });

/** Questionと副作用を伴うDirective候補を決定論的に分離する。ここでは実行しない。 */
export function isDepartmentDirective(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/(どう|なぜ|何|教えて|状況|ありますか|ある[？?]|とは)[？?]?$/u.test(text)) return false;
  return /(作って|書いて|投稿して|公開して|実装して|追加して|修正して|改善して|整理して|記録して|買って|売って|始めて|実行して)/u.test(text);
}

export function buildDepartmentReadModel(id: DepartmentId, data: Json, generatedAt = new Date().toISOString()): DepartmentReadModel {
  const stamp = (asOf?: string | null) => (m: DepartmentMetric) => asOf ? { ...m, asOf } : m;
  if (id === "creator") {
    const outcome = data.economics?.outcome ?? {}; const content = (data.content ?? {}) as ContentKpiPayload; const opportunities = arr(data.opportunities?.opportunities); const contentStamp = stamp(content.dataAsOf);
    const revenue = n(outcome.revenueYen); const published = n(content.publishedCount);
    const revenuePerContent = revenue !== null && published !== null && published > 0 ? revenue / published : null;
    const status = outcome.revenueStatus === "CONFIRMED" && outcome.costStatus === "CONFIRMED" ? "CONFIRMED" : outcome.revenueStatus === "UNKNOWN" ? "UNKNOWN" : "PARTIAL";
    return { id, name: "Creator", northStar: metric("creator_profit", "Creator Profit", outcome.profitYen, "Company Revenue + Cost Ledger", "円", status), outcomes: [metric("revenue", "Revenue", revenue, "Revenue Ledger", "円", outcome.revenueStatus), metric("profit", "Profit", outcome.profitYen, "Economic Outcome", "円", status), metric("roi", "ROI", outcome.roi, "Economic Outcome", "x", status), contentStamp(metric("conversions", "Conversions", content.conversions, "Content Ledger")), metric("revenue_per_content", "Revenue / Content", revenuePerContent, "Revenue + Content", "円")], operations: [["published", "Published", content.publishedCount], ["x_impressions", "X Impressions", content.xImpressions], ["note_views", "Note Views", content.noteViews], ["link_clicks", "Link Clicks", content.linkClicks], ["cta_clicks", "CTA Clicks", content.ctaClicks], ["ctr", "CTR", content.derived?.ctr], ["cta_ctr", "CTA CTR", content.derived?.ctaCtr], ["conversion_rate", "Conversion Rate", content.derived?.conversionRate], ["rpm", "Revenue / 1000 Impressions", content.derived?.revenuePer1000Impressions]].map(([k,l,v]) => contentStamp(metric(String(k), String(l), v, "Content Dashboard"))), currentWork: opportunities.slice(0, 5).map((x) => String(x.title ?? x.name ?? "Creator opportunity")), problems: revenue === null ? ["Revenue data is missing"] : [], suggestions: revenue === null ? [{ observation: "Revenue is UNKNOWN", interpretation: "収益性を評価できません", suggestion: "Revenue/Costの確認済みFactを記録してください" }] : [] };
  }
  if (id === "fund") {
    const fund = data as FundPayload & Json; const perf = data.performance?.performance ?? data.transactions?.performance ?? {}; const recs = fund.recommendations?.recommendations ?? []; const decisions = arr(data.decisions?.decisions); const tx = arr(data.transactions?.transactions); const learnings = arr(data.learning?.learnings); const portfolio = fund.portfolio; const portfolioAsOf = portfolio?.freshness?.asOf ?? portfolio?.revaluedAt ?? portfolio?.updatedAt; const portfolioStamp = stamp(portfolioAsOf); const recommendationTimes = recs.map((r) => r.dataAsOf).filter((v) => v && v !== "unknown").sort(); const recommendationAsOf = recommendationTimes[recommendationTimes.length - 1];
    const decisionRequired = recs.filter((r) => !r.id || !decisions.some((d) => d.recommendationId === r.id)).length;
    const topAllocation = portfolio?.summary.allocation[0]?.pct ?? null; const total = portfolio?.summary.totalValueJpy; const knownPositions = portfolio?.positions.filter((p) => p.marketValueJpy !== null) ?? []; const concentration = total && total > 0 && knownPositions.length ? Math.max(...knownPositions.map((p) => p.marketValueJpy! / total * 100)) : null;
    const isProblem = (decision: FundDecision, blocked: boolean) => decision === "WAIT_DATA" || blocked;
    return { id, name: "Fund", northStar: metric("asset_growth", "Asset Growth", null, "Fund Performance", "%"), outcomes: [portfolioStamp(metric("portfolio_value", "Portfolio Value", portfolio?.summary.totalValueJpy, "Investing Portfolio", "円")), metric("realized_pl", "Realized P/L", perf.realized?.net, "Transaction Accounting", "円", perf.realized?.status), stamp(perf.unrealized?.asOf)(metric("unrealized_pl", "Unrealized P/L", perf.unrealized?.pnlJpy, "Holdings", "円", perf.unrealized?.status))], operations: [stamp(recommendationAsOf)(metric("recommendations", "Recommendations", recs.length, "Fund Recommendations")), metric("decision_required", "Decision Required", decisionRequired, "Recommendations + Decisions"), metric("transactions", "Transactions", tx.length, "Transaction Ledger"), portfolioStamp(metric("allocation", "Top Asset Allocation", topAllocation, "Investing Portfolio", "%")), portfolioStamp(metric("concentration", "Largest Position", concentration, "Investing Portfolio", "%")), metric("approved_learnings", "Approved Learnings", learnings.filter((x) => x.status === "approved").length, "Fund Learning")], currentWork: recs.slice(0, 5).map((r) => `${r.ticker}: ${r.decision}`), problems: recs.filter((r) => isProblem(r.decision, r.executionBlocked)).map((r) => `${r.ticker}: ${r.decision}${r.executionBlocked ? " / execution blocked" : ""}`), suggestions: [], executionAuthority: "HUMAN_ONLY", aiExecutionAllowed: false };
  }
  if (id === "operations") {
    const m = data.metrics ?? {}; const insufficient = m.sufficientData === false;
    const availability = insufficient ? "PARTIAL" : undefined;
    const ops = [["automation", "Automation Rate", m.automationRate, "%"], ["intervention", "CEO Intervention Rate", m.ceoInterventionRate, "%"], ["failure_rate", "Failure Rate", m.failureRate, "%"], ["success", "Success", m.success], ["failure", "Failure", m.failure], ["skipped", "Skipped", m.skipped], ["latency", "Average Latency", m.avgLatencyMs, "ms"], ["cost", "AI Cost", m.totalCostUsd, "USD"]].map(([k,l,v,u]) => metric(String(k), String(l), v, "Company Events", String(u ?? ""), availability));
    return { id, name: "Operations", northStar: ops[0], outcomes: ops.slice(0,3), operations: ops.slice(3), currentWork: arr(data.execution?.state?.missions).filter((x) => ["ACTIVE","EXECUTING"].includes(x.status)).slice(0,5).map((x) => String(x.title)), problems: arr(data.execution?.state?.missions).filter((x) => ["BLOCKED","FAILED"].includes(x.status)).map((x) => String(x.title)), suggestions: [] };
  }
  if (id === "knowledge") { const k = data.knowledge?.kpis ?? {}; return { id, name: "Knowledge", northStar: metric("new_knowledge", "New Knowledge", k.addedThisWeek, "Knowledge Index"), outcomes: [metric("pending", "Pending", k.review, "Knowledge Candidates"), metric("promoted", "Promoted", null, "Knowledge Index"), metric("merged", "Merged", null, "Knowledge Index"), metric("opportunity", "Knowledge → Opportunity", null, "Opportunity Store"), metric("content", "Knowledge → Content", null, "Content Candidate"), metric("revenue", "Revenue-linked Knowledge", null, "Revenue Ledger")], operations: [metric("total", "Knowledge", k.knowledge, "Knowledge Index"), metric("candidates", "Candidates", k.candidate, "Knowledge Candidates")], currentWork: arr(data.knowledge?.candidates).slice(0,5).map((x) => String(x.frontmatter?.title ?? x.path ?? "Knowledge candidate")), problems: k.review > 0 ? [`${k.review}件のHuman Review待ち`] : [], suggestions: [] }; }
  if (id === "planning") { const tasks = arr(data.planning?.plan?.tasks); const missions = arr(data.execution?.state?.missions); return { id, name: "Planning", northStar: metric("today_tasks", "Today Tasks", tasks.length, "Daily Plan"), outcomes: [metric("priority_a", "Priority A", tasks.filter((x) => x.priority === 1).length, "Daily Plan"), metric("priority_b", "Priority B", tasks.filter((x) => x.priority === 2).length, "Daily Plan"), metric("priority_c", "Priority C", tasks.filter((x) => x.priority >= 3).length, "Daily Plan")], operations: [metric("active", "Active Missions", missions.filter((x) => ["ACTIVE","EXECUTING"].includes(x.status)).length, "Mission Store"), metric("completed", "Completed Missions", missions.filter((x) => x.status === "COMPLETED").length, "Mission Store"), metric("blocked", "Blocked Missions", missions.filter((x) => ["BLOCKED","FAILED"].includes(x.status)).length, "Mission Store"), metric("overdue", "Overdue", tasks.filter((x) => !x.done && x.deadline && x.deadline < generatedAt).length, "Daily Plan")], currentWork: tasks.filter((x) => !x.done).slice(0,5).map((x) => String(x.title)), problems: missions.filter((x) => ["BLOCKED","FAILED"].includes(x.status)).map((x) => String(x.title)), suggestions: [] }; }
  const items = arr(data.engineering?.items); const summary = data.engineering?.summary ?? {}; const githubAvailable = data.engineering?.available === true; const githubStamp = stamp(summary.lastActivity); const lastActivity = githubStamp(metric("last_activity", "Last Activity", null, "GitHub")); if (githubAvailable && summary.lastActivity) { lastActivity.displayValue = String(summary.lastActivity); lastActivity.availability = "CONFIRMED"; } return { id, name: "Engineering", northStar: metric("worker", "Worker Availability", null, "Engineering Runtime"), outcomes: [githubStamp(metric("pr_ready", "PR Ready", githubAvailable ? summary.prReady : null, "GitHub Pull Requests")), githubStamp(metric("ci_success", "CI Success", githubAvailable ? summary.ciSuccess : null, "GitHub Actions")), githubStamp(metric("ci_failure", "CI Failure", githubAvailable ? summary.ciFailure : null, "GitHub Actions"))], operations: [githubStamp(metric("queued", "Queued", githubAvailable ? summary.queued : null, "GitHub Issues")), githubStamp(metric("running", "Running", githubAvailable ? summary.running : null, "GitHub Issues")), githubStamp(metric("blocked", "Blocked", githubAvailable ? summary.blocked : null, "GitHub Issues")), metric("fix_attempts", "Fix Attempts", null, "Engineering Runtime"), lastActivity], currentWork: items.slice(0,5).map((x) => String(x.title)), problems: items.filter((x) => x.status === "BLOCKED").map((x) => String(x.title)), suggestions: [] };
}

export type DepartmentDirectiveDraft = { id: string; department: DepartmentId; instruction: string; goal?: string; priority: "A"|"B"|"C"; deadline: string|null; targetMetric?: { metric: string; direction?: "UP"|"DOWN"; target?: number|null }; status: "DRAFT"; approvedByHuman: false; createdAt: string; interpretation: { suggestedMissionType: string; risk: "R1"|"R2"|"R3"|"R4"; externalAction: boolean; label: "AI interpretation" } };
export const DIRECTIVE_ROUTING: Record<Exclude<DepartmentId, "engineering">, { departmentId: string; requiredAgentId: string; missionType: string; constraints: string[] }> = {
  creator: { departmentId: "personal", requiredAgentId: "personal-note", missionType: "CREATOR_CONTENT", constraints: ["DRAFT_OR_RESEARCH_ONLY", "EXTERNAL_PUBLISH_REQUIRES_SEPARATE_HUMAN_APPROVAL"] },
  fund: { departmentId: "personal", requiredAgentId: "personal-fund", missionType: "FUND_RESEARCH", constraints: ["RESEARCH_ANALYSIS_ONLY", "INVESTMENT_TRADE_R4", "HUMAN_ONLY"] },
  operations: { departmentId: "executive", requiredAgentId: "executive-kaizen", missionType: "COMPANY_KAIZEN", constraints: ["INTERNAL_ONLY"] },
  knowledge: { departmentId: "executive", requiredAgentId: "executive-inbox", missionType: "KNOWLEDGE_CONTEXT", constraints: ["CAPTURE_OR_RESEARCH_ONLY", "PROMOTION_REQUIRES_HUMAN_APPROVAL"] },
  planning: { departmentId: "personal", requiredAgentId: "personal-morning", missionType: "PLANNING_CONTEXT", constraints: ["INTERNAL_ONLY"] },
};
export type DirectiveRouting = (typeof DIRECTIVE_ROUTING)[Exclude<DepartmentId, "engineering">];
const CREATOR_SPECIALISTS = {
  research: { requiredAgentId: "creator-research", missionType: "CREATOR_RESEARCH" },
  content: { requiredAgentId: "creator-content", missionType: "CREATOR_DRAFT" },
  analytics: { requiredAgentId: "creator-kpi", missionType: "CREATOR_KPI_ANALYSIS" },
} as const;

/** 複数の意図語を採点し、同点や曖昧な依頼はLeadへ戻す決定論的router。 */
export function routeCreatorDirective(instruction: string, goal = ""): DirectiveRouting {
  const text = `${instruction} ${goal}`.toLowerCase();
  const rules = {
    research: [/調査/u, /リサーチ/u, /競合/u, /市場/u, /顧客/u, /トレンド/u, /根拠/u, /source/u],
    content: [/下書き/u, /記事/u, /投稿案/u, /構成/u, /タイトル/u, /note/u, /x(?:\s|の)?文/u, /draft/u],
    analytics: [/kpi/u, /分析/u, /数値/u, /収益/u, /roi/u, /ctr/u, /rpm/u, /成果/u, /実績/u],
  } as const;
  const scores = Object.entries(rules).map(([kind, patterns]) => ({ kind: kind as keyof typeof CREATOR_SPECIALISTS, score: patterns.filter((pattern) => pattern.test(text)).length })).sort((a, b) => b.score - a.score);
  if (scores[0].score === 0 || scores[0].score === scores[1].score) return DIRECTIVE_ROUTING.creator;
  const specialist = CREATOR_SPECIALISTS[scores[0].kind];
  return { ...DIRECTIVE_ROUTING.creator, ...specialist };
}
export function draftDirective(input: { department: DepartmentId; instruction: string; goal?: string; priority?: "A"|"B"|"C"; deadline?: string|null; targetMetric?: DepartmentDirectiveDraft["targetMetric"] }): DepartmentDirectiveDraft {
  const instruction = input.instruction.trim(); if (!instruction) throw new Error("INSTRUCTION_REQUIRED");
  const engineering = input.department === "engineering"; const fund = input.department === "fund";
  return { id: `directive-${randomUUID()}`, department: input.department, instruction: instruction.slice(0,2000), goal: input.goal?.trim().slice(0,500), priority: input.priority ?? "B", deadline: input.deadline ?? null, targetMetric: input.targetMetric, status: "DRAFT", approvedByHuman: false, createdAt: new Date().toISOString(), interpretation: { suggestedMissionType: engineering ? "ENGINEERING_REQUEST" : fund ? "FUND_RESEARCH" : `${input.department.toUpperCase()}_MISSION`, risk: engineering ? "R3" : fund ? "R1" : "R1", externalAction: engineering, label: "AI interpretation" } };
}
