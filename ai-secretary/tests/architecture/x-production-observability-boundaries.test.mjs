import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const reader = read("app/lib/company/observability/readXProjection.ts");
const proxy = read("proxy.ts");
const routes = [
  "app/api/company/runtime/observability/x/route.ts",
  "app/api/company/runtime/observability/x/daily/route.ts",
  "app/api/company/runtime/observability/x/slots/[slotId]/route.ts",
  "app/api/company/runtime/observability/reconciliation/route.ts",
].map(read).join("\n");

test("Observability readerはcanonical loaderのみでmutationをimportしない", () => {
  for (const loader of ["loadDailyXPlans", "loadSocialDrafts", "loadPerformance", "loadClusters"]) assert.match(reader, new RegExp(loader));
  const imports = reader.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /save|upsert|publish|execute|schedule|approve|reject/i);
});

test("Observability APIはGETだけで書込methodを提供しない", () => {
  assert.match(routes, /export async function GET/);
  assert.doesNotMatch(routes, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(routes, /process\.env|TOKEN|SECRET|Authorization|cookie|email|phone/i);
});

test("Observability routesはpublic/machine bypassに追加されずsession auth配下", () => {
  assert.doesNotMatch(proxy, /runtime\/observability/);
  assert.doesNotMatch(proxy, /observability.*NextResponse\.next/);
});
