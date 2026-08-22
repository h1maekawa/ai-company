import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const indexRecord = await import(path.join(DIST, "knowledge/indexRecord.js"));
const knowledgeTypes = await import(path.join(DIST, "knowledge/types.js"));
const knowledgeWalk = await import(path.join(DIST, "knowledge/walk.js"));
const connections = await import(path.join(DIST, "system/connections.js"));
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("Knowledge Indexは検索metadataと短いsummaryだけを派生し本文SSOTを複製しない", () => {
  const body = "本文".repeat(300);
  const record = indexRecord.knowledgeIndexRecord("memory/knowledge/content/x.md", `---\nid: k1\ndomain: content\ntags: [X, Growth]\nmanaged_by: human\nupdated: 2026-08-22\n---\n# X Growth\n${body}`);
  assert.equal(record.path, "memory/knowledge/content/x.md");
  assert.equal(record.title, "X Growth");
  assert.deepEqual(record.tags, ["X", "Growth"]);
  assert.ok(record.summary.length <= 240);
  assert.equal("body" in record, false);
});

test("nested Knowledge directoryを含む全Markdownを再帰走査し非Markdownを除外する", async () => {
  const tree = {
    "memory/knowledge": [{ name: "content", type: "dir" }, { name: "root.md", type: "file" }, { name: "memo.txt", type: "file" }],
    "memory/knowledge/content": [{ name: "x", type: "dir" }, { name: "note.md", type: "file" }],
    "memory/knowledge/content/x": [{ name: "growth.md", type: "file" }, { name: "asset.png", type: "file" }],
  };
  const store = { listEntries: async (directory) => tree[directory] ?? [] };
  const paths = await knowledgeWalk.listMarkdownPathsRecursively(store, "memory/knowledge");
  assert.deepEqual(paths, ["memory/knowledge/content/note.md", "memory/knowledge/content/x/growth.md", "memory/knowledge/root.md"]);
});

test("Connectionsは5状態を保持しHome alert用集計でunknownを正常扱いしない", () => {
  const statuses = ["connected", "warning", "disconnected", "not_configured", "unknown"];
  const services = statuses.map((status, index) => ({ service: String(index), label: status, icon: "x", status, message: status, lastCheckedAt: new Date().toISOString() }));
  assert.deepEqual(statuses.map(connections.statusLabel), ["正常", "要確認", "接続なし", "未設定", "確認できません"]);
  assert.deepEqual(connections.summarizeConnections(services), { total: 5, healthy: 1, warning: 1, checkedAt: services[4].lastCheckedAt });
});

test("共通SidebarはHUB_NODESをSSOTにしActiveとMobile Drawerを備える", () => {
  const sidebar = read("components/app-shell/AppSidebar.tsx");
  const shell = read("components/app-shell/AppShell.tsx");
  for (const href of ["/", "/knowledge", "/connections"]) assert.match(sidebar, new RegExp(href.replace("/", "\\/")));
  assert.match(sidebar, /HUB_NODES/); assert.match(sidebar, /usePathname/); assert.match(sidebar, /bg-violet-500/);
  assert.match(shell, /aria-expanded/); assert.match(shell, /lg:hidden/); assert.match(shell, /setOpen\(false\)/);
});

test("HomeはDepartment CardsとSystem Healthを表示し異常時だけAlertを出す", () => {
  const home = read("app/page.tsx");
  assert.match(home, /cardIds/); assert.match(home, /System Health/); assert.match(home, /alerts\.length > 0/); assert.match(home, /System Alert/);
  assert.doesNotMatch(home, /DailyPlan|Growth Analytics|Knowledge本文/);
});

test("Knowledge検索はSupabase失敗時にVault fallbackし本文はVaultから取得する", () => {
  const route = read("app/api/knowledge/dashboard/route.ts");
  assert.match(route, /supabaseKnowledgeIndexRepository\.search/);
  assert.match(route, /vaultKnowledgeSearch\.search/);
  assert.match(route, /vaultDocumentStore\.getFile\(detailPath\)/);
  assert.match(route, /高速Indexが利用できないためVault検索を使用中/);
});

