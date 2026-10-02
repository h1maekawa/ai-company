import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const compiled = (file) => path.join(process.env.QA_DIST, "out/app/lib", file);
const { buildMorningBrief } = require(compiled("company/morningBrief/build.js"));
const { absoluteDeepLink, morningBriefBlocks } = require(compiled("company/morningBrief/slack.js"));
const { safeSlackUrl } = require(compiled("integrations/slack/blocks.js"));

const notification = (extra = {}) => ({ id: "n1", fingerprint: "approval:a", kind: "COMPANY_APPROVAL_REQUIRED", sourceType: "approval", sourceId: "a", title: "承認してください", summary: "R2 action", priority: "ACTION_REQUIRED", actionRequired: true, deepLink: "/ceo/approvals#a", createdAt: "2026-10-02T00:00:00Z", riskLevel: "R2", ...extra });
test("Morning Brief includes only actionable events and deduplicates fingerprints", () => {
  const brief = buildMorningBrief({ now: new Date("2026-10-02T00:00:00Z"), notifications: [notification(), notification({ id: "duplicate" }), notification({ id: "info", fingerprint: "info", priority: "INFO", actionRequired: false })], homeAttention: [], opportunities: [] });
  assert.equal(brief.day, "2026-10-02"); assert.equal(brief.items.length, 1); assert.equal(brief.items[0].sourceAlreadyNotified, false);
});
test("Morning Brief maps business, investment, content, finance and engineering deep links", () => {
  const opportunity = { id: "opp1", fingerprint: "affiliate:test", status: "RECOMMENDED", title: "AI Affiliate", summary: "Evidence-backed", score: 80, rankingScore: 82, coveragePct: 75, updatedAt: new Date().toISOString(), expectedRevenue: { known: false, reason: "UNKNOWN" } };
  const brief = buildMorningBrief({ notifications: [notification({ id: "eng", fingerprint: "eng", kind: "ENGINEERING_PR_READY", departmentId: "engineering", title: "PR Ready" })], homeAttention: [
    { id: "i", title: "投資", href: "/investing/opportunities/x", source: "投資", priority: "normal" },
    { id: "c", title: "Content", href: "/note?view=review", source: "コンテンツ", priority: "high" },
    { id: "f", title: "Finance", href: "/assets", source: "資産", priority: "normal" },
  ], opportunities: [opportunity] });
  assert.deepEqual(new Set(brief.items.map((item) => item.area)), new Set(["BUSINESS", "INVESTMENT", "CONTENT", "FINANCE", "ENGINEERING"]));
  assert.ok(brief.items.every((item) => item.deepLink.startsWith("/")));
});
test("Deep links stay same-origin and source article URLs reject unsafe schemes", () => {
  assert.equal(absoluteDeepLink("/note/1", "https://company.example"), "https://company.example/note/1");
  assert.equal(absoluteDeepLink("https://evil.example/a", "https://company.example"), null);
  assert.equal(safeSlackUrl("https://news.example/a"), "https://news.example/a");
  assert.equal(safeSlackUrl("javascript:alert(1)"), null); assert.equal(safeSlackUrl("broken"), null);
  for (const url of ["https:news.example/a", "https://user:password@news.example/a", "https://news.example/a b", "https://news.example\\evil"]) assert.equal(safeSlackUrl(url), null);
});
test("Only confirmed deliveries are labelled notified; stale or future opportunities are excluded", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const brief = buildMorningBrief({ now, notifications: [notification()], notifiedFingerprints: ["approval:a"], homeAttention: [], opportunities: [
    { status: "RECOMMENDED", updatedAt: "2026-09-01T00:00:00Z" },
    { status: "RECOMMENDED", updatedAt: "2026-10-03T00:00:00Z" },
    { status: "RECOMMENDED", updatedAt: "invalid" },
  ] });
  assert.equal(brief.items.length, 1); assert.equal(brief.items[0].sourceAlreadyNotified, true);
});
test("Critical items survive the cap and external text cannot inject Slack mentions", () => {
  const notifications = Array.from({ length: 20 }, (_, i) => notification({ id: `${i}`, fingerprint: `${i}` }));
  notifications.push(notification({ id: "critical", fingerprint: "critical", priority: "URGENT", title: "<!channel>", summary: "<".repeat(10000) }));
  const brief = buildMorningBrief({ notifications, homeAttention: [], opportunities: [] });
  assert.equal(brief.items.length, 15); assert.equal(brief.items[0].id, "critical");
  const blocks = morningBriefBlocks(brief);
  assert.doesNotMatch(JSON.stringify(blocks), /<!channel>/);
  assert.ok(blocks.every((block) => !block.text || block.text.text.length <= 3000));
});
test("Block Kit stays bounded and contains no action button when no absolute base exists", () => {
  const previous = process.env.APP_BASE_URL; delete process.env.APP_BASE_URL; delete process.env.NEXT_PUBLIC_APP_URL;
  const brief = buildMorningBrief({ notifications: [notification()], homeAttention: [], opportunities: [] });
  const blocks = morningBriefBlocks(brief); assert.ok(blocks.length <= 50); assert.doesNotMatch(JSON.stringify(blocks), /"url"/);
  if (previous) process.env.APP_BASE_URL = previous;
});
