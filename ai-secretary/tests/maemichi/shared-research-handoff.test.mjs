import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
const root = process.env.MAEMICHI_DIST;
const { projectCreatorEvidence } = await import(path.join(root, "note/research/sharedEvidence.js"));
const { reconcileFetchedResearchItems } = await import(path.join(root, "note/research/evidenceRefresh.js"));
const { buildCreatorDailyResearchAgenda } = await import(path.join(root, "note/automation/dailyResearchAgenda.js"));
const now = new Date("2026-10-11T00:00:00Z");
const item = { id: "research-1", departmentIds: ["creator"], sourceType: "web", sourceUrl: "https://example.com/article", title: "AI tools", summary: "AI tools evidence", fetchedAt: now.toISOString() };
test("canonical evidence enters the existing inbox reconciliation once, retaining provenance and missing metrics", () => {
  const projected = projectCreatorEvidence([item], now);
  assert.equal(projected[0].id, item.id);
  assert.equal(projected[0].publishedAt, undefined);
  assert.equal(projected[0].publicMetrics, undefined);
  const first = reconcileFetchedResearchItems([], projected);
  assert.equal(first.fresh.length, 1);
  const second = reconcileFetchedResearchItems(first.fresh, projected);
  assert.equal(second.fresh.length, 0);
  assert.equal(second.refreshed.length, 1);
});
test("adapter excludes other departments, internal evidence, stale observations and invalid URLs", () => {
  assert.deepEqual(projectCreatorEvidence([
    { ...item, departmentIds: ["fund"] }, { ...item, sourceType: "internal" },
    { ...item, fetchedAt: "2026-01-01T00:00:00Z" }, { ...item, sourceUrl: "file:///private/data" },
  ], now), []);
});
test("agenda resolves topic IDs and suppresses recent topics", () => {
  const built = buildCreatorDailyResearchAgenda({ date: "2026-10-11", now,
    policy: { departmentId: "creator", maxQueriesPerRun: 8 },
    winningTopicRefs: ["used-id", "new-id", "unresolved-id"],
    recentlyUsedTopics: ["used-id"], topicTitles: { "used-id": "Already posted", "new-id": "AI education" },
  });
  assert.ok(built.queryIntents.some((intent) => intent.query.includes("AI education")));
  assert.ok(built.queryIntents.every((intent) => !/used-id|new-id|unresolved-id|Already posted/.test(intent.query)));
});
