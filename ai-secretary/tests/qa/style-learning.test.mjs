/**
 * 文体学習の材料（要件4 / TASK-N3）のテスト
 *
 * 一番危ないのは「AIが自分の出力から学ぶ循環」。
 * ownedPosts には source:"ai-secretary"（このシステムが生成した投稿）が混ざるため、
 * それを除外できていないと、本人の文体から静かに離れていく。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "note");
const style = await import(path.join(OUT, "styleProfile.js"));

const owned = (over = {}) => ({
  id: "o1",
  accountId: "maemichi",
  text: "今日は疲れた。だけど少しだけ前に進んだ気がする。",
  source: "x-archive",
  genreIds: [],
  verifiedByUser: true,
  finalTextConfirmed: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const draft = (over = {}) => ({
  id: "d1",
  text: "これはAIが作った下書きです。",
  status: "published",
  urls: [],
  needsDisclosure: false,
  ...over,
});

/* ─── 循環学習の防止 ─────────────────────────────── */

test("【重要】ai-secretary由来の投稿は学習材料から除外する", () => {
  const posts = style.ownedPostsToLearningPosts([
    owned({ id: "a", source: "ai-secretary" }),
    owned({ id: "b", source: "x-archive" }),
    owned({ id: "c", source: "manual" }),
  ]);
  assert.equal(posts.length, 2, "ai-secretary由来が除外されていません");
});

test("空文の投稿は学習材料にしない", () => {
  const posts = style.ownedPostsToLearningPosts([owned({ text: "   " })]);
  assert.equal(posts.length, 0);
});

/* ─── 重み ───────────────────────────────────────── */

test("本人が書いたアーカイブ投稿は重み2", () => {
  const posts = style.ownedPostsToLearningPosts([owned()]);
  assert.equal(posts[0].weight, 2);
});

test("本人が編集した下書きは重み2、未編集は1", () => {
  const posts = style.draftsToLearningPosts([
    draft({ id: "x", editedByUser: true }),
    draft({ id: "y", editedByUser: false }),
  ]);
  assert.equal(posts.find((p) => p.weight === 2) !== undefined, true);
  assert.equal(posts.find((p) => p.weight === 1) !== undefined, true);
});

test("未使用・破棄の下書きは学習材料にしない", () => {
  const posts = style.draftsToLearningPosts([
    draft({ id: "a", status: "draft" }),
    draft({ id: "b", status: "discarded" }),
    draft({ id: "c", status: "published" }),
  ]);
  assert.equal(posts.length, 1);
});

/* ─── CTA次元の扱い ──────────────────────────────── */

test("CTAの有無が判定できない材料はCTA次元に寄与しない", () => {
  // アーカイブ投稿は hasCta が undefined。ここで "no-cta" として数えると
  // 「本人はCTAを使わない」という誤った学習になる
  const archiveOnly = style.deriveStyleFromLearningPosts(
    style.ownedPostsToLearningPosts([owned(), owned({ id: "o2" })])
  );
  assert.equal(archiveOnly.cta, undefined);
});

test("下書きがあればCTA次元が学習される", () => {
  const result = style.deriveStyleFromLearningPosts(
    style.draftsToLearningPosts([draft({ urls: ["https://note.com/x"] })])
  );
  assert.equal(result.cta?.value, "cta");
});

/* ─── 種入れ判定 ─────────────────────────────────── */

test("本人由来の材料が無ければ seeded=false", () => {
  const sources = style.summarizeLearningSources({
    profile: style.defaultStyleProfile(),
    drafts: [draft({ editedByUser: false })],
    archivePosts: [],
    performanceRecords: [],
  });
  assert.equal(sources.seeded, false);
  assert.equal(sources.archive, 0);
});

test("アーカイブがあれば seeded=true", () => {
  const sources = style.summarizeLearningSources({
    profile: style.defaultStyleProfile(),
    drafts: [],
    archivePosts: [owned()],
    performanceRecords: [],
  });
  assert.equal(sources.seeded, true);
  assert.equal(sources.archive, 1);
});

test("本人が編集した下書きがあれば種入れ済みとみなす", () => {
  const sources = style.summarizeLearningSources({
    profile: style.defaultStyleProfile(),
    drafts: [draft({ editedByUser: true })],
    archivePosts: [],
    performanceRecords: [],
  });
  assert.equal(sources.seeded, true);
});

/* ─── manual の不可侵性（既存仕様の回帰） ─────────── */

test("本人が指定したフィールドは自動学習で上書きされない", () => {
  const profile = style.defaultStyleProfile();
  profile.opening = { description: "本人指定の書き出し", source: "manual", updatedAt: "2026-01-01T00:00:00Z" };

  const learned = style.computeLearnedStyleProfile(
    profile,
    [draft({ status: "published" })],
    [],
    { impressions: 1, likes: 1, replies: 1, reposts: 1, engagementRate: 1, profileVisits: 1, followersGained: 1, noteClicks: 1 },
    [owned()]
  );
  assert.equal(learned.opening.source, "manual");
  assert.equal(learned.opening.description, "本人指定の書き出し");
});
