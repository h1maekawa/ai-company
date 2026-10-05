import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Navigation v3 の情報設計を固定するテスト。
 *
 * 目的は「機能が増えてもフロントの入口が増えない」こと。
 * トップレベルはHome / Investing / Assets / Settingsに保ち、UIから隠したrouteもDeep Linkとして残す。
 */

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const NAVIGATION = "app/lib/config/navigation.ts";

test("desktop navigation uses only Home/Investing/Assets plus Settings", () => {
  const source = read(NAVIGATION);
  const primary = source.slice(
    source.indexOf("export const PRIMARY_NAV"),
    source.indexOf("export const ADMIN_NAV")
  );
  const ids = [...primary.matchAll(/^\s{4}id: "([a-z-]+)",$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ["home", "investing", "assets"]);
  for (const id of ["creator", "fund", "operations", "knowledge", "planning", "engineering"]) {
    assert.match(source, new RegExp(`id: "${id}"[\\s\\S]{0,180}href: "/ceo/departments/${id}"`));
  }
  assert.match(source, /export const ADMIN_NAV: AppNavItem = \{[\s\S]*href: "\/admin"/);
  assert.match(source, /BUSINESS_DEPARTMENT_IDS = \["creator", "fund", "operations", "planning", "engineering"\]/);
  assert.match(source, /KNOWLEDGE_NAV[\s\S]*href: "\/knowledge"/);
});

test("primary navigation points at the four daily routes", () => {
  const source = read(NAVIGATION);
  for (const href of ["/", "/investing", "/assets", "/admin"]) {
    assert.ok(source.includes(`href: "${href}"`), `PRIMARY_NAV should link to ${href}`);
  }
  for (const page of [
    "app/page.tsx",
    "app/admin/page.tsx",
    "app/chat/page.tsx",
    "app/planning/page.tsx",
    "app/note/page.tsx",
    "app/investing/page.tsx",
    "app/assets/page.tsx",
  ]) {
    assert.ok(exists(page), `${page} must exist for navigation to resolve`);
  }
});

test("mobile shell uses the same four destinations and keeps the floating AI", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  const overlay = read("components/app-shell/WorkspaceOverlays.tsx");
  assert.match(shell, /\.\.\.PRIMARY_NAV, ADMIN_NAV/);
  for (const id of ["home", "investing", "assets", "admin"]) assert.ok(shell.includes(`${id}:`));
  assert.doesNotMatch(shell, /id: "(?:today|work)"/);
  assert.match(overlay, /aria-label="AIを開く"/);
  for (const label of ["AIに聞く", "調べる", "メモする", "実行依頼", "昨日の活動"]) assert.ok(overlay.includes(label));
});

test("Home shows action cards and factual yesterday activity without generating content", () => {
  const home = read("components/mobile-ceo/DepartmentOverview.tsx");
  const summary = read("app/api/company/home-summary/route.ts");
  assert.match(home, /overflow-x-auto/);
  assert.match(home, /aria-pressed=\{selected === id\}/);
  assert.match(home, /yesterday-summary/);
  assert.match(home, /AIエージェント稼働状況/);
  assert.match(summary, /loadExecutionState\(\)/);
  assert.match(summary, /completedAt/);
  assert.match(summary, /decidedAt/);
  assert.doesNotMatch(summary, /callAI|generateText|method:\s*"POST"/);
});

test("admin holds the non-daily areas instead of the sidebar", () => {
  const source = read(NAVIGATION);
  for (const href of ["/knowledge", "/connections", "/chat?node=kaizen", "/chat?node=kakei", "/content"]) {
    assert.ok(source.includes(`href: "${href}"`), `ADMIN_SECTIONS should link to ${href}`);
  }
});

test("sidebar renders only the four shared navigation entries", () => {
  const sidebar = read("components/app-shell/AppSidebar.tsx");
  assert.match(sidebar, /from "@\/app\/lib\/config\/navigation"/);
  assert.doesNotMatch(sidebar, /BUSINESS_DEPARTMENT_NAV|KNOWLEDGE_NAV|WORK_NAV|OPEN_MEMO_EVENT/);
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
  for (const href of ["/note", "/note/settings", "/content", "/investing", "/assets", "/company", "/knowledge", "/planning", "/chat", "/ceo/work", "/ceo/actions", "/ceo/approvals", "/ceo/departments/*", "/connections", "/admin", "/admin/system-map", "/weekly-review", "/grill"]) {
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
  assert.doesNotMatch(settings, /投稿の最終確認は必ず前川さんが行います/);
  assert.match(settings, /AUTOPILOTはSafety \/ Fact Gateを通過した通常投稿を自動予約・投稿/);
  assert.match(settings, /Human Gate対象だけ人間が確認します/);
});

test("creator department exposes the canonical content workflow", () => {
  const navigation = read(NAVIGATION);
  const department = read("components/mobile-ceo/DepartmentPage.tsx");
  const creator = read("components/mobile-ceo/CreatorDepartmentControl.tsx");
  const monitor = read("components/note/AutomationMonitor.tsx");

  assert.match(navigation, /id: "creator"[\s\S]{0,180}href: "\/ceo\/departments\/creator"/);
  for (const href of ["/note", "/note?view=review", "/content", "/note/settings"]) {
    assert.ok(creator.includes(`href: "${href}"`), `Creator should link to ${href}`);
  }
  assert.match(creator, /<CreatorQuickNavigation \/>/);
  assert.match(department, /id === "creator" \? <CreatorDepartmentControl/);
  assert.match(department, /id === "creator" \? "詳細分析を開く" : "詳細を見る"/);

  assert.match(monitor, /href="\/note\/settings"/);
  assert.match(monitor, /href="\/note\?view=review"/);
  assert.doesNotMatch(monitor, /href="\/content\/(?:x|settings)"/);
  assert.match(monitor, /投稿案の生成は毎朝7:10（JST）に走ります。/);
  assert.doesNotMatch(monitor, /毎朝8時/);

  for (const page of ["app/content/x/page.tsx", "app/content/settings/page.tsx"]) {
    assert.ok(exists(page), `${page} must remain available as a legacy route`);
  }
});

test("Home exposes the Content executive dashboard without adding a fifth top navigation item", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  const dashboard = read("app/content/page.tsx");
  const homeApi = read("app/api/content/home/route.ts");
  assert.match(overview, /id === "creator" \? item\.detailHref : item\.href/);
  assert.match(overview, /事業ダッシュボード/);
  for (const href of ["/content", "/note?view=create", "/note?view=review", "/note?view=results", "/note/settings"]) assert.ok(dashboard.includes(`href="${href}"`), href);
  for (const label of ["経営ダッシュボード", "Automation & Queue", "Growth Intelligence", "Comparable Evidence", "Pipeline", "AIの状態"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /INSUFFICIENT_DATA/);
  assert.doesNotMatch(dashboard, /competitor.*(?:text|excerpt)|textExcerpt/i);
  assert.match(homeApi, /buildContentDashboardGrowth/);
  const sidebar = read("components/app-shell/AppSidebar.tsx");
  assert.doesNotMatch(sidebar, /href="\/content"/);
});

test("Home makes SNS and Content discoverable without inventing missing metrics", () => {
  const overview = read("components/mobile-ceo/DepartmentOverview.tsx");
  const navigation = read(NAVIGATION);
  const homeSummary = read("app/api/company/home-summary/route.ts");
  const homeAttention = read("app/lib/company/homeAttention.ts");
  for (const label of ["SNS / コンテンツ", "投稿予定", "確認待ち", "直近7日 Impressions", "Growth Intelligence", "Automation"]) assert.match(overview, new RegExp(label));
  assert.match(overview, /DEPARTMENT_NAV_BY_ID\.creator\.detailHref/);
  assert.match(overview, /QUICK_ACTIONS\.find\(\(action\) => action\.id === "write"\)/);
  assert.match(overview, /reviewCount === "number" && reviewCount > 0/);
  assert.match(overview, /value == null\) return "—"/);
  assert.doesNotMatch(overview, /queue\?\.scheduled\s*\?\?\s*0|queue\?\.review\s*\?\?\s*0|impressions7d\s*\?\?\s*0/);
  assert.match(navigation, /id: "write"[\s\S]{0,120}href: "\/note\?view=create"/);
  assert.match(homeSummary, /content: \{ automation: extra\.contentStatus \}/);
  assert.match(homeAttention, /contentStatus = \{ effective: content\.value\.effective, mode: content\.value\.mode \}/);
  assert.doesNotMatch(overview, /fetch\("\/api\/note\/automation\/status"/);
});

test("investing shows the five Investment areas and keeps every legacy route in the menu", () => {
  const shell = read("components/investing/Shell.tsx");
  const daily = shell.slice(
    shell.indexOf("export const DAILY_NAV_ITEMS"),
    shell.indexOf("export const MORE_NAV_ITEMS")
  );
  const dailyLabels = [...daily.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dailyLabels, ["注目", "ウォッチ", "保有銘柄", "Research", "News"]);
  const dailyHrefs = [...daily.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dailyHrefs, ["/investing", "/investing/watchlist", "/investing/holdings", "/investing/research", "/investing/news"]);

  const more = shell.slice(
    shell.indexOf("export const MORE_NAV_ITEMS"),
    shell.indexOf("export const NAV_ITEMS")
  );
  for (const href of [
    "/investing/companies",
    "/investing/learning",
    "/investing/analysis",
    "/investing/allocation",
    "/investing/policy",
    "/investing/screening",
    "/investing/dividends",
    "/investing/transactions",
    "/investing/import",
    "/investing/settings",
  ]) {
    assert.ok(more.includes(`href: "${href}"`), `${href} must stay in the investing menu`);
  }
  for (const page of ["market", "opportunities", "opportunities/[id]", "research", "companies", "companies/[ticker]", "portfolio", "learning", "holdings", "holdings/[code]", "news", "analysis", "allocation", "policy", "screening", "watchlist", "dividends", "transactions", "import", "settings"]) {
    assert.ok(exists(`app/investing/${page}/page.tsx`), `/investing/${page} must exist`);
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