test("今週追加KPIは75件hitsや検索Filterではなく全件count/fallbackから算出する", () => {
  const route = read("app/api/knowledge/dashboard/route.ts");
  assert.match(route, /countUpdatedSince\(weekAgo\)/);
  assert.match(route, /readVaultKnowledgeIndexRecords\(\)/);
  assert.doesNotMatch(route, /recent\s*=\s*hits|hits\.filter/);
  assert.ok(route.indexOf("countUpdatedSince(weekAgo)") > route.indexOf("const query"));
});

test("レビュー待ちはHuman未判断のcandidateだけで、capturedや終端statusを含めない", () => {
  assert.equal(knowledgeTypes.isHumanReviewPending("candidate"), true);
  for (const status of ["captured", "promoted", "merged", "rejected", "archived"]) {
    assert.equal(knowledgeTypes.isHumanReviewPending(status), false, status);
  }
  const route = read("app/api/knowledge/dashboard/route.ts");
  assert.match(route, /isHumanReviewPending\(item\.frontmatter\.status\)/);
  assert.doesNotMatch(route, /domain_resolution_required \|\| item\.frontmatter\.conflict_candidates/);
});

test("Candidate UIは既存APIのPromote・Merge Preview・Human Approvalを再利用する", () => {
  const ui = read("components/knowledge/KnowledgeDashboard.tsx");
  assert.match(ui, /api\/knowledge\/candidates|candidates/); assert.match(ui, /api\/knowledge\/promote/); assert.match(ui, /api\/knowledge\/merge-preview/);
  assert.match(ui, /previewToken/); assert.match(ui, /確認しただけではVaultは変更されません/);
});

test("昇格・MergeはVault保存後にIndexを更新し、再同期はreadとupsertだけ", () => {
  const lifecycle = read("app/lib/knowledge/lifecycle.ts");
  const sync = read("app/lib/knowledge/indexSync.ts");
  assert.ok(lifecycle.indexOf("saveKnowledge({") < lifecycle.indexOf("indexKnowledgePathBestEffort(saved.path)"));
  assert.ok(lifecycle.indexOf("saveFile(targetPath") < lifecycle.indexOf("indexKnowledgePathBestEffort(targetPath)"));
  assert.match(sync, /listMarkdownPathsRecursively/); assert.match(sync, /vaultDocumentStore\.getFile/); assert.match(sync, /\.upsert\(records\)/);
  assert.doesNotMatch(sync, /saveFile|delete|rename|move/);
});

test("Connections Knowledge件数は同期済みIndexを優先しVault fallbackも再帰総数を使う", () => {
  const health = read("app/lib/system/health.ts");
  const ui = read("components/connections/ConnectionsDashboard.tsx");
  assert.match(health, /indexStatus\?\.status === "connected"/);
  assert.match(health, /supabaseKnowledgeIndexRepository\.count\(\)/);
  assert.match(health, /readVaultKnowledgeIndexRecords\(\)/);
  assert.doesNotMatch(health, /listFiles\("memory\/knowledge"\)/);
  assert.match(ui, /service\.itemCount!=null/);
});

test("Connection testはread-onlyで7サービスを判定する", () => {
  const health = read("app/lib/system/health.ts"); const route = read("app/api/system/connections/route.ts");
  for (const service of ["vault","github","supabase","redis","buffer","note_runner","slack"]) assert.match(health, new RegExp(`\\"${service}\\"`));
  assert.match(route, /GET/); assert.match(route, /POST/); assert.doesNotMatch(route, /save|createPost|postToSlack|delete/i);
});

test("Supabase migrationはPhase 1テーブル・検索Index・RLSを定義する", () => {
  const sql = read("supabase/migrations/202608220001_knowledge_connections_phase1.sql");
  assert.match(sql, /create table if not exists public\.knowledge_index/); assert.match(sql, /create table if not exists public\.system_sync_status/);
  assert.match(sql, /knowledge_index_tags_idx/); assert.match(sql, /enable row level security/g); assert.doesNotMatch(sql, /create policy/);
});
