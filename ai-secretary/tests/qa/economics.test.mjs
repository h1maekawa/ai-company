import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const revenueStore = await import(path.join(OUT, "revenueStore.js"));
const costs = await import(path.join(OUT, "businessCost.js"));
const economics = await import(path.join(OUT, "economics.js"));
const evidenceEngine = await import(
  path.join(process.env.QA_DIST, "out", "app", "lib", "content", "evidence", "engine.js")
);
const NOW = new Date("2026-09-19T00:00:00Z");

const revenue = (over = {}) =>
  revenueStore.createRevenueEntry(
    {
      amountYen: 100_000,
      sourceType: "note",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      missionId: "mission-1",
      opportunityId: "opportunity-1",
      contentId: "content-1",
      originAgentId: "personal-note",
      ...over,
    },
    NOW
  );

const cost = (over = {}) =>
  costs.createBusinessCostEntry(
    {
      amountYen: 20_000,
      category: "platform_fee",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      missionId: "mission-1",
      opportunityId: "opportunity-1",
      contentId: "content-1",
      ...over,
    },
    NOW
  );

test("Revenue 100,000 / Cost 20,000 => Profit 80,000 / ROI 4.0", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue()],
    costEntries: [cost()],
  });
  assert.equal(outcome.profitYen, 80_000);
  assert.equal(outcome.roi, 4);
});

test("Revenue 50,000 / Cost 60,000 => Profit -10,000 / negative ROI", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue({ amountYen: 50_000 })],
    costEntries: [cost({ amountYen: 60_000 })],
  });
  assert.equal(outcome.profitYen, -10_000);
  assert.ok(outcome.roi < 0);
});

test("確認済みCost 0円でもROIはInfinityにしない", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue()],
    costEntries: [],
    costKnown: true,
  });
  assert.equal(outcome.costYen, 0);
  assert.equal(outcome.profitYen, 100_000);
  assert.equal(outcome.roi, null);
  assert.equal(Number.isFinite(outcome.roi), false);
});

test("未確認RevenueはConfirmed Profitへ含めない", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue({ confirmedByHuman: false })],
    costEntries: [cost()],
  });
  assert.equal(outcome.revenueStatus, "PARTIAL");
  assert.equal(outcome.profitYen, null);
});

test("未確認CostがあればConfirmed Profitを断定しない", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue()],
    costEntries: [cost({ confirmedByHuman: false })],
  });
  assert.equal(outcome.costStatus, "PARTIAL");
  assert.equal(outcome.profitYen, null);
});

test("Investment RevenueはCreator Profitへ含めない", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [revenue({ sourceType: "investment", amountYen: 999_999 })],
    costEntries: [],
    revenueKnown: true,
    costKnown: true,
  });
  assert.equal(outcome.revenueYen, 0);
  assert.equal(outcome.profitYen, 0);
});

test("Revenue correction / reversalを正しく再計算する", () => {
  const original = revenue({ amountYen: 100_000 });
  const correction = revenueStore.createRevenueEntry(
    {
      amountYen: 120_000,
      sourceType: "note",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      kind: "correction",
      correctsId: original.id,
      originAgentId: "personal-note",
    },
    new Date(NOW.getTime() + 1)
  );
  const corrected = economics.projectEconomicOutcome({
    revenueEntries: [original, correction],
    costEntries: [cost()],
  });
  assert.equal(corrected.revenueYen, 120_000);

  const reversal = revenueStore.createRevenueEntry(
    {
      amountYen: 120_000,
      sourceType: "note",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      kind: "reversal",
      correctsId: original.id,
    },
    new Date(NOW.getTime() + 2)
  );
  const reversed = economics.projectEconomicOutcome({
    revenueEntries: [original, correction, reversal],
    costEntries: [cost()],
    revenueKnown: true,
  });
  assert.equal(reversed.revenueYen, 0);
});

