/**
 * トレンドクラスタリングと採点のテスト。
 * 採点は決定的でなければならない（同じ入力なら必ず同じ点）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const cluster = await import(path.join(DIST, "note/research/cluster.js"));
const types = await import(path.join(DIST, "note/research/types.js"));
const genres = await import(path.join(DIST, "note/research/genres.js"));

/* ─── テスト用のダミーデータ ───────────────── */

function item(overrides = {}) {
  return {
    id: overrides.id ?? "r1",
    platform: "note",
    sourceType: "trend",
    sourceUrl: overrides.sourceUrl ?? "https://note.com/x/n/1",
    title: overrides.title ?? "AIで議事録を自動化した手順",
    textExcerpt: overrides.textExcerpt ?? "ChatGPTを使って議事録の作成を自動化した話です",
    detectedGenreIds: overrides.detectedGenreIds ?? ["ai"],
    fetchedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

const brand = {
  concept: "AI・副業・読書・資産形成・習慣を通じて、人生を少し豊かにする",
  targetReader: "本業を持ちながら少しずつ良くしていきたい20〜30代",
  painPoints: ["仕事が忙しく、自分の時間を作れない", "AIをどう取り入れるか分からない"],
  teaches: [],
  credibility: [],
  tone: "",
  ngList: [],
  funnel: [],
  updatedAt: "",
};

const baseCtx = { brand, experiences: [], pastTitles: [] };

/* ─── クラスタリング ───────────────────── */

test("似た内容は1つのテーマにまとまる", () => {
  const items = [
    item({ id: "a", sourceUrl: "u1", title: "AIで議事録を自動化する方法" }),
    item({ id: "b", sourceUrl: "u2", title: "AIを使った議事録の自動化手順" }),
  ];
  const groups = cluster.groupItems(items);
  assert.equal(groups.length, 1, "似た2件は1グループになるはず");
  assert.equal(groups[0].length, 2);
});

test("関係ない内容は別テーマに分かれる", () => {
  const items = [
    item({ id: "a", sourceUrl: "u1", title: "AIで議事録を自動化する方法" }),
    item({
      id: "b",
      sourceUrl: "u2",
      title: "つみたてNISAの銘柄をどう選んだか",
      textExcerpt: "投資信託の積立設定を見直した記録です",
      detectedGenreIds: ["asset-building"],
    }),
  ];
  assert.equal(cluster.groupItems(items).length, 2);
});

/* ─── 採点 ───────────────────────────── */

test("採点は決定的（同じ入力なら同じ点）", () => {
  const items = [item()];
  const a = cluster.buildClusters(items, baseCtx);
  const b = cluster.buildClusters(items, baseCtx);
  assert.equal(a[0].totalScore, b[0].totalScore);
  assert.equal(a[0].id, b[0].id, "IDも安定していること");
});

test("配点が仕様の上限を超えない", () => {
  const items = [
    item({ id: "a", sourceUrl: "u1", publicMetrics: { likes: 99999, reposts: 9999 } }),
    item({ id: "b", sourceUrl: "u2" }),
    item({ id: "c", sourceUrl: "u3" }),
    item({ id: "d", sourceUrl: "u4" }),
    item({ id: "e", sourceUrl: "u5" }),
  ];
  const [c] = cluster.buildClusters(items, baseCtx);
  assert.ok(c.trendScore <= 25, "話題性は25点まで");
  assert.ok(c.brandFitScore <= 25, "ブランド適合は25点まで");
  assert.ok(c.experienceFitScore <= 20, "体験一致は20点まで");
  assert.ok(c.monetizationFitScore <= 15, "収益導線は15点まで");
  assert.ok(c.originalityScore <= 15, "オリジナル化は15点まで");
  assert.ok(c.totalScore <= 100, "合計は100点まで");
});

test("まえみちの5ジャンルから離れたテーマは減点される", () => {
  const off = cluster.buildClusters(
    [item({ detectedGenreIds: ["politics"], title: "全然関係ない話題" })],
    baseCtx
  );
  assert.ok(
    off[0].penalties.some((p) => p.includes("5ジャンル")),
    "ジャンル外の減点理由が残ること"
  );
  assert.equal(off[0].brandFitScore, 0);
});

test("登録済みの体験があると体験一致スコアが上がる", () => {
  const experiences = [
    {
      id: "e1",
      title: "AIで議事録の作成を自動化した",
      summary: "ChatGPTに議事録のテンプレートを作らせた",
      whatHappened: "議事録の作成に毎回30分かかっていた",
      whatWasTried: "ChatGPTでテンプレートを作った",
      reusableFacts: ["議事録のテンプレートを作った"],
      genres: ["ai"],
      sourceType: "manual",
      verifiedByUser: true,
      sensitive: false,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const without = cluster.buildClusters([item()], baseCtx);
  const with_ = cluster.buildClusters([item()], { ...baseCtx, experiences });

  assert.ok(
    with_[0].experienceFitScore > without[0].experienceFitScore,
    "体験があるほうが高得点になること"
  );
  assert.deepEqual(with_[0].matchedExperienceIds, ["e1"]);
});

test("未確認の体験は満額評価されない", () => {
  const make = (verified) => [
    {
      id: "e1",
      title: "AIで議事録の作成を自動化した",
      summary: "ChatGPTに議事録のテンプレートを作らせた",
      whatHappened: "議事録の作成に毎回30分かかっていた",
      whatWasTried: "ChatGPTでテンプレートを作った",
      reusableFacts: [],
      genres: ["ai"],
      sourceType: "manual",
      verifiedByUser: verified,
      sensitive: false,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const verified = cluster.buildClusters([item()], { ...baseCtx, experiences: make(true) });
  const unverified = cluster.buildClusters([item()], { ...baseCtx, experiences: make(false) });
  assert.ok(
    unverified[0].experienceFitScore < verified[0].experienceFitScore,
    "未確認の体験は低く評価されること"
  );
});

test("過去に扱ったテーマは重複として減点される", () => {
  const ctx = { ...baseCtx, pastTitles: ["AIで議事録を自動化した手順を公開します"] };
  const [c] = cluster.buildClusters([item()], ctx);
  assert.ok(c.penalties.some((p) => p.includes("重複")), "重複の減点理由が残ること");
});

test("煽り表現が強いテーマは減点される", () => {
  const [c] = cluster.buildClusters(
    [item({ title: "誰でも必ず稼げるAI副業", textExcerpt: "今すぐ始めないと損です" })],
    baseCtx
  );
  assert.ok(c.penalties.some((p) => p.includes("煽り")));
});

/* ─── 高リスク題材のブロック ───────────── */

test("政治・医療・法律・投資助言・ギャンブルは自動公開対象外になる", () => {
  const cases = [
    ["選挙の争点を整理する", "政治"],
    ["うつ病の治療について", "医療"],
    ["訴訟に備える方法", "法律"],
    ["必ず儲かる推奨銘柄", "投資助言"],
    // 実リサーチで候補に上がったため追加
    ["競艇コロガシ革命 AI予想の黄金連鎖", "ギャンブル"],
  ];
  for (const [title, label] of cases) {
    const [c] = cluster.buildClusters([item({ title, textExcerpt: title })], baseCtx);
    assert.equal(c.blocked, true, `${label}: blockedになること`);
    assert.ok(c.blockReason?.includes(label), `${label}: 理由に種別が入ること`);
  }
});

test("AI競艇はAI・資産形成として扱わず、総合点も0になる", () => {
  const detected = genres.detectGenres("AI競艇予想に投資してコロガシを狙う");
  assert.deepEqual(detected, []);

  const [c] = cluster.buildClusters(
    [item({ title: "AI競艇予想", textExcerpt: "舟券のコロガシ", detectedGenreIds: detected })],
    baseCtx
  );
  assert.equal(c.blocked, true);
  assert.equal(c.totalScore, 0);
});

test("具体的なAI・読書の話題は判定し、一般的な「本当に」は読書にしない", () => {
  assert.deepEqual(genres.detectGenres("ChatGPTを仕事で活用する方法"), ["ai"]);
  assert.deepEqual(genres.detectGenres("この方法は本当に便利でした"), []);
  assert.deepEqual(genres.detectGenres("読書で学んだこと"), ["reading"]);
});

test("半導体と主要企業の話題は資産形成として判定する", () => {
  assert.deepEqual(genres.detectGenres("ラピダスの2ナノ半導体量産計画"), ["asset-building"]);
  assert.deepEqual(genres.detectGenres("キオクシアとマイクロンのメモリー市況"), ["asset-building"]);
  assert.deepEqual(genres.detectGenres("TSMCとNVIDIAのデータセンター需要"), ["asset-building"]);
});

test("通常のテーマはブロックされない", () => {
  const [c] = cluster.buildClusters([item()], baseCtx);
  assert.equal(c.blocked, false);
});

test("detectHighRisk は該当が無ければ null", () => {
  assert.equal(types.detectHighRisk("AIで議事録を自動化した"), null);
  assert.equal(types.detectHighRisk("必ず儲かる方法"), "投資助言");
});

/* ─── 状態の維持 ───────────────────────── */

test("使用済み・却下の状態は再リサーチで戻らない", () => {
  const items = [item()];
  const first = cluster.buildClusters(items, baseCtx);
  const used = first.map((c) => ({ ...c, status: "used" }));
  const second = cluster.buildClusters(items, baseCtx, used);
  assert.equal(second[0].status, "used", "usedのまま維持されること");
});

test("テーマ指定時は無関係な過去候補を混ぜず、新着の関連候補を優先する", () => {
  const semiconductor = item({
    id: "semi",
    sourceUrl: "semi-url",
    title: "半導体市場とメモリ需要",
    textExcerpt: "半導体の設備投資を調べた",
    detectedGenreIds: ["asset-building"],
  });
  const unrelated = item({
    id: "book",
    sourceUrl: "book-url",
    title: "読書習慣を続ける方法",
    textExcerpt: "毎日読書する",
    detectedGenreIds: ["reading"],
  });
  const clusters = cluster.buildClusters([unrelated, semiconductor], baseCtx);
  const selected = cluster.selectTopCandidates(
    clusters,
    [unrelated, semiconductor],
    "半導体",
    ["semi"]
  );
  assert.equal(selected.length, 1);
  assert.ok(selected[0].title.includes("半導体"));
});
