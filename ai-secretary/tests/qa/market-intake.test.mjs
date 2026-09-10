/**
 * Marketエージェントの取り込み（要件5）のテスト
 *
 * 気にしているのは2点。
 *   1. 同じ材料を二重に取り込まないこと（IDがbriefから決まること）
 *   2. 非公開の数値やAIの解釈が、リサーチ材料に混入しないこと
 * 特に2は learningBrief と同じ原則で、破ると投稿本文まで伝播する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "agents");
const market = await import(path.join(OUT, "marketMapping.js"));

const brief = (over = {}) => ({
  id: "ilb-2026-09-11",
  date: "2026-09-11",
  hasContent: true,
  whatHappened: "半導体株が全体的に下げた",
  whyRelevant: "保有しているNVDAが同じ流れの中にある",
  termToLearn: { term: "セクターローテーション", explanation: "資金が業種間を移動すること" },
  portfolioRelation: "保有比率の偏りが目立つ",
  aiInterpretation: "AIによる解釈テキスト",
  nextThingsToWatch: ["次回決算", "金利の動き"],
  todaysQuestion: "なぜ同じ業種がまとめて動くのか",
  factsUsed: { tickers: ["NVDA"], newsIds: ["n1"], pnlSnapshot: "NVDA:12.3" },
  createdAt: "2026-09-11T00:00:00Z",
  ...over,
});

/* ─── 重複防止 ───────────────────────────────────── */

test("ResearchItemのIDはbriefから決まる（同じ材料は必ず同じID）", () => {
  assert.equal(market.marketItemId("ilb-2026-09-11"), "mkt-ilb-2026-09-11");
  const a = market.briefToResearchItem(brief());
  const b = market.briefToResearchItem(brief());
  assert.equal(a.id, b.id);
});

/* ─── 混入の防止 ─────────────────────────────────── */

test("【重要】AIの解釈をリサーチ材料に入れない（事実だけを渡す）", () => {
  const item = market.briefToResearchItem(brief());
  assert.doesNotMatch(item.textExcerpt, /AIによる解釈テキスト/);
});

test("【重要】損益スナップショットなど非公開の数値を入れない", () => {
  const item = market.briefToResearchItem(
    brief({ factsUsed: { tickers: ["NVDA"], newsIds: [], pnlSnapshot: "NVDA:12.3" } })
  );
  const serialized = JSON.stringify(item);
  assert.doesNotMatch(serialized, /12\.3/);
});

/* ─── 写像の内容 ─────────────────────────────────── */

test("事実と用語解説が材料に入る", () => {
  const item = market.briefToResearchItem(brief());
  assert.match(item.textExcerpt, /半導体株が全体的に下げた/);
  assert.match(item.textExcerpt, /保有しているNVDA/);
  assert.match(item.textExcerpt, /セクターローテーション/);
});

test("出所を辿れる形で残る", () => {
  const item = market.briefToResearchItem(brief());
  assert.match(item.sourceUrl, /investment-learning-briefs#ilb-2026-09-11/);
  assert.equal(item.authorName, "Market Agent");
  assert.equal(item.platform, "web");
  assert.equal(item.sourceType, "trend");
});

test("読者の疑問と次に見ることが生成側の型として渡る", () => {
  const item = market.briefToResearchItem(brief());
  assert.equal(item.readerProblem, "なぜ同じ業種がまとめて動くのか");
  assert.match(item.emotionalAngle, /次回決算/);
});

test("ティッカーがタイトルに出る（何の話か一目で分かる）", () => {
  const item = market.briefToResearchItem(brief());
  assert.match(item.title, /2026-09-11/);
  assert.match(item.title, /NVDA/);
});

test("ジャンルが必ず1つ以上付く（クラスタ化の前提）", () => {
  const item = market.briefToResearchItem(brief());
  assert.ok(item.detectedGenreIds.length > 0);
});
