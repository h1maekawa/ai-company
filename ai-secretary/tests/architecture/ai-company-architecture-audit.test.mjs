import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("Canonical Architecture Audit covers every required lifecycle and audit surface", () => {
  const audit = read("docs/AI_COMPANY_ARCHITECTURE_AUDIT.md");
  for (const lifecycle of ["Research", "Knowledge", "Opportunity", "Mission", "Execution", "Result", "Performance", "Revenue", "Learning"]) {
    assert.match(audit, new RegExp(`\\| ${lifecycle} \\|`));
  }
  for (const section of [
    "Canonical Lifecycle Matrix", "Component Classification", "Store Inventory", "Writer / Reader Audit",
    "External Mutation Audit", "Action Gateway Audit", "Human Gate Audit", "Provider Audit",
    "SNS Architecture Audit", "Investment Architecture Audit", "Engineering Architecture Audit",
    "Slack / Human Interface Audit", "Duplicate Risks and Findings", "Recommended Foundation Changes", "A3 Handoff",
  ]) assert.match(audit, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Audit preserves required classifications, no-guess rule, and protected boundaries", () => {
  const audit = read("docs/AI_COMPANY_ARCHITECTURE_AUDIT.md");
  for (const value of ["KEEP", "KEEP_AS_ADAPTER", "MIGRATE_LATER", "INVESTIGATE", "CANONICAL", "ADAPTER", "LEGACY", "DUPLICATE_RISK", "PARTIAL", "UNKNOWN"]) assert.match(audit, new RegExp(`\\b${value}\\b`));
  for (const gate of ["Investment Trade", "Production Merge", "Production Deploy", "High Risk Publish", "Paid Note", "Formal Knowledge Promotion", "Protected Core Mutation", "Credentials", "Payment", "Ad Spend"]) assert.match(audit, new RegExp(gate));
  assert.match(audit, /Performance adapter returns `not_configured`/);
  assert.match(audit, /No runtime implementation, store, schema, provider, Cron, secret, environment variable, Production data, publishing behavior, or Engineering Worker behavior was changed/);
});

test("Master SSOT remains present and authoritative", () => {
  const master = read("docs/AI_COMPANY_MASTER.md");
  assert.match(master, /# AI Company Master SSOT/);
  assert.match(master, /active architecture and delivery SSOT/);
});
