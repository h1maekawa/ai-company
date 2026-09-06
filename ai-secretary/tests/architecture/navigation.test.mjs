import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Navigation v2 の情報設計を固定するテスト。
 *
 * 目的は「機能が増えてもフロントの入口が増えない」こと。
 * トップレベルは日常6領域 + 管理1つに保ち、UIから隠したrouteもDeep Linkとして残す。
 */

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const NAVIGATION = "app/lib/config/navigation.ts";

test("top-level navigation stays at 6 daily areas plus one admin entry", () => {
  const source = read(NAVIGATION);
  const primary = source.slice(
    source.indexOf("export const PRIMARY_NAV"),
    source.indexOf("export const ADMIN_NAV")
  );
  const ids = [...primary.matchAll(/^\s{4}id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ["home", "assistant", "today", "content", "investing", "kakei"]);
  assert.match(source, /export const ADMIN_NAV: AppNavItem = \{[\s\S]*href: "\/admin"/);
});

test("primary navigation points at the existing routes", () => {
  const source = read(NAVIGATION);
  for (const href of ["/", "/chat?node=assistant", "/planning", "/note", "/investing", "/kakei"]) {
    assert.ok(source.includes(`href: "${href}"`), `PRIMARY_NAV should link to ${href}`);
  }
  for (const page of [
    "app/page.tsx",
    "app/admin/page.tsx",
    "app/chat/page.tsx",
    "app/planning/page.tsx",
    "app/note/page.tsx",
    "app/investing/page.tsx",
    "app/kakei/page.tsx",
  ]) {
    assert.ok(exists(page), `${page} must exist for navigation to resolve`);
  }
});

test("admin holds the non-daily areas instead of the sidebar", () => {
  const source = read(NAVIGATION);
  for (const href of ["/knowledge", "/connections", "/chat?node=kaizen", "/chat?node=kakei", "/content"]) {
    assert.ok(source.includes(`href: "${href}"`), `ADMIN_SECTIONS should link to ${href}`);
  }
});

test("sidebar renders only the shared navigation config", () => {
  const sidebar = read("components/app-shell/AppSidebar.tsx");
  assert.match(sidebar, /from "@\/app\/lib\/config\/navigation"/);
  // ナビ項目をコンポーネント側に直書きしない（増殖の原因になる）
  assert.doesNotMatch(sidebar, /href="\/(knowledge|connections|content|grill)/);
});

test("routes hidden from the sidebar are still reachable", () => {
  for (const page of [
    "app/content/page.tsx",
    "app/content/layout.tsx",
    "app/knowledge/page.tsx",
    "app/connections/page.tsx",
    "app/grill/page.tsx",
    "app/weekly-review/page.tsx",
  ]) {
    assert.ok(exists(page), `${page} must stay reachable by deep link`);
  }
  const source = read(NAVIGATION);
  for (const href of ["/content", "/knowledge", "/connections", "/grill", "/chat"]) {
    assert.ok(
      source.includes(`{ href: "${href}",`),
      `PRESERVED_ROUTES should document ${href}`
    );
  }
});

test("content department exposes four daily tabs and keeps settings separate", () => {
  const page = read("app/note/page.tsx");
  const nav = page.slice(page.indexOf("const MAIN_NAV = ["), page.indexOf("] as const;"));
  const labels = [...nav.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["今日", "作る", "確認", "成果"]);
  assert.ok(exists("app/note/settings/page.tsx"), "content settings must live on its own route");
  // 作業画面に設定コンポーネントを混ぜない
  assert.doesNotMatch(page, /AutomationSettings|BrandEditor|LineProgram|AffiliateManager/);
});

test("content settings groups into four sections", () => {
  const settings = read("app/note/settings/page.tsx");
  const labels = [...settings.matchAll(/label: "([^"]+)", description:/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["基本設定", "ブランド", "接続", "詳細設定"]);
});

test("investing shows four daily items and folds the rest away", () => {
  const shell = read("components/investing/Shell.tsx");
  const daily = shell.slice(
    shell.indexOf("export const DAILY_NAV_ITEMS"),
    shell.indexOf("export const MORE_NAV_ITEMS")
  );
  const dailyLabels = [...daily.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dailyLabels, ["ダッシュボード", "保有株", "ニュース", "AI分析"]);

  const more = shell.slice(
    shell.indexOf("export const MORE_NAV_ITEMS"),
    shell.indexOf("/** 互換用")
  );
  for (const href of [
    "/investing/allocation",
    "/investing/policy",
    "/investing/portfolio",
    "/investing/screening",
    "/investing/watchlist",
    "/investing/dividends",
    "/investing/transactions",
    "/investing/import",
    "/investing/settings",
  ]) {
    assert.ok(more.includes(`href: "${href}"`), `${href} must stay in the investing menu`);
  }
});

test("user-facing navigation avoids internal jargon", () => {
  const jargon = /official-api|PublishQueue|AutomationSettings|Performance Sync|SSOT|artifact/;
  for (const file of [NAVIGATION, "app/page.tsx", "app/admin/page.tsx", "components/app-shell/AppSidebar.tsx"]) {
    const source = read(file);
    const labels = [...source.matchAll(/(?:label|hint|description|tagline): "([^"]+)"/g)].map((m) => m[1]);
    for (const label of labels) {
      assert.doesNotMatch(label, jargon, `"${label}" exposes internal wording`);
    }
  }
});
