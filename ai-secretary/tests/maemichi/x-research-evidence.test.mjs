import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const { normalizeSerpPublishedAt } = await import(path.join(DIST, "note/research/serpDate.js"));

test("SerpAPIの相対日時を観測時刻基準へ正規化し、不正・未来日時を捏造しない", () => {
  const observedAt = new Date("2026-10-08T12:00:00.000Z");
  assert.equal(normalizeSerpPublishedAt("2 days ago", observedAt), "2026-10-06T12:00:00.000Z");
  assert.equal(normalizeSerpPublishedAt("3 hours ago", observedAt), "2026-10-08T09:00:00.000Z");
  assert.equal(normalizeSerpPublishedAt("2026-10-07T00:00:00Z", observedAt), "2026-10-07T00:00:00.000Z");
  assert.equal(normalizeSerpPublishedAt("unknown", observedAt), undefined);
  assert.equal(normalizeSerpPublishedAt("2026-10-10T12:00:00Z", observedAt), undefined);
});
