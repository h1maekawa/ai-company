/**
 * Fund Department ポリシーエンジン 受入テスト
 * docs/12_FUND_POLICY_ENGINE.md §20 テスト受入条件
 *
 * 実行: npm run test:fund （scripts/test-fund.sh がtsc→node --testを行う）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST =
  process.env.FUND_DIST ??
  new URL("../../.test-dist", import.meta.url).pathname;
const { DEFAULT_POLICY } = await import(
  pathToFileURL(`${DIST}/policy.js`).href
);
const { evaluate, runGates, calcMaxBuy, headroomJpy, totalScore } =
  await import(pathToFileURL(`${DIST}/engine.js`).href);

const NOW = new Date("2026-07-19T12:00:00+09:00");
const FRESH = "2026-07-19T09:00:00+09:00"; // 3時間前
const STALE = "2026-07-17T09:00:00+09:00"; // 51時間前

/** 全ゲートを通過する健全な入力（各テストで一部を壊す） */
function baseInput(overrides = {}) {
  return {
    ticker: "KO",
    horizon: "long",
    capacity: {
      investableJpy: 50_000,
      calculatedAt: FRESH,
      confidence: "high",
      missingData: [],
    },
    portfolio: {
      totalInvestmentAssetsJpy: 2_054_100,
      stockValueJpy: 645_514,
      fundValueJpy: 1_408_586,
      tickerValueJpy: 79_472, // KO: 個別株内12.3%
      themeValueJpy: 0, // KOは無テーマ
      isHeld: false,
    },
    market: {
      env: "RISK_ON",
      priceJpy: 10_000,
      priceAsOf: "2026-07-18",
      rvol20: 1.1,
      adtv20Usd: 500_000_000,
      spreadPct: 0.02,
      atr14: 200,
      changePct: 0.5,
      daysToEarnings: 30,
    },
    scores: { growth: 20, moat: 18, financial: 14, valuation: 9, mgmt: 8, fcf: 8 }, // 計77
    volumeScoreKeys: ["volume"],
    thesis: {
      summary: "テスト仮説",
      invalidation: "仮説崩壊条件",
      hasNewCatalyst: false,
      hypothesisMaintained: true,
    },
    exit: { exitPriceJpy: 8_000 },
    drawdownFromCostPct: null,
    reasons: ["テスト根拠"],
    counterarguments: ["テスト反対材料"],
    now: NOW,
    ...overrides,
  };
}

// ─── §20: 投資可能額0円以下で購入株数が必ず0 ───────────────

test("投資可能額0円で maxShares=0 / BUY_CANDIDATEにならない", () => {
  const r = evaluate(
    baseInput({ capacity: { investableJpy: 0, calculatedAt: FRESH, confidence: "high", missingData: [] } }),
    DEFAULT_POLICY
  );
  assert.equal(r.maxShares, 0);
  assert.equal(r.maxBuyJpy, 0);
  assert.notEqual(r.decision, "BUY_CANDIDATE");
  assert.ok(r.blockedBy.includes("investable_amount_zero_or_negative"));
});

test("投資可能額マイナスでも購入0", () => {
  const r = evaluate(
    baseInput({ capacity: { investableJpy: -10_000, calculatedAt: FRESH, confidence: "high", missingData: [] } }),
    DEFAULT_POLICY
  );
  assert.equal(r.maxShares, 0);
  assert.notEqual(r.decision, "BUY_CANDIDATE");
});

// ─── §20: Flow+/capacity更新24時間超で WAIT_DATA ────────────

