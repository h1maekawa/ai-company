import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Home Summary separates idle from unavailable and removes unknown status", () => {
  const route = read("app/api/company/home-summary/route.ts");
  for (const status of ["active", "attention", "idle", "unavailable"]) {
    assert.match(route, new RegExp(`"${status}"`));
  }
  assert.match(route, /execution\.unavailable\s*\?\s*"unavailable"/);
  assert.match(route, /:\s*"idle"/);
  assert.doesNotMatch(route, /status:\s*"unknown"|\|\s*"unknown"/);
});

test("Home status labels are explicit and never use 未取得 as a department status", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  for (const label of ["稼働中", "待機中", "取得中", "確認必要", "取得エラー"]) {
    assert.match(overview, new RegExp(label));
  }
  const statusFunction = overview.match(/function statusOf[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(statusFunction, /未取得/);
  assert.match(overview, /summary\.generatedAt/);
  assert.match(overview, /最終更新/);
});

test("Home keeps horizontal Attention and the selected team path", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  for (const className of ["overflow-x-auto", "snap-x", "shrink-0"]) {
    assert.match(overview, new RegExp(className));
  }
  for (const marker of ["チーム", "部署の詳細", "employees"]) {
    assert.match(overview, new RegExp(marker));
  }
});

test("Home removes duplicate assistant and runtime sections only", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  assert.doesNotMatch(overview, /AI Assistant/);
  assert.doesNotMatch(overview, /AIエージェント稼働状況/);
  assert.match(overview, /\/api\/company\/departments\/\$\{selected\}\/employees/);
});
