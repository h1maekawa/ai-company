import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const { createOneTimeTransportDraft } = await import(path.join(DIST, "note/automation/oneTimeTransportCanary.js"));
const { defaultBrand } = await import(path.join(DIST, "note/types.js"));
const { evaluatePublishEligibility } = await import(path.join(DIST, "note/automation/publishEligibility.js"));
const { xWeightedLength, runXSafetyGate } = await import(path.join(DIST, "note/operations.js"));
const { hotEvidenceDiagnostics } = await import(path.join(DIST, "note/automation/hotEvidenceDiagnostics.js"));

const slot = { id: "daily-x:2026-10-08:primary:0", purpose: "reach", timeSource: "one-time-transport-canary" };
const brand = defaultBrand();

test("Brand内部文脈だけの新規DraftはSafety/Fact/Eligibilityを通り、sourceやaffiliateを持たない", async () => {
  const draft = createOneTimeTransportDraft({ slot, brand, primaryAccountId: "primary", existingDrafts: [], now: new Date("2026-10-07T22:10:00Z") });
  assert.ok(draft);
  assert.equal(draft.status, "draft");
  assert.equal(draft.affiliateId, undefined);
  assert.deepEqual(draft.sourceResearchIds, []);
  assert.deepEqual(draft.sourceExperienceIds, []);
  assert.ok(xWeightedLength(draft.text) <= 280);
  assert.ok(draft.similarityScore < 0.72);
  assert.equal(runXSafetyGate({ draft, brand, experiences: [] }).safe, true);
  const eligibility = await evaluatePublishEligibility({ draft: { ...draft, planId: "daily-x:2026-10-08:primary", planSlotId: slot.id }, currentPlanId: "daily-x:2026-10-08:primary", currentPlanSlotId: slot.id, brand, experiences: [], researchItems: [], researchProviderFailureUnresolved: true });
  assert.deepEqual(eligibility, { eligible: true, reasons: [] });
});

test("既存slotのDraftを流用せず、重複・Brand不一致はfail closed", () => {
  const old = createOneTimeTransportDraft({ slot, brand, primaryAccountId: "primary", existingDrafts: [], now: new Date() });
  assert.ok(old);
  assert.equal(createOneTimeTransportDraft({ slot, brand, primaryAccountId: "primary", existingDrafts: [{ ...old, planSlotId: slot.id }], now: new Date() }), null);
  assert.equal(createOneTimeTransportDraft({ slot, brand: { ...brand, concept: "別ブランド" }, primaryAccountId: "primary", existingDrafts: [], now: new Date() }), null);
});

test("Hot診断は本文を出さず指定されたevidence metadataだけを返す", () => {
  const rows = hotEvidenceDiagnostics([{ id: "cluster-a", hotScore: 42, hotConfidence: "LOW", hotScoreBreakdown: { availableWeight: 60, measuredPostCount: 0 }, researchItemIds: ["r1", "r2"], sourceCount: 2 }], [
    { id: "r1", platform: "note", sourceAccountId: "alice", sourceUrl: "https://note.com/a", textExcerpt: "機密本文", publishedAt: "2026-10-08T00:00:00Z", publicMetrics: { likes: 3 } },
    { id: "r2", platform: "note", sourceAccountId: "bob", sourceUrl: "https://note.com/b", textExcerpt: "非公開本文" },
  ], new Date("2026-10-08T12:00:00Z"));
  assert.deepEqual(rows, [{
    clusterId: "cluster-a", hotScore: 42, hotConfidence: "LOW", availableWeight: 60,
    measuredPostCount: 0, independentSourceCount: 2, hasMomentum: true, hasFreshness: true,
    sourceCount: 2, publicMetricCount: 1, publishedAtCount: 1, uniqueUrlCount: 2,
    uniqueDomainCount: 1, uniqueAuthorCount: 2, providerCount: 1,
    rootCauses: ["PUBLISHED_AT_MISSING", "AVAILABLE_WEIGHT_INSUFFICIENT"],
  }]);
  assert.doesNotMatch(JSON.stringify(rows), /機密本文|非公開本文/);
});
