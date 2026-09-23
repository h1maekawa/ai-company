import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

/* ─── Creator ─────────────────────────────────── */

test("Creator Control Center keeps the four menu routes and orders CEO確認 → AI社員 → KPI → Research", () => {
  const creator = read("components/mobile-ceo/CreatorDepartmentControl.tsx");
  for (const href of ["/note", "/note?view=review", "/content", "/note/settings"]) assert.ok(creator.includes(`href: "${href}"`));
  const order = ["<CreatorQuickNavigation />", "<DepartmentAttention", "<EmployeeWorkspace", "<DepartmentKpiPanel", "<DepartmentResearchSummary"].map((token) => creator.indexOf(token));
  assert.ok(order.every((index) => index >= 0), "all Creator sections must exist");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Creator sections must follow the CEO priority order");
});

test("Research detail is not a primary long list on Creator / Fund tops", () => {
  const page = read("components/mobile-ceo/DepartmentPage.tsx");
  const control = page.slice(page.indexOf('if (id === "creator" || id === "fund")'), page.indexOf("return <div className=\"space-y-4\">\n    {id === \"engineering\""));
  // 本文リストは「その他」の折りたたみ内だけ
  assert.match(control, /<Section title="その他">[\s\S]*最新Research（本文）[\s\S]*<ResearchList/);
  assert.match(control, /事業機会（担当Missionではありません）/);
  assert.match(control, /<Section title="その他">[\s\S]*\{conversation\}/);
  assert.match(page, /const conversation = <><DepartmentChat/);
  const summary = read("components/mobile-ceo/DepartmentResearchSummary.tsx");
  assert.doesNotMatch(summary, /item\.summary/, "Research Summary must not render research bodies");
});

test("Revenue UNKNOWN alone is not promoted to CEO確認, backend availability unchanged", () => {
  const model = read("app/lib/mobile-ceo/departments.ts");
  assert.doesNotMatch(model, /Revenue data is missing/);
  assert.match(model, /creatorRevenueAttention/);
  assert.match(model, /metric\("revenue", "Revenue", revenue, "Revenue Ledger", "円", outcome\.revenueStatus\)/);
});

test("Employee utilization is derived from current Mission state and excludes WAITING_APPROVAL", () => {
  const ui = read("components/mobile-ceo/EmployeeUtilization.tsx");
  const workspace = read("components/mobile-ceo/EmployeeWorkspace.tsx");
  assert.match(ui, /現在のMission状態から算出/);
  assert.match(workspace, /<EmployeeUtilizationSummary/);
  assert.ok(workspace.indexOf("<EmployeeUtilizationSummary") < workspace.indexOf("employees.map((employee) => <button"), "summary must precede employee cards");
});

/* ─── Human Approval ─────────────────────────── */

test("Skill Proposal decisions never implement code, mutate the registry or start engineering", () => {
  const improvement = read("app/api/company/skill-improvements/[id]/decision/route.ts");
  const candidate = read("app/api/company/skill-candidates/[id]/decision/route.ts");
  for (const route of [improvement, candidate]) {
    assert.match(route, /isSameOriginMutation/);
    assert.match(route, /idempotency-key/);
    assert.match(route, /appendHumanDecisionFeedback/);
    assert.doesNotMatch(route, /SKILL_REGISTRY|registerSkill|createIssue|octokit|writeFile/);
  }
  assert.match(improvement, /codeChanged: false, registryChanged: false, engineeringStarted: false/);
  assert.match(improvement, /executable: false as const, registryMutationAllowed: false as const, engineeringHandoffAllowed: false as const/);
  assert.match(candidate, /engineeringStarted: false, registryChanged: false/);
});

test("Department Skill Proposals are selected by allowedSecretaries intersection, not keywords", () => {
  const route = read("app/api/company/departments/[id]/control/route.ts");
  assert.match(route, /departmentSkillIds\(skills, department\.employeeIds\)/);
  assert.doesNotMatch(route, /includes\("creator"\)|\/creator\/i|note\|x/);
});

