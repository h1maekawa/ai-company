/**
 * Fund Analyst 一次抽出のテスト
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST =
  process.env.FUND_DIST ??
  new URL("../../.test-dist", import.meta.url).pathname;
const { DEFAULT_POLICY } = await import(pathToFileURL(`${DIST}/policy.js`).href);
const { screenTicker, momentumPct, buildUniverse, rankResults } = await import(
  pathToFileURL(`${DIST}/analyst.js`).href
);

function makeBars(n, { closeFn, volumeFn } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const c = closeFn ? closeFn(i) : 100;
    return {
      date: `d${i}`,
      open: c,
      high: c * 1.01,
      low: c * 0.99,
      close: c,
      volume: volumeFn ? volumeFn(i) : 1_000_000,
    };
  });
}

test("上昇トレンド＋適度なRVOL＋高流動性で高スコア", () => {
  const bars = makeBars(210, {
    closeFn: (i) => 100 + i * 0.5, // 上昇トレンド
    volumeFn: (i) => (i === 209 ? 1_300_000 : 1_000_000), // RVOL 1.3（増加帯）
  });
  const r = screenTicker("NVDA", bars, DEFAULT_POLICY);
  assert.equal(r.trend, "up");
  assert.ok(r.screenScore >= 70, `score=${r.screenScore}`);
  assert.ok(!r.flags.includes("overheated"));
});

test("過熱銘柄（RVOL3超＋急騰）はRVOLスコア0＋overheatedフラグ", () => {
  const bars = makeBars(210, {
    closeFn: (i) => (i === 209 ? 182 : 100 + i * 0.3), // 前日162.4→182で当日+12%の急騰
    volumeFn: (i) => (i === 209 ? 4_000_000 : 1_000_000), // RVOL 4.0
  });
  const r = screenTicker("XXX", bars, DEFAULT_POLICY);
  assert.ok(r.flags.includes("overheated"));
  assert.equal(r.subScores.rvol, 0);
});

test("下落トレンドはトレンドスコア0", () => {
  const bars = makeBars(210, { closeFn: (i) => 300 - i });
  const r = screenTicker("YYY", bars, DEFAULT_POLICY);
  assert.equal(r.trend, "down");
  assert.equal(r.subScores.trend, 0);
});

test("低流動性はフラグ付き・流動性スコア0", () => {
  const bars = makeBars(210, {
    closeFn: (i) => 10 + i * 0.01,
    volumeFn: () => 1_000, // ADTV極小
  });
  const r = screenTicker("ZZZ", bars, DEFAULT_POLICY);
  assert.ok(r.flags.includes("low_liquidity"));
  assert.equal(r.subScores.liquidity, 0);
});

test("データ不足はスコア0＋no_data", () => {
  const r = screenTicker("AAA", null, DEFAULT_POLICY);
  assert.equal(r.screenScore, 0);
  assert.ok(r.flags.includes("no_data"));
});

test("momentumPct: 5営業日騰落率", () => {
  const bars = makeBars(10, { closeFn: (i) => (i >= 5 ? 110 : 100) });
  assert.equal(momentumPct(bars, 5), 10);
});

test("buildUniverse: 保有＋テーマ＋監視銘柄の和集合（重複なし）", () => {
  const holdings = [
    { category: "米国株式", code: "NVDA", name: "", marketValueJpy: 1000, quantity: 1, avgCost: 1, currentPrice: 1, pnlJpy: 0, pnlPct: 0 },
    { category: "投資信託", code: "", name: "楽天VTI", marketValueJpy: 2000, quantity: 1, avgCost: 1, currentPrice: 1, pnlJpy: 0, pnlPct: 0 },
  ];
  const u = buildUniverse(DEFAULT_POLICY, holdings);
  assert.ok(u.includes("NVDA"));
  assert.ok(u.includes("MU")); // テーマ由来
  assert.ok(u.includes("VRT")); // universeExtra由来
  assert.equal(new Set(u).size, u.length); // 重複なし
  assert.ok(!u.includes("")); // 投信は除外
});

test("rankResults: テーマ超過フラグ付与＋スコア降順", () => {
  const holdings = [
    { category: "米国株式", code: "NVDA", name: "", marketValueJpy: 428_172, quantity: 1, avgCost: 1, currentPrice: 1, pnlJpy: 0, pnlPct: 0 },
    { category: "米国株式", code: "MU", name: "", marketValueJpy: 137_869, quantity: 1, avgCost: 1, currentPrice: 1, pnlJpy: 0, pnlPct: 0 },
    { category: "米国株式", code: "KO", name: "", marketValueJpy: 79_472, quantity: 1, avgCost: 1, currentPrice: 1, pnlJpy: 0, pnlPct: 0 },
  ];
  const base = { priceUsd: 100, priceAsOf: "d", rvol20: 1, adtv20Usd: 1e9, changePct: 0, momentumPct: 0, trend: "up", subScores: { trend: 0, rvol: 0, momentum: 0, liquidity: 0 }, flags: [] };
  const ranked = rankResults(
    [
      { ...base, ticker: "KO", screenScore: 40, flags: [] },
      { ...base, ticker: "AMD", screenScore: 80, flags: [] },
    ],
    DEFAULT_POLICY,
    holdings
  );
  assert.equal(ranked[0].ticker, "AMD"); // スコア降順
  assert.ok(ranked[0].flags.includes("theme_over_limit")); // 半導体87.7% > 70%
  assert.equal(ranked[1].theme, null); // KOは無テーマ
  assert.equal(ranked[1].isHeld, true);
});
