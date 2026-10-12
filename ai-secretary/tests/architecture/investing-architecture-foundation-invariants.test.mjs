import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

const INVESTING_SKILL_IDS = [
  "market-hypothesis",
  "long-term-demand",
  "market-structure",
  "picks-and-shovels",
  "bottleneck-discovery",
  "causal-distance",
  "candidate-company-discovery",
  "fundamental-research",
  "valuation-research",
  "risk-research",
  "short-term-analysis",
  "mid-term-analysis",
  "long-term-analysis",
  "opportunity-decision",
  "performance-review",
  "investment-learning",
];

test("Investment Thinking Model v1 document exists and states Human Gate / No Auto Trade", () => {
  const doc = read("docs/INVESTMENT_THINKING_MODEL.md");
  assert.match(doc, /Investment Thinking Model v1/);
  assert.match(doc, /HUMAN_ONLY/);
  assert.match(doc, /No Auto Trade/);
  assert.doesNotMatch(doc, /placeOrder|autoBuy|autoSell|broker\.execute/i);
});

test("Investment Department structure document maps all 7 logical departments to existing code", () => {
  const doc = read("docs/INVESTMENT_DEPARTMENT_STRUCTURE.md");
  for (const marker of ["① Market & Theme Research", "② Company Research", "③ Opportunity Intelligence", "④ Portfolio Intelligence", "⑤ Watchlist / Opportunity Pipeline", "⑥ Decision & Learning", "⑦ Data / Provider Health"]) {
    assert.match(doc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("skills/investing/README.md and SKILL_SCHEMA.md exist and restate the Human Gate / No Auto Trade rule", () => {
  const readme = read("../skills/investing/README.md");
  assert.match(readme, /Human Gate/);
  assert.match(readme, /No Auto Trade/);
  assert.match(readme, /HUMAN_ONLY/);
  const schema = read("../skills/investing/SKILL_SCHEMA.md");
  assert.match(schema, /Human Gate/);
  assert.match(schema, /Prohibited/);
});

test("every one of the 16 investing Skills has a SKILL.md with the required schema sections", () => {
  for (const id of INVESTING_SKILL_IDS) {
    const doc = read(`../skills/investing/${id}/SKILL.md`);
    assert.match(doc, new RegExp(`id: ${id}`), `${id}: frontmatter id mismatch`);
    for (const section of ["## Purpose", "## Reuses", "## Human Gate", "## Prohibited", "## Status"]) {
      assert.match(doc, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${id}: missing section ${section}`);
    }
    assert.doesNotMatch(doc, /placeOrder|autoBuy|autoSell|broker\.execute/i, `${id}: must not describe an execution path`);
  }
});

test("all 16 investing Skills are registered in SKILL_REGISTRY as planned, personal-fund-scoped", () => {
  const registry = read("app/lib/skills/registry.ts");
  for (const id of INVESTING_SKILL_IDS) {
    const entryMatch = registry.match(new RegExp(`id: "${id}"[\\s\\S]{0,400}?status: "(planned|implemented)"`));
    assert.ok(entryMatch, `${id}: not found in SKILL_REGISTRY`);
    assert.equal(entryMatch[1], "planned", `${id}: must stay "planned" in PR-A (no run() implementation added)`);
  }
  // Every investing entry must be scoped to the existing personal-fund secretary, not a new one.
  const investingBlockStart = registry.indexOf('id: "market-hypothesis"');
  assert.ok(investingBlockStart > -1);
  const investingBlock = registry.slice(investingBlockStart);
  assert.doesNotMatch(investingBlock, /allowedSecretaries:\s*\[\s*\]/, "no investing skill may be unscoped");
});

test("no investing Skill has a run() implementation added in implementationRegistry.ts", () => {
  const impl = read("app/lib/skills/implementationRegistry.ts");
  for (const id of INVESTING_SKILL_IDS) {
    assert.doesNotMatch(impl, new RegExp(`["'\`]${id}["'\`]`), `${id}: must not have a registered implementation in PR-A`);
  }
});

test("PR-A does not wire the X / note bridge to the new Skill registry or Skill playbooks", () => {
  const xBridge = read("app/lib/note/investing/xBridge.ts");
  const learningBrief = read("app/lib/note/investing/learningBrief.ts");
  assert.doesNotMatch(xBridge, /skills\/investing|SKILL_REGISTRY|lib\/skills\/registry/);
  assert.doesNotMatch(learningBrief, /skills\/investing|SKILL_REGISTRY|lib\/skills\/registry/);
});
