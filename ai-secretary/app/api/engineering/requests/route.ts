import { NextRequest, NextResponse } from "next/server";
import { classifyRisk } from "@/app/lib/engineering/security";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const repository = () => process.env.ENGINEERING_REPOSITORY || "h1maekawa/ai-company";
const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function github(path: string, init?: RequestInit) {
  const credential = token();
  if (!credential) throw new Error("GITHUB_CREDENTIAL_UNAVAILABLE");
  return fetch(`https://api.github.com/repos/${repository()}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${credential}`, "x-github-api-version": "2022-11-28", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

export async function GET() {
  if (!token()) return NextResponse.json({ available: false, items: null, reason: "GITHUB_CREDENTIAL_UNAVAILABLE" });
  try {
    const [issueResponse, pullResponse, runResponse] = await Promise.all([
      github("/issues?state=open&labels=ai-engineering&per_page=100"),
      github("/pulls?state=open&per_page=100"),
      github("/actions/runs?per_page=100"),
    ]);
    if (!issueResponse.ok) return NextResponse.json({ available: false, items: null, reason: "GITHUB_UNAVAILABLE" });
    const issues = (await issueResponse.json() as Array<Record<string, unknown>>).filter((item) => !item.pull_request);
    const pulls = pullResponse.ok ? await pullResponse.json() as Array<Record<string, unknown>> : null;
    const runsPayload = runResponse.ok ? await runResponse.json() as { workflow_runs?: Array<Record<string, unknown>> } : null;
    const labelNames = (issue: Record<string, unknown>) => (Array.isArray(issue.labels) ? issue.labels : []).map((label) => typeof label === "string" ? label : String((label as Record<string, unknown>).name ?? ""));
    const status = (issue: Record<string, unknown>) => { const labels = labelNames(issue); if (labels.includes("blocked")) return "BLOCKED"; if (labels.includes("ai-running")) return "RUNNING"; return "QUEUED"; };
    const relevantPulls = pulls?.filter((pull) => String((pull.head as Record<string, unknown> | undefined)?.ref ?? "").startsWith("ai/issue-")) ?? null;
    const relevantRuns = runsPayload?.workflow_runs?.filter((run) => String(run.head_branch ?? "").startsWith("ai/issue-")) ?? null;
    const timestamps = [...issues.map((item) => String(item.updated_at ?? "")), ...(relevantPulls ?? []).map((item) => String(item.updated_at ?? "")), ...(relevantRuns ?? []).map((item) => String(item.updated_at ?? item.run_started_at ?? ""))].filter(Boolean).sort();
    const lastActivity = timestamps[timestamps.length - 1] ?? null;
    return NextResponse.json({
      available: true,
      items: issues.map((item) => ({ issueNumber: item.number, title: item.title, status: status(item), labels: item.labels, htmlUrl: item.html_url, updatedAt: item.updated_at })),
      summary: {
        queued: issues.filter((item) => status(item) === "QUEUED").length,
        running: issues.filter((item) => status(item) === "RUNNING").length,
        blocked: issues.filter((item) => status(item) === "BLOCKED").length,
        prReady: relevantPulls ? relevantPulls.filter((pull) => pull.draft !== true).length : null,
        ciSuccess: relevantRuns ? relevantRuns.filter((run) => run.conclusion === "success").length : null,
        ciFailure: relevantRuns ? relevantRuns.filter((run) => run.conclusion === "failure").length : null,
        lastActivity,
      },
    });
  } catch { return NextResponse.json({ available: false, items: null, reason: "GITHUB_UNAVAILABLE" }); }
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!token()) return NextResponse.json({ error: "GITHUB_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.confirmedByHuman !== true) return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (!title || !goal) return NextResponse.json({ error: "TITLE_AND_GOAL_REQUIRED" }, { status: 400 });
    const taskType = ["feature", "bug", "test", "refactor", "docs"].includes(String(body.taskType)) ? String(body.taskType) : "feature";
    const priority = ["low", "medium", "high"].includes(String(body.priority)) ? String(body.priority) : "medium";
    const issueBody = `## Goal\n${goal}\n\n## Acceptance Criteria\n${String(body.acceptanceCriteria ?? "Human review and CI pass")}\n\nCreated from Mobile CEO Control Tower after explicit human confirmation.`;
    const risk = classifyRisk({ title, body: issueBody, labels: [`type:${taskType}`, `priority:${priority}`] });
    if (risk === "PROTECTED") return NextResponse.json({ error: "HUMAN_SECURITY_REVIEW_REQUIRED", risk }, { status: 422 });
    const key = req.headers.get("idempotency-key");
    if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
    const store = getExecutionStore();
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("mobile-engineering-request", key);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("mobile-engineering-request", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    const response = await github("/issues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body: issueBody, labels: ["ai-engineering", "ai-ready", `type:${taskType}`, `priority:${priority}`] }) });
    if (!response.ok) return NextResponse.json({ error: "GITHUB_ISSUE_CREATE_FAILED" }, { status: 502 });
    const issue = await response.json() as { number: number; html_url: string };
    const result = { ok: true, issue: { number: issue.number, url: issue.html_url }, risk, humanConfirmed: true };
    await store.completeIdempotency("mobile-engineering-request", key, result);
    return NextResponse.json(result, { status: 201 });
  } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
}
