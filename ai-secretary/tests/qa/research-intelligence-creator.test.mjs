import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildCreatorResearchContext, selectCreatorArtifacts } = require(path.join(process.env.QA_DIST, "out/app/lib/company/research/intelligence/creatorContext.js"));

const NOW = new Date("2026-09-24T00:00:00Z");
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const artifact = (id, intel) => ({ id, topic: id, summary: "", researchItemIds: [], departmentContexts: {}, usedBy: [], createdAt: hoursAgo(1), intelligence: { topicKey: `platform:x:${id}`, originalQuestion: "q", playbookId: "platform-research", primaryDepartment: "creator", channel: "x", depth: "quick", sections: [], interpretation: ["AIの推測"], unknowns: [], asOf: hoursAgo(2), ttlHours: 24, status: "PARTIAL", routingAssumption: "a", facts: [{ statement: "出典付き事実", source: { url: "https://x.example.com/a", name: "X", reliability: "MEDIUM", fetchedAt: hoursAgo(2) } }, { statement: "出典なし事実", source: { reliability: "UNKNOWN", fetchedAt: hoursAgo(2) } }], snsExt: { hooks: ["問いかけで始める"] }, ...intel } });

test("CreatorにはTTL内・Evidenceあり・投資専用でないArtifactだけを渡す", () => {
  const selected = selectCreatorArtifacts([
    artifact("fresh", {}),
    artifact("stale", { asOf: hoursAgo(30) }),
    artifact("unverified", { status: "UNVERIFIED" }),
    artifact("investment", { primaryDepartment: "investment", playbookId: "company-research" }),
    { id: "legacy", topic: "t", summary: "", researchItemIds: [], departmentContexts: {}, usedBy: [], createdAt: hoursAgo(1) },
  ], NOW);
  assert.deepEqual(selected.map((item) => item.id), ["fresh"]);
});

test("Draft生成の文脈は出典付きFactだけ。AI解釈は渡さず、lineage用のartifactIdsを返す", () => {
  const context = buildCreatorResearchContext([artifact("fresh", {})], NOW);
  assert.deepEqual(context.artifactIds, ["fresh"]);
  assert.match(context.block, /出典付き事実/);
  assert.doesNotMatch(context.block, /出典なし事実|AIの推測/);
  assert.match(context.block, /問いかけで始める/);
  assert.match(context.block, /追加しないでください/);
});

test("使えるArtifactが無ければnull（既存生成はそのまま）", () => {
  assert.equal(buildCreatorResearchContext([], NOW), null);
  assert.equal(buildCreatorResearchContext(undefined, NOW), null);
});
