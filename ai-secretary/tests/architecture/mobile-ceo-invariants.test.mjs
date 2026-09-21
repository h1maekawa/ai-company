import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Mobile CEOは5ナビ・44pxタップ・HUMAN_ONLYを維持する", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  const model = read("app/lib/mobile-ceo/readModel.ts");
  for (const label of ["Home", "Work", "Approvals", "CEO"]) assert.match(shell, new RegExp(`label: "${label}"`));
  assert.match(shell, /min-h-14/);
  assert.match(model, /executionAuthority: "HUMAN_ONLY"/);
  assert.match(model, /aiExecutionAllowed: false/);
});

test("Mobile Engineering Requestは人間確認なしでai-readyを付与しない", () => {
  const route = read("app/api/engineering/requests/route.ts");
  assert.match(route, /confirmedByHuman !== true/);
  assert.match(route, /HUMAN_CONFIRMATION_REQUIRED/);
  assert.match(route, /HUMAN_SECURITY_REVIEW_REQUIRED/);
  assert.match(route, /\["ai-engineering", "ai-ready"/);
  assert.doesNotMatch(route, /placeOrder|submitOrder|executeTrade/);
});

test("375px UIは横幅を固定せずoverflowを抑え、主要操作は44px以上", () => {
  const page = read("app/ceo/page.tsx");
  const actions = read("app/ceo/actions/page.tsx");
  assert.match(page, /w-full/);
  assert.match(page, /overflow-x-hidden/);
  assert.doesNotMatch(page + actions, /min-w-\[(?:376|[4-9]\d\d)px\]/);
  assert.match(actions, /min-h-11/);
});
