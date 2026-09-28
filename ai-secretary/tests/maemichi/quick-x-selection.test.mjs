import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const quickX = await import(path.join(DIST, "note/quickXSelection.js"));

const source = { id: "source-1", platform: "web", sourceType: "trend", sourceUrl: "https://example.com/article", textExcerpt: "excerpt", detectedGenreIds: [], fetchedAt: "2026-09-28T00:00:00.000Z" };
const candidate = { id: "cluster-1", title: "Topic", summary: "Summary", genreIds: [], researchItemIds: [source.id], sourceCount: 1, firstDetectedAt: "2026-09-28T00:00:00.000Z", lastDetectedAt: "2026-09-28T00:00:00.000Z", trendScore: 1, brandFitScore: 1, experienceFitScore: 1, monetizationFitScore: 1, originalityScore: 1, totalScore: 5, penalties: [], blocked: false, matchedExperienceIds: [], status: "candidate", items: [source] };

test("valid Deep Linkは指定cluster/sourceを選択する", () => {
  assert.deepEqual(quickX.resolveQuickXRoute([candidate], { quickX: "1", clusterId: candidate.id, sourceItemId: source.id }), { mode: "deep-link", selection: { clusterId: candidate.id, sourceItemId: source.id } });
});

test("invalid Deep Linkは別候補へfallbackしない", () => {
  assert.deepEqual(quickX.resolveQuickXRoute([candidate], { quickX: "1", clusterId: "missing", sourceItemId: source.id }), { mode: "invalid-deep-link" });
  assert.deepEqual(quickX.resolveQuickXRoute([candidate], { quickX: "1", clusterId: candidate.id, sourceItemId: "missing" }), { mode: "invalid-deep-link" });
});

test("通常アクセスは候補一覧モードを維持する", () => {
  assert.deepEqual(quickX.resolveQuickXRoute([candidate], {}), { mode: "browse" });
});
