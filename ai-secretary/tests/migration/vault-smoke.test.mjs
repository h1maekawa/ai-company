import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VAULT_ROOT =
  process.env.MIGRATION_VAULT_ROOT || path.resolve(ROOT, "../../ai-company-vault");

const read = (relative) => fs.readFileSync(path.join(VAULT_ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(VAULT_ROOT, relative));
const jsonBlock = (relative) => {
  const match = read(relative).match(/```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, `${relative} must contain an app-managed JSON block`);
  return JSON.parse(match[1]);
};

test("Identity Core Memory is readable", () => {
  assert.match(read("memory/personal/profile.md"), /#/);
  assert.match(read("memory/personal/goals.md"), /#/);
});

test("maemichi brand and content lifecycle stores are readable", () => {
  const brand = jsonBlock("memory/personal/note/brand.md");
  assert.equal(brand.brand.identity.name, "maemichi");
  assert.equal(brand.brand.identity.version, "maemichi-v2");

  assert.ok(Array.isArray(jsonBlock("memory/personal/note/research-inbox.md").items));
  assert.ok(Array.isArray(jsonBlock("memory/personal/note/viewpoint-library.md").viewpoints));
  assert.ok(Array.isArray(jsonBlock("memory/personal/note/experience-library.md").experiences));
  assert.ok(Array.isArray(jsonBlock("memory/personal/note/publishing-history.md").entries));
  assert.ok(Array.isArray(jsonBlock("memory/personal/note/content-performance.md").records));
  assert.ok(exists("memory/personal/note/drafts"));
});

test("Planning history preserves Store-compatible task fields", () => {
  const plan = jsonBlock("memory/personal/planning/2026-08-06.md");
  assert.ok(Array.isArray(plan.tasks));
  assert.ok(Array.isArray(plan.blocks));
  for (const task of plan.tasks) {
    assert.equal(typeof task.title, "string");
    assert.equal(typeof task.minutes, "number");
    assert.equal(typeof task.priority, "number");
  }
  assert.ok(plan.tasks.some((task) => typeof task.carriedFrom === "string"));
});

test("Fund policy and historical records remain separated", () => {
  assert.ok(jsonBlock("memory/personal/fund/policy.md"));
  assert.ok(jsonBlock("memory/personal/fund/capacity.md"));
  assert.match(read("memory/personal/fund/positions.md"), /保有/);
  assert.match(read("memory/personal/fund/portfolio.md"), /ポートフォリオ/);
  assert.match(read("memory/personal/fund/watchlist.md"), /監視/);
  assert.ok(exists("memory/personal/fund/investment-log"));
});

test("Kaizen and Sales schemas are readable without promoting review data", () => {
  assert.match(read("memory/kaizen/2026-07-17.md"), /改善提案/);
  const sales = jsonBlock("memory/company/sales/catalog.md");
  assert.equal(sales.schemaVersion, 1);
  assert.deepEqual(sales.records, []);
  assert.match(read("memory/company/sales/catalog.md"), /Public/);
});
