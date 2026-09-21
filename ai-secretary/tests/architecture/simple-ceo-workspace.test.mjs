import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

test("root is the single Simple CEO Dashboard and /ceo redirects", () => {
  const home = read("app/page.tsx");
  const legacy = read("app/ceo/page.tsx");
  assert.match(home, /AssistantPrompt/);
  assert.match(home, /DepartmentOverview/);
  assert.doesNotMatch(home, /QUICK_ACTIONS|CompanyOfficeOverview|最近の動き|システム状態/);
  assert.match(legacy, /redirect\("\/"\)/);
  assert.ok(!exists("components/mobile-ceo/CeoDashboard.tsx"));
});

test("Department registry is the SSOT for labels, routes and six cards", () => {
  const navigation = read("app/lib/config/navigation.ts");
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  for (const [id, label] of [["creator","note・X"],["fund","株式"],["operations","AI会社改善"],["knowledge","知識・メモ"],["planning","今日・予定"],["engineering","開発"]]) {
    assert.match(navigation, new RegExp(`id: "${id}", label: "${label}"`));
    assert.match(navigation, new RegExp(`href: "/ceo/departments/${id}"`));
  }
  assert.match(overview, /DEPARTMENT_NAV\.map/);
  assert.doesNotMatch(overview, /Creator|Fund Intelligence|Operations|Engineering/);
});

test("Home only surfaces critical system failures through CEO Attention", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  assert.match(overview, /\["disconnected", "error"\]/);
  assert.match(overview, /CEO Attention/);
  assert.doesNotMatch(overview, /healthy.*total.*正常/);
});

test("Department workspace separates question from confirmed Directive", () => {
  const chatUi = read("components/mobile-ceo/DepartmentChat.tsx");
  const page = read("components/mobile-ceo/DepartmentPage.tsx");
  const chatApi = read("app/api/chat/route.ts");
  assert.match(chatUi, /質問はMissionを作らず/);
  assert.match(chatUi, /Directiveとして確認/);
  assert.match(page, /confirmedByHuman: true/);
  assert.match(page, /draftId: draft\.id/);
  assert.match(chatApi, /Current Department Read Model/);
  assert.match(chatApi, /directiveSuggestion/);
  assert.match(chatApi, /departmentId && \(dispatch\.dispatched \|\| isDepartmentDirective/);
  assert.match(chatApi, /else if \(dispatch\.dispatched\)/);
});

test("Department Chat routes to existing agents and retains safety boundaries", () => {
  const navigation = read("app/lib/config/navigation.ts");
  const chatApi = read("app/api/chat/route.ts");
  for (const agent of ["personal-note", "personal-fund", "executive-kaizen", "executive-inbox", "personal-morning"]) assert.ok(navigation.includes(`secretaryId: "${agent}"`));
  assert.match(chatApi, /証券注文・自動売買は絶対に行わず/);
  assert.match(chatApi, /外部公開は別のHuman Approval/);
  assert.match(chatApi, /main push・auto merge・production deploy/);
});

test("existing routes and Pixel Office employee mappings remain available", () => {
  for (const route of ["note","content","investing","planning","knowledge","company","admin","chat","grill"]) assert.ok(exists(`app/${route}/page.tsx`));
  const mapping = read("app/lib/config/navigation.ts");
  const card = read("components/company/office/EmployeeMiniCard.tsx");
  for (const agent of ["personal-note","personal-fund","executive-kaizen","executive-inbox","personal-morning","executive-assistant"]) assert.ok(mapping.includes(`"${agent}"`));
  assert.match(card, /AGENT_DEPARTMENT_HREF/);
  assert.match(card, /<Link href=\{href\}/);
  assert.match(card, />詳細</);
});

test("375px workspace avoids fixed wide content and keeps 44px controls", () => {
  const files = ["app/page.tsx","app/ceo/departments/[id]/page.tsx","components/mobile-ceo/DepartmentPage.tsx","components/mobile-ceo/DepartmentChat.tsx"].map(read).join("\n");
  assert.doesNotMatch(files, /min-w-\[(?:376|[4-9]\d\d)px\]/);
  assert.match(files, /overflow-x-hidden/);
  assert.match(files, /min-h-11/);
});
