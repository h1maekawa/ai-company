/**
 * トレンドクラスタリングと採点のテスト。
 * 採点は決定的でなければならない（同じ入力なら必ず同じ点）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const DIST = process.env.MAEMICHI_DIST;
const cluster = await import(path.join(DIST, "note/research/cluster.js"));
const types = await import(path.join(DIST, "note/research/types.js"));
const genres = await import(path.join(DIST, "note/research/genres.js"));
const xQuery = await import(path.join(DIST, "note/research/x-query.js"));
const xFormat = await import(path.join(DIST, "note/research/x-format.js"));
const performance = await import(path.join(DIST, "note/research/performance.js"));
const noteTypes = await import(path.join(DIST, "note/types.js"));

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

test("Hot Score v1 は欠損メトリクスを0ではなくUNKNOWNとして残す", () => {
  const [candidate] = cluster.buildClusters([item()], {
    ...baseCtx,
    now: "2026-07-30T01:00:00.000Z",
  });
  assert.equal(candidate.hotScoreBreakdown.momentum, null);
  assert.equal(candidate.hotScoreBreakdown.ownPerformanceFit, null);
  assert.equal(candidate.hotScoreBreakdown.measuredPostCount, 0);
  assert.equal(candidate.hotConfidence, "LOW");
});

test("MomentumはimpressionsだけではUNKNOWNのまま", () => {
  const [candidate] = cluster.buildClusters([
    item({ publicMetrics: { impressions: 10_000 } }),
  ], { ...baseCtx, now: "2026-07-30T01:00:00.000Z" });
  assert.equal(candidate.hotScoreBreakdown.momentum, null);
});

test("Momentumはengagement metricが1つでも取得できれば数値になる", () => {
  const [candidate] = cluster.buildClusters([
    item({ publicMetrics: { likes: 0 } }),
  ], { ...baseCtx, now: "2026-07-30T01:00:00.000Z" });
  assert.equal(typeof candidate.hotScoreBreakdown.momentum, "number");
  assert.equal(candidate.hotScoreBreakdown.momentum, 0, "実測0はUNKNOWNと区別する");
});

test("同じengagementなら公開からの時間が短い投稿ほどMomentumが高い", () => {
  const now = "2026-07-30T12:00:00.000Z";
  const metrics = { likes: 60, replies: 10, reposts: 10 };
  const [recent] = cluster.buildClusters([
    item({ publishedAt: "2026-07-30T10:00:00.000Z", publicMetrics: metrics }),
  ], { ...baseCtx, now });
  const [old] = cluster.buildClusters([
    item({ publishedAt: "2026-07-23T12:00:00.000Z", publicMetrics: metrics }),
  ], { ...baseCtx, now });
  assert.ok(recent.hotScoreBreakdown.momentum > old.hotScoreBreakdown.momentum);
});

test("FreshnessはpublishedAtだけを使い、recentはoldより高い", () => {
  const now = "2026-07-30T12:00:00.000Z";
  const [recent] = cluster.buildClusters([
    item({ publishedAt: "2026-07-30T10:00:00.000Z" }),
  ], { ...baseCtx, now });
  const [old] = cluster.buildClusters([
    item({ publishedAt: "2026-07-20T12:00:00.000Z" }),
  ], { ...baseCtx, now });
  const [unknown] = cluster.buildClusters([
    item({ publishedAt: undefined, fetchedAt: "2026-07-30T11:59:00.000Z" }),
  ], { ...baseCtx, now });
  assert.ok(recent.hotScoreBreakdown.freshness > old.hotScoreBreakdown.freshness);
  assert.equal(unknown.hotScoreBreakdown.freshness, null);
});

test("Cross-sourceは同一domainの複数URLを1 sourceとして数える", () => {
  const sameDomain = ["a", "b", "c"].map((suffix, index) => item({
    id: `same-${index}`,
    sourceUrl: `https://example.com/${suffix}`,
  }));
  const differentDomains = ["example.com", "other.com", "third.com"].map((host, index) => item({
    id: `different-${index}`,
    sourceUrl: `https://${host}/article`,
  }));
  const [same] = cluster.buildClusters(sameDomain, baseCtx);
  const [different] = cluster.buildClusters(differentDomains, baseCtx);
  assert.equal(same.hotScoreBreakdown.crossSourceEvidence, 5);
  assert.ok(different.hotScoreBreakdown.crossSourceEvidence > same.hotScoreBreakdown.crossSourceEvidence);
});

test("Cross-sourceはXの異なるsourceAccountIdを独立sourceとして数える", () => {
  const items = ["account-a", "account-b"].map((sourceAccountId, index) => item({
    id: `x-${index}`,
    platform: "x",
    sourceAccountId,
    sourceUrl: `https://x.com/${sourceAccountId}/status/${index + 1}`,
  }));
  const [candidate] = cluster.buildClusters(items, baseCtx);
  assert.equal(candidate.hotScoreBreakdown.crossSourceEvidence, 10);
});

test("本人実績は10投稿未満では加点せず、10投稿から参考値にする", () => {
  const records = Array.from({ length: 10 }, (_, index) => ({
    contentId: `p${index}`,
    platform: "x",
    purpose: "reach",
    genreId: "ai",
    publishedAt: "2026-07-29T00:00:00.000Z",
    measuredAt: "2026-07-30T00:00:00.000Z",
    impressions: 100 + index,
  }));
  const [tooFew] = cluster.buildClusters([item()], { ...baseCtx, performance: records.slice(0, 9) });
  const [enough] = cluster.buildClusters([item()], { ...baseCtx, performance: records });
  assert.equal(tooFew.hotScoreBreakdown.ownPerformanceFit, null);
  assert.equal(typeof enough.hotScoreBreakdown.ownPerformanceFit, "number");
  assert.equal(enough.hotScoreBreakdown.measuredPostCount, 10);
});

function performanceRecords(total, matching, prefix) {
  return Array.from({ length: total }, (_, index) => ({
    contentId: `${prefix}-${index}`,
    platform: "x",
    purpose: "reach",
    genreId: index < matching ? "ai" : "reading",
    publishedAt: "2026-07-29T00:00:00.000Z",
    measuredAt: "2026-07-30T00:00:00.000Z",
    impressions: index < matching ? 200 : 100,
  }));
}

test("Own Performanceは全体20件でも対象genreが1件ならUNKNOWN", () => {
  const [candidate] = cluster.buildClusters([item()], {
    ...baseCtx,
    performance: performanceRecords(20, 1, "single"),
  });
  assert.equal(candidate.hotScoreBreakdown.ownPerformanceFit, null);
});

test("Own Performanceは全体10件以上かつ対象genre 3件以上で計算する", () => {
  const [candidate] = cluster.buildClusters([item()], {
    ...baseCtx,
    performance: performanceRecords(20, 3, "partial"),
  });
  assert.equal(typeof candidate.hotScoreBreakdown.ownPerformanceFit, "number");
});

test("Own Performanceは30件以上でpartialではなくfull weightを使う", () => {
  const [partial] = cluster.buildClusters([item()], {
    ...baseCtx,
    performance: performanceRecords(20, 3, "partial-weight"),
  });
  const [full] = cluster.buildClusters([item()], {
    ...baseCtx,
    performance: performanceRecords(30, 3, "full-weight"),
  });
  assert.ok(
    full.hotScoreBreakdown.ownPerformanceFit > partial.hotScoreBreakdown.ownPerformanceFit
  );
});

test("過去テーマとの反復はHot Scoreにも減点として記録する", () => {
  const [candidate] = cluster.buildClusters([item()], {
    ...baseCtx,
    pastTitles: ["AIで議事録を自動化した手順を公開します"],
  });
  assert.equal(candidate.hotScoreBreakdown.repetitionPenalty, 10);
});

test("Hot Confidenceの新旧混在時はLegacyを候補へ混ぜない", () => {
  const legacy = { id: "legacy" };
  const low = { id: "low", hotConfidence: "LOW" };
  const medium = { id: "medium", hotConfidence: "MEDIUM" };
  const high = { id: "high", hotConfidence: "HIGH" };
  assert.deepEqual(
    cluster.filterHotConfidenceCandidates([legacy, low, medium, high]).map((item) => item.id),
    ["medium", "high"]
  );
});

test("Hot Confidenceが全件Legacyなら従来候補へfallbackする", () => {
  const legacy = [{ id: "legacy-a" }, { id: "legacy-b" }];
  assert.deepEqual(cluster.filterHotConfidenceCandidates(legacy), legacy);
});

test("採点済みがLOWだけならLegacyが混在していても全件見送る", () => {
  const candidates = cluster.filterHotConfidenceCandidates([
    { id: "legacy" },
    { id: "low", hotConfidence: "LOW" },
  ]);
  assert.deepEqual(candidates, []);
});

test("LOW onlyは見送り、HIGH + LOWはHIGHだけを残す", () => {
  assert.deepEqual(cluster.filterHotConfidenceCandidates([{ id: "low", hotConfidence: "LOW" }]), []);
  assert.deepEqual(
    cluster.filterHotConfidenceCandidates([
      { id: "high", hotConfidence: "HIGH" },
      { id: "low", hotConfidence: "LOW" },
    ]).map((candidate) => candidate.id),
    ["high"]
  );
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

test("仕事・キャリアと個人開発を新しい切り口として判定する", () => {
  assert.deepEqual(genres.detectGenres("役員という肩書きと働き方を考える"), ["career"]);
  assert.ok(genres.detectGenres("個人開発でWebサービスを作った記録").includes("personal-development"));
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

test("指定したブランド軸の候補だけを返す", () => {
  const aiItem = item({
    id: "ai-topic",
    sourceUrl: "ai-url",
    title: "生成AIの仕事活用",
    detectedGenreIds: ["ai"],
  });
  const investingItem = item({
    id: "invest-topic",
    sourceUrl: "invest-url",
    title: "半導体市場",
    detectedGenreIds: ["asset-building"],
  });
  const clusters = cluster.buildClusters([aiItem, investingItem], baseCtx);
  const selected = cluster.selectTopCandidates(
    clusters,
    [aiItem, investingItem],
    undefined,
    [],
    undefined,
    "asset-building"
  );
  assert.equal(selected.length, 1);
  assert.ok(selected[0].genreIds.includes("asset-building"));
});

test("X検索条件へ日本語とリポスト除外を自動補完する", () => {
  assert.equal(
    xQuery.normalizeXQuery('("NVIDIA" OR TSMC) 半導体'),
    '("NVIDIA" OR TSMC) 半導体 lang:ja -is:retweet'
  );
  assert.equal(
    xQuery.normalizeXQuery("NISA lang:ja -is:retweet"),
    "NISA lang:ja -is:retweet"
  );
});

test("半導体テーマはAPI量を抑えて複数クエリへ分割する", () => {
  const queries = xQuery.buildXQueries({ focusTopic: "半導体", maxQueries: 4 });
  assert.equal(queries.length, 4);
  assert.ok(queries.every((query) => query.includes("lang:ja -is:retweet")));
  assert.ok(queries.some((query) => query.includes("NVIDIA")));
  assert.ok(queries.some((query) => query.includes("マイクロン")));
});

test("手動X検索条件は自動展開より優先する", () => {
  const queries = xQuery.buildXQueries({
    focusTopic: "半導体",
    xQuery: '"嫌われる勇気" 仕事 -広告',
  });
  assert.deepEqual(queries, ['"嫌われる勇気" 仕事 -広告 lang:ja -is:retweet']);
});

test("X生成形式ごとの必要な下書き数を固定する", () => {
  assert.deepEqual(xFormat.expectedDraftCount("x-post"), { min: 3, max: 3 });
  assert.deepEqual(xFormat.expectedDraftCount("x-thread"), { min: 2, max: 7 });
  assert.deepEqual(xFormat.expectedDraftCount("x-and-note"), { min: 5, max: 5 });
});

test("未認識のメディア案と投稿型は安全な初期値へ戻す", () => {
  assert.equal(xFormat.normalizeMediaSuggestion("unknown"), "text");
  assert.equal(xFormat.normalizeXPattern("unknown", "x-post"), "opinion");
  assert.equal(xFormat.normalizeXPattern("publish", "x-and-note"), "note-link");
});

test("ブランドv1初期値だけをv2へ移行し、利用者編集は残す", () => {
  const v1 = noteTypes.defaultBrand();
  v1.identity.version = "maemichi-v1";
  v1.identity.xProfile = noteTypes.MAEMICHI_V1_DEFAULTS.identity.xProfile;
  v1.identity.xProfileShort = noteTypes.MAEMICHI_V1_DEFAULTS.identity.xProfileShort;
  v1.identity.fixedPost = noteTypes.MAEMICHI_V1_DEFAULTS.identity.fixedPost;
  v1.concept = noteTypes.MAEMICHI_V1_DEFAULTS.concept;
  v1.credibility = ["本人が登録した事実"];
  const migrated = noteTypes.migrateBrandV1ToV2(v1);
  assert.equal(migrated.identity.version, "maemichi-v2");
  assert.match(migrated.identity.xProfile, /人生の寄り道/);
  assert.equal(migrated.credibility[0], "本人が登録した事実");
  assert.equal(migrated.contentPillars.reduce((sum, pillar) => sum + pillar.targetRatio, 0), 100);

  v1.identity.xProfile = "利用者が編集したプロフィール";
  assert.equal(noteTypes.migrateBrandV1ToV2(v1).identity.xProfile, "利用者が編集したプロフィール");
});

test("X automation Persona名はSSOTを使い旧defaultだけを移行する", () => {
  const base = noteTypes.defaultXAccounts()[0];
  assert.equal(base.label, noteTypes.X_AUTOMATION_PERSONA_NAME);

  const oldDefault = { ...base, id: "maemichi", label: "まえみち" };
  const custom = { ...base, id: "maemichi", label: "まえみち投資" };
  const migrated = noteTypes.migrateXAutomationPersonaName([oldDefault, custom]);
  assert.equal(migrated[0].label, noteTypes.X_AUTOMATION_PERSONA_NAME);
  assert.equal(migrated[1].label, "まえみち投資");
  assert.equal(migrated[1], custom, "custom labelは書換対象にしない");
});

test("X Persona migrationはBrand identityを変更しない", () => {
  const brand = noteTypes.defaultBrand();
  const identity = structuredClone(brand.identity);
  noteTypes.migrateXAutomationPersonaName([
    { ...noteTypes.defaultXAccounts()[0], label: "まえみち" },
  ]);
  assert.deepEqual(brand.identity, identity);
  assert.equal(brand.identity.name, "まえみち");
});

test("投稿指標は0除算せず、未取得をundefinedで維持する", () => {
  const rates = performance.performanceRates({
    contentId: "x1", platform: "x", purpose: "reach", genreId: "daily-thoughts",
    publishedAt: "2026-08-04T09:00:00.000Z", measuredAt: "2026-08-04T10:00:00.000Z",
    impressions: 0, replies: 0,
  });
  assert.equal(rates.replyRate, undefined);
  assert.equal(rates.bookmarkRate, undefined);
});

test("収益化進捗は500万までの残りを計算し、収益額を予測しない", () => {
  const projection = performance.monetizationProjection({
    organicImpressions90Days: 1_000_000,
    requiredOrganicImpressions: 5_000_000,
    verifiedFollowers: 120,
    requiredVerifiedFollowers: 500,
    lastCheckedAt: "2026-08-04T00:00:00.000Z",
  });
  assert.equal(projection.remainingImpressions, 4_000_000);
  assert.equal(projection.verifiedFollowersRemaining, 380);
  assert.equal("estimatedRevenue" in projection, false);
});

test("投稿割合は直近30件だけを集計し、選択を強制しない", () => {
  const records = Array.from({ length: 35 }, (_, index) => ({
    contentId: `x${index}`, platform: "x", purpose: "reach",
    genreId: index < 20 ? "ai" : "daily-thoughts",
    publishedAt: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
    measuredAt: "2026-08-04T01:00:00.000Z",
  }));
  const balance = performance.contentPillarBalance(records, noteTypes.DEFAULT_CONTENT_PILLARS);
  assert.equal(balance.length, 7);
  assert.ok(balance.find((item) => item.id === "ai").currentRatio >= 0);
});

test("日常投稿APIはX APIや外部リサーチを参照しない", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/note/content/generate-daily/route.ts"), "utf8");
  assert.doesNotMatch(source, /researchX|X_API|api\\.x\\.com|x-trends|x-search/);
  assert.match(source, /generateXPosts/);
});
