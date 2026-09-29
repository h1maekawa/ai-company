import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = process.env.QA_DIST + "/out";
const client = require(path.join(root, "app/lib/cashflow/client.js"));
const router = require(path.join(root, "app/lib/cashflow/questionRouter.js"));
const executor = require(path.join(root, "app/lib/skills/executor.js"));

process.env.CRESTIX_CF_MODE = "mock";

test("4つのCF Toolはversioned contractを返す", async () => {
  const summary = await client.callCashflowTool("get_cashflow_summary", {});
  assert.equal(summary.schemaVersion, "cashflow:v1");
  assert.equal(summary.currency, "JPY");
  assert.equal(summary.timezone, "Asia/Tokyo");
  assert.equal(Number.isSafeInteger(summary.data.currentCash), true);
  assert.equal(JSON.stringify(summary).match(/token|account_number|card_number|private memo/i), null);
  assert.equal((await client.callCashflowTool("get_cashflow_week_detail", { weekNumber: 6 })).data.weekNumber, 6);
  assert.equal(Array.isArray((await client.callCashflowTool("get_cashflow_alerts", {})).data), true);
  assert.equal((await client.callCashflowTool("simulate_cashflow_scenario", { additionalOutflows: [{ amount: 3_000_000, date: "2026-09-25" }] })).data.difference.week13CashDifference, -3_000_000);
});

test("Skill authorizationは許可秘書だけに限定する", async () => {
  assert.equal((await executor.executeSkill({ skillId: "get_cashflow_summary", secretaryId: "executive-assistant", input: {} })).ok, true);
  assert.equal((await executor.executeSkill({ skillId: "get_cashflow_summary", secretaryId: "personal-note", input: {} })).ok, false);
});

test("自然言語質問を決定的にCF Toolへrouteする", async () => {
  assert.equal((await router.answerCashflowQuestion("現在の現預金はいくら？")).skillId, "get_cashflow_summary");
  assert.equal((await router.answerCashflowQuestion("6週目の支払内訳は？")).skillId, "get_cashflow_week_detail");
  assert.equal((await router.answerCashflowQuestion("資金繰りのリスクと未回収は？")).skillId, "get_cashflow_alerts");
  const scenario = await router.answerCashflowQuestion("採用費300万円を追加したらどうなる？ 13週CFで確認");
  assert.equal(scenario.skillId, "simulate_cashflow_scenario");
  assert.match(scenario.markdown, /-3,000,000円/);
});

test("未設定時とremote認証失敗はfail closed", async () => {
  process.env.CRESTIX_CF_MODE = "disabled";
  await assert.rejects(() => client.callCashflowTool("get_cashflow_summary", {}), { code: "CF_NOT_CONFIGURED" });
  process.env.CRESTIX_CF_MODE = "mock";
});
