import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("System Map reuses live company read models and keeps shared platforms distinct", () => {
  const config = read("app/lib/company/systemMapConfig.ts");
  const route = read("app/api/company/system-map/route.ts");
  const page = read("components/system-map/SystemMap.tsx");
  assert.match(config, /BUSINESS_DEPARTMENT_NAV\.map/);
  assert.match(config, /Research & Intelligence/);
  assert.match(config, /label: "Knowledge"[\s\S]*kind: "SHARED_PLATFORM"/);
  assert.match(config, /label: "Execution Store"[\s\S]*kind: "SHARED_CORE"/);
  assert.match(config, /HUMAN_APPROVAL/);
  assert.match(config, /planned: true/);
  assert.match(route, /getDepartment/);
  assert.match(route, /getEmployees/);
  assert.match(route, /checkAllConnections/);
  assert.match(route, /vercelConfig\.crons/);
  assert.match(page, /AI社員を表示/);
  assert.match(page, /Overview/);
  assert.match(page, /Data Flow/);
  assert.match(page, /Automation/);
  assert.match(page, /NO AUTOMATIC TRADE/);
  assert.match(page, /lg:grid/);
  assert.doesNotMatch(route, /TOKEN|SECRET|PASSWORD/);
});

test("System Map is reachable from admin without adding a top-level sidebar item", () => {
  const navigation = read("app/lib/config/navigation.ts");
  assert.match(navigation, /href: "\/admin\/system-map"/);
  assert.ok(fs.existsSync(path.join(ROOT, "app/admin/system-map/page.tsx")));
  const primaryBlock = navigation.slice(navigation.indexOf("export const PRIMARY_NAV"), navigation.indexOf("export const ADMIN_NAV"));
  assert.doesNotMatch(primaryBlock, /system-map/);
});
