import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const subject = require(path.join(process.env.CONTENT_DIST, "content/monetization/scout.js"));

const performance = (topic, index, impressions = 100) => ({
  contentId: `${topic}-${index}`,
  trendClusterId: topic,
  platform: "x",
  purpose: "reach",
  genreId: "educational",
  publishedAt: "2026-10-01T00:00:00.000Z",
  measuredAt: "2026-10-02T00:00:00.000Z",
  impressions,
});

test("週次Scoutは観測済み3件以上からCandidateだけを作り外部Actionを許可しない", () => {
  const candidates = subject.buildWeeklyMonetizationCandidates({
    performance: [performance("ai-agent", 1), performance("ai-agent", 2), performance("ai-agent", 3)],
    offers: [],
    now: new Date("2026-10-11T00:00:00.000Z"),
  });
  assert.deepEqual(new Set(candidates.map((item) => item.type)), new Set(["affiliate", "paid-note", "pr", "sponsor", "own-product", "service", "subscription"]));
  assert.ok(candidates.every((item) => item.status === "CANDIDATE" && item.requiresHumanAction === true && item.externalActionAllowed === false));
  assert.equal(candidates.some((item) => item.type === "x-native"), false, "公式evidenceなしではNative候補を作らない");
  assert.match(candidates.find((item) => item.type === "affiliate").reason, /Human/);
});

test("missing metricsや2件以下はサンプルに数えず既存候補を保持する", () => {
  const existing = [{ id: "existing", type: "paid-note", status: "CANDIDATE", title: "keep", reason: "keep", evidenceRefs: [], createdAt: "2026-10-01T00:00:00.000Z", requiresHumanAction: true, externalActionAllowed: false }];
  const result = subject.buildWeeklyMonetizationCandidates({
    performance: [performance("ai", 1), performance("ai", 2), { ...performance("ai", 3), impressions: undefined }],
    offers: [], existing, now: new Date("2026-10-11T00:00:00.000Z"),
  });
  assert.deepEqual(result, existing);
});

test("X Nativeは公式evidenceが明示された場合だけAffiliateと別候補になる", () => {
  const candidates = subject.buildWeeklyMonetizationCandidates({
    performance: [performance("investment", 1), performance("investment", 2), performance("investment", 3)],
    offers: [], officialXNativeEvidenceRef: "official-x-policy:2026-10-11", now: new Date("2026-10-11T00:00:00.000Z"),
  });
  const native = candidates.find((item) => item.type === "x-native");
  assert.ok(native);
  assert.ok(native.evidenceRefs.includes("official-x-policy:2026-10-11"));
  assert.equal(native.externalActionAllowed, false);
});
