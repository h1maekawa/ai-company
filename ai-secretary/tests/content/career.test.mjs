import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = (name) => pathToFileURL(path.join(process.env.CAREER_SOURCE_DIR, `${name}.ts`));
const workflow = await import(source("workflow"));
const privacy = await import(source("privacy"));
const renderer = await import(source("renderer"));

function knowledgeItems() {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `career-k-${index}`, divisionId: "career", sourceId: "career-source-1", title: `経験 ${index}`,
    summary: `当時に経験した学び ${index}`, bodyPrivate: `面接準備で実際に経験したことを記録します ${index}。準備を見直しました。`,
    topic: ["面接", "ES", "自己分析", "企業研究", "インターン", "失敗からの学び", "選考体験"][index],
    audience: "就活生", evidenceType: "personal_experience", privacyRisk: "clear", verificationStatus: "human_verified",
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  }));
}
test("career week creates 7 X drafts and 7 five-slide Instagram drafts, scoped to career", () => {
  const { batch, posts } = workflow.generateCareerWeek({ sources: [], knowledgeItems: knowledgeItems(), batches: [], posts: [], audit: [] }, knowledgeItems().map((item) => item.id), "2026-10-26", new Date("2026-10-21T00:00:00.000Z"));
  assert.equal(batch.divisionId, "career");
  assert.equal(posts.length, 14);
  assert.equal(posts.filter((post) => post.platform === "x").length, 7);
  const carousels = posts.filter((post) => post.platform === "instagram");
  assert.equal(carousels.length, 7);
  assert.ok(carousels.every((post) => post.slides.length === 5 && post.slides.map((slide) => slide.position).join(",") === "1,2,3,4,5"));
  assert.ok(posts.every((post) => post.divisionId === "career" && post.status === "draft" && post.approvedAt === null));
  assert.equal(posts[0].scheduledAt, "2026-10-26T10:00:00.000Z");
});
test("PII-like identity and employer or school references are flagged", () => {
  assert.equal(privacy.checkCareerPrivacy("山田太郎さんが株式会社サンプルで経験した話です").risk, "review_required");
  assert.equal(privacy.checkCareerPrivacy("東京大学の研究室で学んだ話を振り返ります").risk, "review_required");
});
test("generation rejects fewer than seven items, topic duplicates, and privacy flagged knowledge", () => {
  const items = knowledgeItems();
  const state = { sources: [], knowledgeItems: items, batches: [], posts: [], audit: [] };
  assert.throws(() => workflow.generateCareerWeek(state, items.slice(0, 6).map((item) => item.id), "2026-10-26"), /SELECT_SEVEN/);
  items[6].topic = items[0].topic;
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /TOPIC_DUPLICATES/);
  items[6].topic = "distinct"; items[6].privacyRisk = "review_required";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /PRIVACY_REVIEW_REQUIRED/);
  items[6].privacyRisk = "clear";
  items[6].verificationStatus = "unverified";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-26"), /KNOWLEDGE_VERIFICATION_REQUIRED/);
  items[6].verificationStatus = "human_verified";
  assert.throws(() => workflow.generateCareerWeek(state, items.map((item) => item.id), "2026-10-25"), /INVALID_WEEK_START/);
});
test("carousel HTML escapes content and reports estimated text overflow", () => {
  const html = renderer.renderCareerCarouselSlide({ position: 1, headline: "<script>name</script>", body: "private text" });
  assert.ok(!html.includes("<script>name</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(renderer.careerSlideOverflow({ position: 1, headline: "短い見出し", body: "短い本文" }), false);
  assert.equal(renderer.careerSlideOverflow({ position: 1, headline: "長い見出し".repeat(30), body: "" }), true);
});
