import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const read = (path) => fs.readFileSync(path, "utf8");
const require = createRequire(import.meta.url);
const source = read("app/lib/company/canonicalStoreContracts.ts");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require, URL, console });

test("canonical source identity is deterministic across domains and supports URL-less evidence", () => {
  const base = { sourceType: "web", canonicalUrl: "https://EXAMPLE.com/a#fragment", observedAt: "2026-10-09T00:00:00Z" };
  assert.equal(exports.canonicalSourceIdentity(base).sourceKey, exports.canonicalSourceIdentity(base).sourceKey);
  assert.equal(exports.canonicalSourceIdentity(base).canonicalUrl, "https://example.com/a");
  const provider = exports.canonicalSourceIdentity({ sourceType: "market", provider: "fred", providerEvidenceId: "SERIES-1", observedAt: base.observedAt });
  assert.match(provider.sourceKey, /^source_[a-f0-9]{24}$/);
  assert.throws(() => exports.canonicalSourceIdentity({ sourceType: "web", observedAt: base.observedAt }), /IDENTITY_REQUIRED/);
});

test("Company Revenue Ledger remains accounting SSOT and unlinked content revenue stays unresolved", () => {
  const unresolved = exports.revenueAttributionLink({ revenueEventId: "event-1", observedAt: "2026-10-09T00:00:00Z" });
  assert.equal(unresolved.relation, "unresolved");
  const linked = exports.revenueAttributionLink({ revenueEventId: "event-1", companyRevenueId: "company-1", observedAt: unresolved.observedAt });
  assert.equal(linked.relation, "linked");
  assert.match(read("docs/AI_COMPANY_STORE_CONTRACTS.md"), /Company Revenue Ledger.*ACCOUNTING SSOT/s);
  assert.match(read("docs/AI_COMPANY_STORE_CONTRACTS.md"), /RevenueEvent.*ATTRIBUTION EVIDENCE/s);
  assert.match(read("docs/AI_COMPANY_STORE_CONTRACTS.md"), /double-add.*PROHIBITED/i);
});

test("revenue idempotency uses external identity and is deterministic", () => {
  const input = { source: "stripe", externalReference: "txn-1", amount: 1200, occurredAt: "2026-10-09T00:00:00Z" };
  assert.equal(exports.revenueIdempotencyKey(input), exports.revenueIdempotencyKey(input));
  assert.notEqual(exports.revenueIdempotencyKey(input), exports.revenueIdempotencyKey({ ...input, externalReference: "txn-2" }));
});

test("AI learning starts candidate and candidate never implies approved", () => {
  const learning = exports.createCanonicalLearningCandidate({ id: "l1", domain: "content", kind: "observation", evidenceRefs: ["p1"], createdAt: "2026-10-09T00:00:00Z" });
  assert.equal(learning.status, "candidate");
  assert.equal(exports.isApprovedLearning(learning), false);
  assert.equal(exports.isApprovedLearning({ ...learning, status: "approved" }), false);
  assert.equal(exports.isApprovedLearning({ ...learning, status: "approved", approvedAt: learning.createdAt, approvedBy: "human-1" }), true);
});

test("architecture invariants preserve protected domain boundaries", () => {
  const doc = read("docs/AI_COMPANY_STORE_CONTRACTS.md");
  for (const invariant of ["Observation != Interpretation", "Investment Trade = HUMAN_ONLY", "DailyX remains domain execution", "Formal Knowledge remains human-managed", "Slack Memory != Formal Knowledge"]) {
    assert.match(doc, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(read("app/lib/company/execution/actionTypes.ts"), /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(read("app/lib/fund/engine.ts"), /executionAuthority: "HUMAN_ONLY"/);
});
