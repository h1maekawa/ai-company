import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const accounting = await import(path.join(process.env.FUND_DIST, "transactions/accounting.js"));
const types = await import(path.join(process.env.FUND_DIST, "transactions/types.js"));
const NOW = "2026-09-20T00:00:00.000Z";

function tx(overrides = {}) {
  const currency = overrides.currency ?? "USD";
  return {
    id: overrides.id ?? `tx-${Math.random()}`,
    kind: "transaction", ticker: "MU", transactionType: "BUY", quantity: 10,
    price: 100, currency, executedAt: NOW, source: "manual", confirmedByHuman: true,
    fxRateToJpy: null, settlementAmountJpy: null, fee: 0, feeCurrency: currency,
    taxJpy: 0, createdAt: NOW, ...overrides,
  };
}

test("A: BUY 10株でPosition quantityは10", () => {
  const result = accounting.projectInvestmentAccounting([tx({ id: "buy-1" })]);
  assert.equal(result.positions[0].quantity, 10);
  assert.equal(result.costBasisMethod, "AVERAGE_COST");
});

test("B: BUY 10@100 + BUY 10@120で平均原価110", () => {
  const result = accounting.projectInvestmentAccounting([
    tx({ id: "buy-1", price: 100 }),
    tx({ id: "buy-2", price: 120, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]);
  assert.equal(result.positions[0].quantity, 20);
  assert.equal(result.positions[0].averageCost, 110);
});

test("C/D: 20株・平均110からSELL 5@130で原価550、gross P/L 100、残15", () => {
  const result = accounting.projectInvestmentAccounting([
    tx({ id: "buy-1", price: 100 }),
    tx({ id: "buy-2", price: 120, executedAt: "2026-09-21T00:00:00.000Z" }),
    tx({ id: "sell-1", transactionType: "SELL", quantity: 5, price: 130, executedAt: "2026-09-22T00:00:00.000Z" }),
  ]);
  const position = result.positions[0];
  assert.equal(position.quantity, 15);
  assert.equal(position.totalAcquisitionCost, 1_650);
  assert.equal(position.realizedPnl.gross, 100);
});

test("E: 保有超過SELLはinvalidでShort Positionを作らない", () => {
  const result = accounting.projectInvestmentAccounting([
    tx({ id: "buy-1", quantity: 100 }),
    tx({ id: "sell-1", transactionType: "SELL", quantity: 150, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]);
  assert.equal(result.errors[0].code, "OVERSELL");
  assert.equal(result.positions[0].quantity, 100);
});

test("F/G: known Feeはnetへ反映し、unknown FeeならgrossだけでPARTIAL", () => {
  const known = accounting.projectInvestmentAccounting([
    tx({ id: "buy", fee: 10 }),
    tx({ id: "sell", transactionType: "SELL", quantity: 5, price: 130, fee: 5, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]).positions[0].realizedPnl;
  assert.equal(known.gross, 150);
  assert.equal(known.net, 140);
  assert.equal(known.status, "CONFIRMED");

  const unknown = accounting.projectInvestmentAccounting([
    tx({ id: "buy", fee: null, feeCurrency: null }),
    tx({ id: "sell", transactionType: "SELL", quantity: 5, price: 130, fee: null, feeCurrency: null, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]).positions[0].realizedPnl;
  assert.equal(unknown.gross, 150);
  assert.equal(unknown.net, null);
  assert.equal(unknown.status, "PARTIAL");
});

test("H: USDでFX unknownならJPY Realized P/Lを捏造しない", () => {
  const result = accounting.projectInvestmentAccounting([
    tx({ id: "buy" }),
    tx({ id: "sell", transactionType: "SELL", quantity: 5, price: 130, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]);
  assert.equal(result.realizedPnlJpy.gross, null);
  assert.equal(result.realizedPnlJpy.net, null);
  assert.equal(result.realizedPnlJpy.status, "PARTIAL");
});

test("I: JPY TransactionはJPY Realized P/LをConfirmed計算できる", () => {
  const result = accounting.projectInvestmentAccounting([
    tx({ id: "buy", currency: "JPY", feeCurrency: "JPY", price: 1_000 }),
    tx({ id: "sell", currency: "JPY", feeCurrency: "JPY", transactionType: "SELL", quantity: 5, price: 1_200, executedAt: "2026-09-21T00:00:00.000Z" }),
  ]);
  assert.equal(result.realizedPnlJpy.net, 1_000);
  assert.equal(result.realizedPnlJpy.status, "CONFIRMED");
});

test("J: manual TransactionはHuman confirmation必須", () => {
  const invalid = tx({ confirmedByHuman: false });
  assert.deepEqual(types.validateInvestmentTransaction(invalid), {
    ok: false, error: "実取引Factは本人確認済みである必要があります",
  });
});

test("K: 同一externalReferenceの二重登録を検出する", () => {
  const original = tx({ id: "original", externalReference: "broker-123" });
  assert.equal(types.hasDuplicateExternalReference([original], tx({ externalReference: "broker-123" })), true);
  assert.equal(types.hasDuplicateExternalReference([original], tx({ externalReference: "broker-456" })), false);
});

test("同時刻でもcreatedAtとidで安定した順序になる", () => {
  const buy = tx({ id: "a-buy", createdAt: "2026-09-20T00:00:00.000Z" });
  const sell = tx({ id: "b-sell", transactionType: "SELL", quantity: 5, price: 110, createdAt: "2026-09-20T00:00:00.000Z" });
  const result = accounting.projectInvestmentAccounting([sell, buy]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.positions[0].quantity, 5);
});

test("Correction / Reversalは元Factを消さずProjectionだけを更新する", () => {
  const original = tx({ id: "original", quantity: 10 });
  const correction = tx({ id: "correction", kind: "correction", correctsId: "original", quantity: 20, createdAt: "2026-09-21T00:00:00.000Z" });
  assert.equal(accounting.projectInvestmentAccounting([original, correction]).positions[0].quantity, 20);
  const reversal = tx({ id: "reversal", kind: "reversal", correctsId: "original", createdAt: "2026-09-22T00:00:00.000Z" });
  assert.equal(accounting.projectInvestmentAccounting([original, correction, reversal]).positions.length, 0);
});

test("小数株をMath.floorせず保持する", () => {
  const result = accounting.projectInvestmentAccounting([tx({ quantity: 0.25 })]);
  assert.equal(result.positions[0].quantity, 0.25);
});

test("Q: PerformanceはRealizedとHoldings由来Unrealizedを分離し、欠損時Totalを出さない", () => {
  const accountingResult = accounting.projectInvestmentAccounting([tx({ id: "buy" })]);
  const performance = accounting.buildInvestmentPerformance(accountingResult, {
    importedAt: NOW,
    holdings: [{ code: "MU", pnlJpy: 500, quantity: 10 }],
  });
  assert.equal(performance.realized.status, "UNKNOWN");
  assert.equal(performance.unrealized.pnlJpy, 500);
  assert.equal(performance.totalInvestmentPnlJpy, null);
});

test("Reconciliation mismatchは警告だけでTransactionを生成しない", () => {
  const positions = accounting.projectInvestmentAccounting([tx({ id: "buy", quantity: 100 })]).positions;
  const warnings = accounting.reconcilePositions(positions, {
    importedAt: NOW, holdings: [{ code: "MU", quantity: 90, pnlJpy: 0 }],
  });
  assert.equal(warnings[0].status, "MISMATCH");
  assert.equal(warnings[0].difference, -10);
});
