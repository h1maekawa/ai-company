import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const compiled = (file) => path.join(process.env.QA_DIST, "out/app/lib", file);
const { buildMorningBrief } = require(compiled("company/morningBrief/build.js"));
const { absoluteDeepLink, morningBriefBlocks } = require(compiled("company/morningBrief/slack.js"));
const { buildXGrowthInsight } = require(compiled("company/morningBrief/xGrowth.js"));
const { safeSlackUrl } = require(compiled("integrations/slack/blocks.js"));

const notification = (extra = {}) => ({ id: "n1", fingerprint: "approval:a", kind: "COMPANY_APPROVAL_REQUIRED", sourceType: "approval", sourceId: "a", title: "承認してください", summary: "R2 action", priority: "ACTION_REQUIRED", actionRequired: true, deepLink: "/ceo/approvals#a", createdAt: "2026-10-02T00:00:00Z", riskLevel: "R2", ...extra });
test("Morning Brief includes only actionable events and deduplicates fingerprints", () => {
  const brief = buildMorningBrief({ now: new Date("2026-10-02T00:00:00Z"), notifications: [notification(), notification({ id: "duplicate" }), notification({ id: "info", fingerprint: "info", priority: "INFO", actionRequired: false })], homeAttention: [], opportunities: [] });
  assert.equal(brief.day, "2026-10-02"); assert.equal(brief.items.length, 1); assert.equal(brief.items[0].sourceAlreadyNotified, false);
});
test("Morning Briefは同じfactual dimensionの改善候補をfingerprintが異なっても1件にまとめる", () => {
  const improvement = (id, fingerprint, summary) => notification({
    id, fingerprint, kind: "COMPANY_IMPROVEMENT_REVIEW", sourceType: "company-improvement",
    title: "AI会社の改善候補があります", summary,
  });
  const brief = buildMorningBrief({ notifications: [
    improvement("a", "research:a", "RESEARCH_PROVIDER_FAILURE occurred 3 times for the same factual dimension."),
    improvement("b", "research:b", "RESEARCH_PROVIDER_FAILURE occurred 3 times for the same factual dimension."),
    improvement("c", "mission:c", "MISSION_REPLAN_REQUIRED needs review."),
  ], homeAttention: [], opportunities: [] });
  assert.equal(brief.items.length, 2);
  assert.equal(brief.items.filter((item) => item.summary.startsWith("RESEARCH_PROVIDER_FAILURE")).length, 1);
});
test("Morning Briefは実績同期済みX投稿数をCEO判断件数と分けて表示する", () => {
  const brief = buildMorningBrief({ notifications: [], homeAttention: [], opportunities: [], xPublishedYesterday: 1 });
  assert.equal(brief.items.length, 0);
  assert.equal(brief.xPublishedYesterday, 1);
  assert.match(JSON.stringify(morningBriefBlocks(brief)), /昨日のX投稿（実績同期済み）: 1件/);
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
const growthReview = (extra = {}) => ({ date:"2026-10-02", measuredThrough:"2026-10-02T14:30:00Z", confidence:"medium", xSummary:{ postCount:2, impressions:1200 }, comparisons:{ last7Days:{postCount:7,impressions:7000}, previous7Days:{postCount:7,impressions:5000}, last30Days:{postCount:25,impressions:22000} }, winningPatterns:[{purpose:"reach",pattern:"number-hook",sampleSize:3}], bestContent:{contentId:"own-1",impressions:1200}, competitorDifferences:["3件中2件が数字始まり"], nextExperiment:"[hook] 次の3投稿で数字Hookを検証", experiments:[], evidenceCount:3, ...extra });
test("X Growth is informational and does not increase the CEO action count", () => {
  const insight = buildXGrowthInsight(growthReview(), new Date("2026-10-02T22:00:00Z"));
  const brief = buildMorningBrief({ notifications:[notification()], homeAttention:[], opportunities:[], insights:[insight] });
  assert.equal(brief.items.length, 1); assert.equal(brief.insights.length, 1);
  const blocks = morningBriefBlocks(brief); assert.match(JSON.stringify(blocks), /CEO判断が必要: 1件/); assert.match(JSON.stringify(blocks), /X Growth/); assert.match(JSON.stringify(blocks), /Comparable samples: 3/); assert.match(JSON.stringify(blocks), /Next Experiment/);
});
test("low confidence and insufficient evidence never overclaim causality", () => {
  const insight = buildXGrowthInsight(growthReview({ confidence:"low", evidenceCount:1, competitorDifferences:["raw competitor post text"] }), new Date("2026-10-02T22:00:00Z"));
  assert.equal(insight.freshness, "insufficient"); assert.match(insight.summary, /INSUFFICIENT_DATA/); assert.doesNotMatch(insight.summary, /raw competitor post text|原因|伸びる/);
});
test("competitor raw text is excluded even when confidence is sufficient", () => {
  const insight = buildXGrowthInsight(growthReview({ competitorDifferences:["competitor raw post body"] }), new Date("2026-10-02T22:00:00Z"));
  assert.doesNotMatch(insight.summary, /competitor raw post body/); assert.doesNotMatch(insight.summary, /原因|これを使えば伸びる/);
});
test("stale or future Growth Reviews are not surfaced as today's insight", () => {
  assert.equal(buildXGrowthInsight(growthReview({ date:"2026-09-30" }), new Date("2026-10-02T22:00:00Z")), null);
  assert.equal(buildXGrowthInsight(growthReview({ measuredThrough:"2026-10-03T23:00:00Z" }), new Date("2026-10-02T22:00:00Z")), null);
});
test("X Growth deep link is canonical and Block Kit remains bounded", () => {
  const insight = buildXGrowthInsight(growthReview({ confidence:"high" }), new Date("2026-10-02T22:00:00Z"));
  assert.equal(insight.deepLink, "/note?view=results");
  const brief = buildMorningBrief({ notifications:Array.from({length:15},(_,i)=>notification({id:String(i),fingerprint:String(i)})), homeAttention:[], opportunities:[], insights:[insight] });
  assert.ok(morningBriefBlocks(brief).length <= 50);
});
