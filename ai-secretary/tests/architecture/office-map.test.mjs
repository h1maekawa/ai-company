import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const exists = (file) => fs.existsSync(path.join(ROOT, file));

const PROTECTED_IMPORT_PATTERN = /from ["']@\/app\/lib\/(investing|fund|note|content\/creator-thinking)\//;

test("Office Map route exists and is a Presentation Layer over existing read models only", () => {
  assert.ok(exists("app/company/office-map/page.tsx"), "dedicated /company/office-map route must exist");
  const page = read("app/company/office-map/page.tsx");
  const officeMap = read("components/company/office-map/OfficeMap.tsx");
  const roomModel = read("components/company/office-map/roomModel.ts");

  // 既存の /company は置き換えない
  assert.match(page, /AI Company（リスト・承認）へ/);

  // データは既存read modelの再利用だけ。新しいstoreやAPI routeは作らない
  assert.match(officeMap, /from "..\/office\/useCompanyOffice"/);
  assert.match(officeMap, /fetch\("\/api\/company\/home-summary"/);
  assert.match(officeMap, /fetch\("\/api\/system\/connections"/);
  assert.ok(!exists("app/api/company/office-map"), "Office Map must not introduce a new API route / second SSOT");

  assert.match(roomModel, /from "@\/app\/lib\/config\/navigation"/);
  assert.match(roomModel, /from "@\/app\/lib\/company\/systemMapConfig"/);
  assert.doesNotMatch(roomModel, /export const DEPARTMENTS/, "must not define a competing department registry");

  for (const file of [
    "components/company/office-map/OfficeMap.tsx",
    "components/company/office-map/RoomTile.tsx",
    "components/company/office-map/Lobby.tsx",
    "components/company/office-map/roomModel.ts",
    "components/company/office-map/theme.ts",
    "app/company/office-map/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), PROTECTED_IMPORT_PATTERN, `${file} must not import protected X/Investment/Note business-logic paths`);
  }
});

test("Office Map supports deep links to a room and keeps X/note/Instagram real, TikTok inert", () => {
  const officeMap = read("components/company/office-map/OfficeMap.tsx");
  assert.match(officeMap, /useSearchParams/);
  assert.match(officeMap, /searchParams\.get\("room"\)/);

  const roomModel = read("components/company/office-map/roomModel.ts");
  assert.match(roomModel, /id: "x", label: "X", href: "\/content\/x", enabled: true/);
  assert.match(roomModel, /id: "note", label: "note", href: "\/content\/note", enabled: true/);
  assert.match(roomModel, /id: "instagram", label: "Instagram", href: "\/content\/instagram", enabled: true/);
  assert.match(roomModel, /id: "tiktok", label: "TikTok", enabled: false/);

  const roomTile = read("components/company/office-map/RoomTile.tsx");
  // 無効チャンネルはhrefを持たず、クリックできない見た目（破線・準備中）で出す
  assert.match(roomTile, /準備中/);
});

test("Office Map renders UNKNOWN instead of fabricating status when data is unavailable", () => {
  const theme = read("components/company/office-map/theme.ts");
  assert.match(theme, /unknown: "UNKNOWN"/);
  const roomModel = read("components/company/office-map/roomModel.ts");
  assert.match(roomModel, /"unknown"/);
  const lobby = read("components/company/office-map/Lobby.tsx");
  assert.match(lobby, /UNKNOWN/);
});

test("Office Map coexists with WorldView / CompanyOfficeOverview / Pixel Office (no second competing SSOT)", () => {
  assert.ok(exists("components/company/WorldView.tsx"));
  assert.ok(exists("components/company/office/CompanyOfficeOverview.tsx"));
  assert.ok(exists("components/company/office/useCompanyOffice.ts"));
  assert.ok(exists("components/company/office/DepartmentPanel.tsx"));

  const overview = read("components/company/office/CompanyOfficeOverview.tsx");
  // 既存のリスト表示（DepartmentPanel / TaskBoard）は削除しない
  assert.match(overview, /<DepartmentPanel departments={view.departments} \/>/);
  assert.match(overview, /<TaskBoard tasks={view.tasks} \/>/);
  // 新しいOffice Mapへの導線は足すが、既存の投影ロジックは変えない
  assert.match(overview, /\/company\/office-map/);

  const worldView = read("components/company/WorldView.tsx");
  assert.match(worldView, /AGENT_STATUS_LABELS/);
  assert.doesNotMatch(worldView, /status === "EXECUTING" \?|statusFromMission/);
});

test("Office Map is reachable from Home", () => {
  const home = read("app/page.tsx");
  assert.match(home, /\/company\/office-map/);
  // Home専用の禁止パターンは引き続き守る（§simple-ceo-workspace）
  assert.doesNotMatch(home, /QUICK_ACTIONS|CompanyOfficeOverview|最近の動き|システム状態/);
  assert.match(home, /DepartmentOverview/);
});
