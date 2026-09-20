import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("Investment Transaction Ledger files and APIs exist", () => {
  for (const file of [
    "app/lib/fund/transactions/types.ts",
    "app/lib/fund/transactions/store.ts",
    "app/lib/fund/transactions/accounting.ts",
    "app/api/fund/transactions/route.ts",
    "app/api/fund/performance/route.ts",
  ]) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

test("【重要】Transaction APIは実行済みFactの記録だけで注文を実行しない", () => {
  const source = read("app/api/fund/transactions/route.ts");
  assert.match(source, /confirmedByHuman/);
  assert.match(source, /assertProductionMutationAllowed/);
  assert.match(source, /claimIdempotency/);
  assert.doesNotMatch(source, /placeOrder|submitOrder|executeTrade|actionGateway|executorRegistry/i);
});

test("【重要】Holdings Snapshot / Diff / Human DecisionからTransactionを生成しない", () => {
  for (const file of [
    "app/api/fund/import/route.ts",
    "app/lib/fund/holdingsDiff.ts",
    "app/api/fund/decisions/route.ts",
  ]) {
    assert.doesNotMatch(read(file), /appendInvestmentTransaction|transaction-ledger/,
      `${file} がTransactionを自動生成しています`);
  }
});

test("Transaction LedgerはAppend-onlyでCorrection / Reversalを保持する", () => {
  const store = read("app/lib/fund/transactions/store.ts");
  const types = read("app/lib/fund/transactions/types.ts");
  assert.match(store, /const next = \[\.\.\.entries, entry\]/);
  assert.doesNotMatch(store, /entries\[\w+\]\s*=/);
  assert.match(types, /"transaction" \| "correction" \| "reversal"/);
  assert.match(types, /correctsId\?: string/);
});

test("Accountingは明示的AVERAGE_COSTで安定順・Long-only", () => {
  const source = read("app/lib/fund/transactions/accounting.ts");
  assert.match(source, /costBasisMethod: "AVERAGE_COST"/);
  assert.match(source, /INTERNAL_PERFORMANCE_TRACKING/);
  assert.match(source, /executedAt\.localeCompare/);
  assert.match(source, /createdAt\.localeCompare/);
  assert.match(source, /code: "OVERSELL"/);
});

test("Currency / FX / Fee / Taxのunknownをnullで保持する", () => {
  const types = read("app/lib/fund/transactions/types.ts");
  for (const field of ["fxRateToJpy", "settlementAmountJpy", "fee", "taxJpy"]) {
    assert.match(types, new RegExp(`${field}: number \\| null`));
  }
  assert.match(types, /"JPY" \| "USD"/);
});

test("Realized / Unrealizedを分離し、Creator Profitへ接続しない", () => {
  const accounting = read("app/lib/fund/transactions/accounting.ts");
  assert.match(accounting, /realized:/);
  assert.match(accounting, /unrealized:/);
  for (const file of [
    "app/lib/company/revenue.ts",
    "app/lib/company/economics.ts",
    "app/lib/company/opportunity/creatorRanking.ts",
  ]) assert.doesNotMatch(read(file), /transactions\/accounting|InvestmentPerformance/);
});

test("Decision ReviewはTransactionを参照するがLearning生成へ自動反映しない", () => {
  const reviews = read("app/api/fund/reviews/route.ts");
  const learning = read("app/lib/fund/learning/engine.ts");
  assert.match(reviews, /loadInvestmentTransactions/);
  assert.match(learning, /transactions\?: InvestmentTransaction\[\]/);
  assert.doesNotMatch(learning, /realizedPnl|projectInvestmentAccounting/);
});

test("Reconciliationは警告Read ModelでLedgerを書き換えない", () => {
  const source = read("app/lib/fund/transactions/accounting.ts");
  assert.match(read("app/lib/fund/transactions/types.ts"), /"MATCH" \| "MISMATCH" \| "UNKNOWN"/);
  assert.doesNotMatch(source, /appendInvestmentTransaction|saveVaultFile/);
});

test("既存Human-Only投資境界を維持する", () => {
  assert.match(read("app/lib/fund/engine.ts"), /executionAuthority: "HUMAN_ONLY"/);
  assert.match(read("app/lib/fund/engine.ts"), /aiExecutionAllowed: false/);
  assert.match(read("app/lib/company/execution/actionTypes.ts"), /INVESTMENT_TRADE:\s*"R4"/);
});

test("legacy narrative logはTransaction会計SSOTではない", () => {
  const source = read("app/api/fund/log/route.ts");
  assert.match(source, /legacy narrative log/);
  assert.doesNotMatch(source, /appendInvestmentTransaction|projectInvestmentAccounting/);
});
