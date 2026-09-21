import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("Knowledge is a shared top-level foundation, not one of five business Departments", () => {
  const nav = read("app/lib/config/navigation.ts");
  const sidebar = read("components/app-shell/AppSidebar.tsx");
  assert.match(nav, /BUSINESS_DEPARTMENT_IDS = \["creator", "fund", "operations", "planning", "engineering"\]/);
  assert.match(nav, /KNOWLEDGE_NAV[\s\S]*label: "Knowledge"[\s\S]*href: "\/knowledge"/);
  assert.match(sidebar, /BUSINESS_DEPARTMENT_NAV\.map/);
  assert.match(sidebar, /SidebarLink item=\{KNOWLEDGE_NAV\}/);
  assert.match(nav, /id: "knowledge"[\s\S]{0,160}href: "\/ceo\/departments\/knowledge"/, "compatibility route remains registered");
});

test("Quick Memo remains Inbox capture and cannot promote formal Knowledge", () => {
  const memo = read("app/api/company/memo/route.ts");
  assert.match(memo, /captureToInbox/);
  assert.doesNotMatch(memo, /saveKnowledge|promoteCandidate|promoteKnowledge/);
});

test("Creator Registry has a lead and real specialist agents with least privilege", () => {
  const agents = read("app/lib/config/departments.ts");
  const nav = read("app/lib/config/navigation.ts");
  for (const id of ["personal-note", "creator-content", "creator-research", "creator-kpi"]) {
    assert.match(agents, new RegExp(`id: "${id}"`));
    assert.match(nav, new RegExp(`"${id}"`));
  }
  assert.match(agents, /id: "personal-note"[\s\S]{0,120}kind: "manager"/);
  assert.match(agents, /id: "creator-content"[\s\S]*?publish: \{ draft: true \}[\s\S]*?departmentRole: "execution"/);
  assert.doesNotMatch(agents.match(/id: "creator-content"[\s\S]*?skillIds: \["note-draft-format"\]/)?.[0] ?? "", /publish: true/);
  assert.match(agents, /id: "creator-research"[\s\S]*?Knowledge Candidate[\s\S]*?正式Knowledgeへの昇格/);
  assert.match(agents, /id: "creator-kpi"[\s\S]*?観測Factと解釈・提案を分離/);
});

test("Employee workspace is a Registry-derived three-column read model with pinned chat", () => {
  const route = read("app/api/company/departments/[id]/employees/route.ts");
  const ui = read("components/mobile-ceo/EmployeeWorkspace.tsx");
  const chat = read("app/api/chat/route.ts");
  assert.match(route, /departmentRole/);
  assert.match(route, /knowledgeAccess/);
  assert.match(route, /permissions/);
  assert.match(ui, /grid-cols-1[\s\S]*sm:grid-cols-3/);
  assert.match(ui, /employee\.role/);
  assert.match(chat, /department\.employeeIds\.includes\(secretaryId\)/);
});

test("Knowledge candidate skills require human promotion and Skill Registry stays SSOT", () => {
  const skills = read("app/lib/skills/registry.ts");
  const promote = read("app/api/knowledge/promote/route.ts");
  assert.match(skills, /id: "knowledge-candidate-create"/);
  assert.match(skills, /正式KnowledgeではなくCandidate/);
  assert.match(promote, /Human|human|承認/);
});