test("capacityが24時間超経過で WAIT_DATA・購入0", () => {
  const r = evaluate(
    baseInput({ capacity: { investableJpy: 50_000, calculatedAt: STALE, confidence: "high", missingData: [] } }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "WAIT_DATA");
  assert.equal(r.maxShares, 0);
  assert.ok(r.blockedBy.includes("capacity_stale_over_24h"));
});

test("confidence=low で WAIT_DATA", () => {
  const r = evaluate(
    baseInput({ capacity: { investableJpy: 50_000, calculatedAt: FRESH, confidence: "low", missingData: [] } }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "WAIT_DATA");
});

test("missing_dataありで WAIT_DATA", () => {
  const r = evaluate(
    baseInput({ capacity: { investableJpy: 50_000, calculatedAt: FRESH, confidence: "high", missingData: ["bank_balance"] } }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "WAIT_DATA");
  assert.ok(r.missingData.includes("bank_balance"));
});

// ─── §20: 古い株価で購入候補を出さない ──────────────────────

test("株価が鮮度上限超で WAIT_DATA", () => {
  const r = evaluate(
    baseInput({
      market: { ...baseInput().market, priceAsOf: "2026-07-10" },
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "WAIT_DATA");
  assert.ok(r.blockedBy.includes("price_stale"));
});

test("株価なしで WAIT_DATA", () => {
  const r = evaluate(
    baseInput({
      market: { ...baseInput().market, priceJpy: null, priceAsOf: null },
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "WAIT_DATA");
});

// ─── §20: 1銘柄40%超で追加購入額0円 ─────────────────────────

test("1銘柄が個別株内40%超で購入0（NVDA 66%相当）", () => {
  const r = evaluate(
    baseInput({
      ticker: "NVDA",
      portfolio: {
        ...baseInput().portfolio,
        tickerValueJpy: 428_172, // 66.3% > 40%
        themeValueJpy: 566_041,
        isHeld: true,
      },
      scores: { growth: 20, moat: 20, financial: 15, valuation: 10, mgmt: 10, fcf: 5 }, // 80点でも
      thesis: { ...baseInput().thesis, hasNewCatalyst: true },
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.maxBuyJpy, 0);
  assert.equal(r.maxShares, 0);
  assert.ok(r.blockedBy.includes("single_stock_limit"));
  assert.notEqual(r.decision, "ADD_CANDIDATE");
  assert.notEqual(r.decision, "BUY_CANDIDATE");
});

// ─── §20: 上限超過だけでは自動売却しない ────────────────────

test("上限超過でもスコアが高ければ EXIT/TRIMにしない（HOLD）", () => {
  const r = evaluate(
    baseInput({
      ticker: "NVDA",
      portfolio: {
        ...baseInput().portfolio,
        tickerValueJpy: 428_172,
        themeValueJpy: 566_041,
        isHeld: true,
      },
      scores: { growth: 20, moat: 20, financial: 15, valuation: 10, mgmt: 10, fcf: 7 }, // 82
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.decision, "HOLD");
});

// ─── §20: テーマ70%超で同テーマ追加購入額0円 ────────────────

test("半導体テーマ87.69%でMU追加購入0", () => {
  const r = evaluate(
    baseInput({
      ticker: "MU",
      portfolio: {
        ...baseInput().portfolio,
        tickerValueJpy: 137_869, // 21.4% <40 単体はOK
        themeValueJpy: 566_041, // 87.7% >70 テーマNG
        isHeld: true,
      },
      scores: { growth: 22, moat: 18, financial: 15, valuation: 10, mgmt: 8, fcf: 5 }, // 78
      thesis: { ...baseInput().thesis, hasNewCatalyst: true },
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.maxBuyJpy, 0);
  assert.ok(r.blockedBy.includes("theme_limit"));
  assert.notEqual(r.decision, "ADD_CANDIDATE");
});

test("テーマ外銘柄（KO）はテーマ上限の影響を受けない", () => {
  const r = evaluate(baseInput(), DEFAULT_POLICY);
  assert.equal(r.decision, "BUY_CANDIDATE");
  assert.ok(r.maxShares > 0);
  assert.ok(!r.blockedBy.includes("theme_limit"));
});

// ─── §20: RVOL単独では BUY_CANDIDATE にならない ─────────────

test("出来高系素点のみ（RVOL単独）では購入候補にしない", () => {
  const r = evaluate(
    baseInput({
      horizon: "short",
      scores: { volume: 90 },
      volumeScoreKeys: ["volume"],
      market: { ...baseInput().market, rvol20: 2.5 },
    }),
    DEFAULT_POLICY
  );
  assert.notEqual(r.decision, "BUY_CANDIDATE");
  assert.ok(r.blockedBy.includes("rvol_only_signal"));
  assert.equal(r.maxShares, 0);
});

test("RVOL高＋当日10%超上昇は OVERHEATED として購入不可", () => {
  const r = evaluate(
    baseInput({
      horizon: "short",
      market: { ...baseInput().market, rvol20: 3.5, changePct: 12 },
      scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 },
      volumeScoreKeys: ["volume"],
    }),
    DEFAULT_POLICY
  );
  assert.ok(r.blockedBy.includes("overheated"));
  assert.notEqual(r.decision, "BUY_CANDIDATE");
});

// ─── §20: スプレッド不明の短期銘柄は実資金購入不可 ──────────

/** 実資金モード用ポリシー（paper mode無効） */
const REAL_MONEY_POLICY = {
  ...DEFAULT_POLICY,
  paperMode: { ...DEFAULT_POLICY.paperMode, enabled: false },
};

test("実資金モード: スプレッド不明＋短期は購入不可、長期は警告のみ", () => {
  const short = evaluate(
    baseInput({
      horizon: "short",
      market: { ...baseInput().market, spreadPct: null },
      scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 },
    }),
    REAL_MONEY_POLICY
  );
  assert.ok(short.blockedBy.includes("spread_unknown_short"));
  assert.notEqual(short.decision, "BUY_CANDIDATE");
  assert.equal(short.maxShares, 0);

  const long = evaluate(
    baseInput({ market: { ...baseInput().market, spreadPct: null } }),
    DEFAULT_POLICY
  );
  assert.ok(long.warnings.includes("spread_unknown"));
  assert.equal(long.decision, "BUY_CANDIDATE"); // 長期は警告付きで可
});

test("paper mode: スプレッド不明でも短期の仮想提案は生成される（executionBlocked=true）", () => {
  const r = evaluate(
    baseInput({
      horizon: "short",
      market: { ...baseInput().market, spreadPct: null },
      scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 }, // 80
    }),
    DEFAULT_POLICY // paperMode.enabled: true
  );
  assert.equal(r.decision, "BUY_CANDIDATE"); // 仮想候補は生成される
  assert.equal(r.executionBlocked, true); // ただし実資金執行は不可
  assert.ok(r.blockedBy.includes("spread_unknown"));
  assert.ok(r.maxShares > 0); // 仮想売買用の数量は計算される
  assert.equal(
    r.assumedRoundTripCostPct,
    DEFAULT_POLICY.paperMode.assumedRoundTripCostPct
  ); // 保守的な往復コストを明示
});

test("paper mode: スプレッド以外の阻害要因（テーマ上限等）は仮想でも購入0のまま", () => {
  const r = evaluate(
    baseInput({
      ticker: "MU",
      horizon: "short",
      market: { ...baseInput().market, spreadPct: null },
      portfolio: {
        ...baseInput().portfolio,
        tickerValueJpy: 137_869,
        themeValueJpy: 566_041, // テーマ87.7% > 70%
        isHeld: true,
      },
      scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 },
    }),
    DEFAULT_POLICY
  );
  assert.ok(r.blockedBy.includes("theme_limit"));
  assert.equal(r.maxShares, 0);
  assert.notEqual(r.decision, "BUY_CANDIDATE");
});

test("スプレッド既知で実資金モードの短期はexecutionBlockedにならない", () => {
  const r = evaluate(
    baseInput({
      horizon: "short",
      scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 },
    }),
    REAL_MONEY_POLICY
  );
  assert.equal(r.decision, "BUY_CANDIDATE");
  assert.equal(r.executionBlocked, false);
  assert.equal(r.assumedRoundTripCostPct, null); // 実資金時はnull
});

// ─── §9.1: 損失予算はmin()へ「最大損失額÷撤退率」で入る ─────

test("損失予算: 総資産200万×短期0.5%×撤退幅8% → 購入可能額は約12.5万円（1万円ではない）", () => {
  const input = baseInput({
    horizon: "short",
    capacity: {
      investableJpy: 10_000_000, // 資金制約を外してリスク上限を分離
      calculatedAt: FRESH,
      confidence: "high",
      missingData: [],
    },
    portfolio: {
      totalInvestmentAssetsJpy: 2_000_000,
      stockValueJpy: 1_000_000, // 1銘柄40%余地(≈66.7万円)がリスク上限より大きくなる規模にして分離
      fundValueJpy: 1_000_000,
      tickerValueJpy: 0,
      themeValueJpy: 0,
      isHeld: false,
    },
    market: { ...baseInput().market, env: "RISK_ON", priceJpy: 10_000 },
    exit: { exitPriceJpy: 9_200 }, // 撤退幅8%
    scores: { volume: 18, trend: 18, materials: 16, liquidity: 12, rr: 8, env: 8 },
  });
  const sizing = calcMaxBuy(input, DEFAULT_POLICY, runGates(input, DEFAULT_POLICY));

  // 最大損失額 = 200万 × 0.5% = 1万円 / 1株撤退損失 = 800円 → 12株
  // リスク上の購入可能額 = floor(10,000/800)=12株 × 10,000円 = 12万円（連続値12.5万円の整数株丸め）
  assert.equal(sizing.maxShares, 12);
  assert.equal(sizing.maxBuyJpy, 120_000);
  assert.ok(sizing.maxBuyJpy > 10_000, "最大損失額そのものがmin()に入っていないこと");
  assert.ok(sizing.maxBuyJpy <= 125_000, "連続値の購入可能額12.5万円を超えないこと");
  // 実際に撤退した場合の損失が損失予算1万円以内であること
  assert.ok(sizing.maxShares * 800 <= 10_000);
});

// ─── §20: 購入額は資金・損失予算・銘柄上限・テーマ上限の最小値以下 ──

test("maxBuyJpyは4つの上限の最小値×市場環境係数を超えない", () => {
  const input = baseInput();
  const gates = runGates(input, DEFAULT_POLICY);
  const sizing = calcMaxBuy(input, DEFAULT_POLICY, gates);

  const price = input.market.priceJpy;
  const lossBudget = input.portfolio.totalInvestmentAssetsJpy * 0.01; // long 1%
  const perShareLoss = price - input.exit.exitPriceJpy;
  const riskCap = Math.floor(lossBudget / perShareLoss) * price;
  const singleHeadroom = headroomJpy(
    input.portfolio.tickerValueJpy,
    input.portfolio.stockValueJpy,
    DEFAULT_POLICY.singleStock.hardLimitPct
  );
  const upper = Math.min(input.capacity.investableJpy, riskCap, singleHeadroom) * 1.0;
  assert.ok(sizing.maxBuyJpy <= upper);
  assert.ok(sizing.maxBuyJpy > 0);
  assert.equal(sizing.maxShares, Math.floor(sizing.maxBuyJpy / price));
});

test("市場環境RISK_OFFで購入上限が半減する", () => {
  const on = calcMaxBuy(baseInput(), DEFAULT_POLICY, runGates(baseInput(), DEFAULT_POLICY));
  const offInput = baseInput({ market: { ...baseInput().market, env: "RISK_OFF" } });
  const off = calcMaxBuy(offInput, DEFAULT_POLICY, runGates(offInput, DEFAULT_POLICY));
  assert.ok(off.maxBuyJpy <= Math.ceil(on.maxBuyJpy * 0.5) + baseInput().market.priceJpy);
  assert.ok(off.maxBuyJpy < on.maxBuyJpy);
});

// ─── §20: 1株が上限を超える場合は0株 ────────────────────────

test("1株の価格が投資可能額を超える場合は0株", () => {
  const r = evaluate(
    baseInput({
      capacity: { investableJpy: 5_000, calculatedAt: FRESH, confidence: "high", missingData: [] },
      market: { ...baseInput().market, priceJpy: 100_000 },
      exit: { exitPriceJpy: 80_000 },
    }),
    DEFAULT_POLICY
  );
  assert.equal(r.maxShares, 0);
  assert.equal(r.maxBuyJpy, 0);
  assert.notEqual(r.decision, "BUY_CANDIDATE");
});

// ─── §20: 長期株は20%下落だけで自動売却しない ───────────────

test("長期保有・22%下落でもスコア良好なら EXITにせず強制再審査警告", () => {
  const r = evaluate(
    baseInput({
      portfolio: { ...baseInput().portfolio, isHeld: true },
      drawdownFromCostPct: 22,
      scores: { growth: 18, moat: 18, financial: 13, valuation: 8, mgmt: 8, fcf: 5 }, // 70
    }),
    DEFAULT_POLICY
  );
  assert.notEqual(r.decision, "EXIT_CANDIDATE");
  assert.ok(r.warnings.includes("forced_review_drawdown"));
});

test("長期スコア39以下は TRIM/EXIT候補になる", () => {
  const r = evaluate(
    baseInput({
      portfolio: { ...baseInput().portfolio, isHeld: true },
      scores: { growth: 10, moat: 8, financial: 6, valuation: 5, mgmt: 4, fcf: 2 }, // 35
    }),
    DEFAULT_POLICY
  );
  assert.ok(["TRIM_CANDIDATE", "EXIT_CANDIDATE"].includes(r.decision));
  assert.equal(r.maxBuyJpy, 0);
});

// ─── ヘルパーの性質 ─────────────────────────────────────────

test("headroomJpy: 追加後も上限を超えない／超過時は0", () => {
  const h = headroomJpy(100_000, 1_000_000, 40);
  assert.ok((100_000 + h) / (1_000_000 + h) <= 0.4 + 1e-9);
  assert.equal(headroomJpy(500_000, 1_000_000, 40), 0);
  assert.equal(headroomJpy(0, 0, 40), 0);
});

test("totalScoreは0〜100にクランプ", () => {
  assert.equal(totalScore({ a: 200 }), 100);
  assert.equal(totalScore({ a: -50 }), 0);
  assert.equal(totalScore({ a: 20, b: 30 }), 50);
});