test("KPI goals and Constitution decisions require human confirmation and never touch Policy", () => {
  const route = read("app/api/company/departments/[id]/control/route.ts");
  assert.match(route, /confirmedByHuman !== true/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /claimIdempotency\("department-control"/);
  assert.match(route, /policyChanged: false/);
  assert.doesNotMatch(route, /savePolicy|writeVaultFile|policy\.ts/);
  const learning = read("app/investing/learning/page.tsx");
  assert.doesNotMatch(learning, /method: "PUT"|savePolicy/);
  assert.match(learning, /confirmedByHuman: true/);
});

test("Creator and Fund reuse one Human Decision component", () => {
  const attention = read("components/mobile-ceo/DepartmentAttention.tsx");
  const learning = read("app/investing/learning/page.tsx");
  assert.match(attention, /from "\.\/HumanDecision"/);
  assert.match(learning, /from "@\/components\/mobile-ceo\/HumanDecision"/);
  assert.match(learning, /SkillProposalList/);
  assert.equal((read("components/mobile-ceo/HumanDecision.tsx").match(/export function HumanDecisionPanel/g) ?? []).length, 1);
});

/* ─── Fund / Investment ──────────────────────── */

test("Fund hub shows Portfolio value from the Portfolio SSOT and the five Investment areas", () => {
  const fund = read("components/mobile-ceo/FundDepartmentControl.tsx");
  assert.match(fund, /find\("portfolio_value"\)/);
  assert.match(fund, /find\("unrealized_pl"\)/);
  assert.doesNotMatch(fund, /2,?101,?4\d\d/);
  for (const href of ["/investing", "/investing/research", "/investing/companies", "/investing/portfolio", "/investing/learning", "/investing/settings"]) assert.ok(fund.includes(`href: "${href}"`) || fund.includes(`href="${href}"`), href);
  assert.doesNotMatch(fund, />[^<]*(買う|売る|注文する|BUY|SELL)[^<]*<\/(button|Link)>/);
});

test("fund-research is registered under the Fund department without trade authority", () => {
  const agents = read("app/lib/config/departments.ts");
  const navigation = read("app/lib/config/navigation.ts");
  const block = agents.slice(agents.indexOf('id: "fund-research"'), agents.indexOf("skillIds: []", agents.indexOf('id: "fund-research"')));
  assert.match(block, /permissions: permissions\(\{ web: \{ search: true \}, vault: \{ read: true, write: true \} \}\)/);
  assert.doesNotMatch(block, /publish|github|notify/);
  assert.match(block, /departmentRole: "research"/);
  assert.match(navigation, /employeeIds: \["personal-fund", "fund-research"\]/);
  assert.match(navigation, /DEPARTMENT_IDS = \["creator", "fund", "operations", "knowledge", "planning", "engineering"\] as const/);
  assert.match(read("app/lib/company/departmentGoals.ts"), /agentIds: \["personal-fund", "fund-research"\]/);
  // 存在しないSkill IDを登録しない
  assert.doesNotMatch(read("app/lib/skills/registry.ts"), /company-analysis|valuation-analysis|risk-analysis|investment-thesis/);
});

test("Financial HUMAN_ONLY and INVESTMENT_TRADE_R4 remain unchanged", () => {
  const model = read("app/lib/mobile-ceo/departments.ts");
  const types = read("app/lib/company/execution/actionTypes.ts");
  assert.match(model, /executionAuthority: "HUMAN_ONLY", aiExecutionAllowed: false/);
  assert.match(model, /"INVESTMENT_TRADE_R4", "HUMAN_ONLY"/);
  assert.match(types, /INVESTMENT_TRADE[\s\S]*R4/);
});

test("Investment routes exist and legacy investing routes are preserved", () => {
  for (const page of ["research", "companies", "companies/[ticker]", "portfolio", "learning"]) assert.ok(exists(`app/investing/${page}/page.tsx`), page);
  for (const page of ["holdings", "holdings/[code]", "news", "analysis", "allocation", "policy", "screening", "watchlist", "dividends", "transactions", "import", "settings"]) assert.ok(exists(`app/investing/${page}/page.tsx`), page);
});

test("Company detail never fabricates Skill output and has no trade buttons", () => {
  const detail = read("app/investing/companies/[ticker]/page.tsx");
  for (const title of ["Investment Thesis", "Company Analysis", "Financials", "Earnings", "Valuation", "Risk", "Evidence", "Unknowns"]) assert.ok(detail.includes(`title="${title}"`), title);
  assert.match(detail, /SKILL_MISSING/);
  assert.doesNotMatch(detail, /fetch\("\/api\/(chat|investing\/analysis)/, "must not call an LLM to fill missing sections");
  assert.doesNotMatch(detail, />[^<]*(買う|売る|注文する|BUY|SELL)[^<]*<\/(button|Link)>/);
});

test("Home stock card uses yen formatting, 未取得 and real Thesis alerts only", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  assert.match(overview, /formatMetricValue/);
  assert.doesNotMatch(overview, /"UNKNOWN"/);
  assert.match(overview, /thesis_alerts/);
  assert.match(read("app/lib/config/navigation.ts"), /homeMetrics: \["portfolio_value", "unrealized_pl", "thesis_alerts"\]/);
  assert.doesNotMatch(overview, /MU 決算|changePct/);
});