test("Cost correction / reversalを正しく再計算する", () => {
  const original = cost({ amountYen: 20_000 });
  const correction = costs.createBusinessCostEntry(
    {
      amountYen: 25_000,
      category: "platform_fee",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      kind: "correction",
      correctsId: original.id,
    },
    new Date(NOW.getTime() + 1)
  );
  const corrected = economics.projectEconomicOutcome({
    revenueEntries: [revenue()],
    costEntries: [original, correction],
  });
  assert.equal(corrected.costYen, 25_000);

  const reversal = costs.createBusinessCostEntry(
    {
      amountYen: 25_000,
      category: "platform_fee",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      kind: "reversal",
      correctsId: original.id,
    },
    new Date(NOW.getTime() + 2)
  );
  const reversed = economics.projectEconomicOutcome({
    revenueEntries: [revenue()],
    costEntries: [original, correction, reversal],
    costKnown: true,
  });
  assert.equal(reversed.costYen, 0);
});

test("Mission / Opportunity / Content単位で同じLedgerからProjectionできる", () => {
  for (const scope of [
    { type: "mission", id: "mission-1" },
    { type: "opportunity", id: "opportunity-1" },
    { type: "content", id: "content-1" },
  ]) {
    const outcome = economics.projectEconomicOutcome({
      revenueEntries: [revenue(), revenue({ missionId: "other", opportunityId: "other", contentId: "other" })],
      costEntries: [cost(), cost({ missionId: "other", opportunityId: "other", contentId: "other" })],
      scope,
    });
    assert.equal(outcome.revenueYen, 100_000);
    assert.equal(outcome.costYen, 20_000);
  }
});

test("データなし(null)と確認済み0円を区別する", () => {
  const unknown = economics.projectEconomicOutcome({ revenueEntries: [], costEntries: [] });
  assert.equal(unknown.revenueYen, null);
  assert.equal(unknown.costYen, null);

  const zero = economics.projectEconomicOutcome({
    revenueEntries: [],
    costEntries: [],
    revenueKnown: true,
    costKnown: true,
  });
  assert.equal(zero.revenueYen, 0);
  assert.equal(zero.costYen, 0);
  assert.equal(zero.profitYen, 0);
  assert.equal(zero.roi, null);
});

test("既存Revenue Entryは新しいoptional参照なしでも後方互換", () => {
  const legacy = revenueStore.createRevenueEntry(
    {
      amountYen: 500,
      sourceType: "note",
      occurredAt: NOW.toISOString(),
      confirmedByHuman: true,
      originAgentId: "personal-note",
    },
    NOW
  );
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [legacy],
    costEntries: [],
    costKnown: true,
  });
  assert.equal(outcome.revenueYen, 500);
});

test("Direct RevenueとAssisted Revenueを合計を崩さず分離できる", () => {
  const outcome = economics.projectEconomicOutcome({
    revenueEntries: [
      revenue({ amountYen: 70_000, attributionType: "direct" }),
      revenue({ amountYen: 30_000, attributionType: "assisted" }),
    ],
    costEntries: [cost()],
  });
  assert.equal(outcome.directRevenueYen, 70_000);
  assert.equal(outcome.assistedRevenueYen, 30_000);
  assert.equal(outcome.revenueYen, 100_000);
});

test("Assisted Contributorを追加してもEconomic Revenue総額は増えない", () => {
  const entries = [revenue({ amountYen: 1_000 })];
  const before = economics.projectEconomicOutcome({
    revenueEntries: entries,
    costEntries: [],
    costKnown: true,
  });
  const referenced = evidenceEngine.referencedRevenueIds([
    {
      companyRevenueId: entries[0].id,
      sourcePublishedContentId: "pub-x",
      targetPublishedContentId: "pub-note",
    },
  ]);
  const after = economics.projectEconomicOutcome({
    revenueEntries: entries,
    costEntries: [],
    costKnown: true,
  });
  assert.deepEqual(referenced, [entries[0].id]);
  assert.equal(before.revenueYen, 1_000);
  assert.equal(after.revenueYen, 1_000);
});
