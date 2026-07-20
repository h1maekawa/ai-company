/**
 * Fund Department 投資判断エンジン（決定論的）
 *
 * docs/12_FUND_POLICY_ENGINE.md §3〜§12 の実装。
 * - 判定優先順位: 資金安全性 → データ完全性 → 配分・集中リスク → 投資仮説 → 価格・出来高・RVOL → 期待収益
 * - 購入額・株数はAIプロンプトではなく本モジュールの純関数で計算する
 * - LLMは reasons / counterarguments / スコア素点の提案にのみ関与し、
 *   ゲート判定・上限計算には一切関与しない
 */

import {
  FundPolicy,
  Horizon,
  MarketEnv,
  themeOfTicker,
} from "./policy";

// ─── 型定義（§18） ─────────────────────────────────────────

export type FundDecision =
  | "BUY_CANDIDATE"
  | "WAIT"
  | "HOLD"
  | "ADD_CANDIDATE"
  | "TRIM_CANDIDATE"
  | "EXIT_CANDIDATE"
  | "WAIT_DATA";

export type Confidence = "low" | "medium" | "high";

export interface FundRecommendation {
  ticker: string;
  horizon: Horizon;
  decision: FundDecision;
  score: number;
  confidence: Confidence;
  maxBuyJpy: number;
  maxShares: number;
  entryZone: string | null;
  invalidation: string | null;
  reasons: string[];
  counterarguments: string[];
  blockedBy: string[];
  warnings: string[];
  missingData: string[];
  dataAsOf: string;
  nextReviewAt: string;
  /** 段階購入の各回上限額（1回目=40%等、§9.2） */
  stagedBuyJpy: number[];
  /**
   * true = 仮想提案のみ（paper mode）。実資金での執行は不可。
   * blockedBy に理由（例: spread_unknown）が入る
   */
  executionBlocked: boolean;
  /** paper modeの仮想売買で想定する保守的な往復コスト%（実資金時はnull） */
  assumedRoundTripCostPct: number | null;
  evaluatedAt: string;
  policyVersion: number;
}

/** §8.1〜8.3 スコア素点。合計は100点満点。素点はAI/人間が提示し、合算・判定はエンジンが行う */
export interface ScoreComponents {
  /** 短期: RVOL・出来高 / 中期: 売上・利益・CF / 長期: 市場成長性 に相当する第1項 */
  [key: string]: number;
}

export interface EvaluationInput {
  ticker: string;
  horizon: Horizon;

  /** 資金（capacity.md / Flow+由来） */
  capacity: {
    investableJpy: number | null;
    calculatedAt: string | null; // ISO
    confidence: Confidence | null;
    missingData: string[];
  };

  /** ポートフォリオ（holdings.md由来、円） */
  portfolio: {
    totalInvestmentAssetsJpy: number;
    stockValueJpy: number;
    fundValueJpy: number;
    /** 対象銘柄の現在評価額 */
    tickerValueJpy: number;
    /** 対象銘柄と同テーマの合計評価額（対象銘柄含む） */
    themeValueJpy: number;
    /** 既に保有しているか */
    isHeld: boolean;
  };

  /** 市場データ（Phase 1.2プロバイダー由来。無ければnull） */
  market: {
    env: MarketEnv;
    priceJpy: number | null;
    priceAsOf: string | null; // ISO date
    rvol20: number | null;
    adtv20Usd: number | null;
    spreadPct: number | null;
    atr14: number | null;
    /** 当日騰落率% */
    changePct: number | null;
    /** 決算まで営業日数（不明はnull） */
    daysToEarnings: number | null;
  };

  /** スコア素点（AI/人間提示）。キー順は不問、合計を総合スコアとする */
  scores: ScoreComponents;
  /** RVOL・出来高系の素点キー名（RVOL単独購入の禁止判定に使用） */
  volumeScoreKeys: string[];

  /** 投資仮説 */
  thesis: {
    summary: string | null;
    invalidation: string | null;
    /** ナンピン文脈: 値下がり以外の新規根拠があるか */
    hasNewCatalyst: boolean;
    hypothesisMaintained: boolean;
  };

  /** 撤退基準（短期は必須、§12.1） */
  exit: {
    exitPriceJpy: number | null;
  };

  /** 取得価格からの下落率%（保有時のみ。プラス=下落） */
  drawdownFromCostPct: number | null;

  reasons: string[];
  counterarguments: string[];

  /** 評価実行時刻（テスト時に固定可能） */
  now?: Date;
}

// ─── 内部ユーティリティ ─────────────────────────────────────

const hoursBetween = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) / 36e5;

const daysBetween = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) / 864e5;

const floorYen = (n: number) => Math.max(0, Math.floor(n));

/**
 * 現在値からさらに x 円購入したとき比率が limitPct を超えない最大 x。
 * (part + x) / (whole + x) <= limit/100 を x について解く。
 * 既に超過している場合は 0。
 */
export function headroomJpy(
  partJpy: number,
  wholeJpy: number,
  limitPct: number
): number {
  const limit = limitPct / 100;
  if (limit >= 1) return Number.MAX_SAFE_INTEGER;
  if (wholeJpy <= 0) return 0;
  if (partJpy / wholeJpy >= limit) return 0;
  return floorYen((limit * wholeJpy - partJpy) / (1 - limit));
}

/** スコア素点合計（0〜100へクランプ） */
export function totalScore(scores: ScoreComponents): number {
  const sum = Object.values(scores).reduce(
    (s, v) => s + (Number.isFinite(v) ? v : 0),
    0
  );
  return Math.min(100, Math.max(0, Math.round(sum)));
}

// ─── ゲート判定（§3の優先順位で評価） ───────────────────────

export interface GateResult {
  blockedBy: string[];
  warnings: string[];
  missingData: string[];
  /** WAIT_DATAで即返すべきか */
  waitData: boolean;
  /** 新規/追加購入の禁止（保有評価は継続可） */
  buyBlocked: boolean;
  /**
   * 実資金の執行のみ禁止（paper modeの仮想候補生成は許可）。
   * 例: 短期×スプレッド不明。実資金移行前にbid/ask取得可能なデータ元へ切替が必要
   */
  executionBlockedBy: string[];
}

export function runGates(
  input: EvaluationInput,
  policy: FundPolicy
): GateResult {
  const now = input.now ?? new Date();
  const blockedBy: string[] = [];
  const warnings: string[] = [];
  const missingData: string[] = [...input.capacity.missingData];
  const executionBlockedBy: string[] = [];
  let waitData = false;

  // 1. 資金安全性（§4.2）
  if (input.capacity.investableJpy === null) {
    missingData.push("investable_amount");
    blockedBy.push("no_investable_amount");
  } else if (input.capacity.investableJpy <= 0) {
    blockedBy.push("investable_amount_zero_or_negative");
  }

  // 2. データ完全性（§4.2, §6.3）
  if (input.capacity.calculatedAt === null) {
    missingData.push("capacity_calculated_at");
    waitData = true;
    blockedBy.push("capacity_freshness_unknown");
  } else {
    const age = hoursBetween(now, new Date(input.capacity.calculatedAt));
    if (age > policy.freshness.capacityMaxAgeHours) {
      waitData = true;
      blockedBy.push("capacity_stale_over_24h");
    }
  }
  if (input.capacity.confidence === "low") {
    waitData = true;
    blockedBy.push("capacity_confidence_low");
  }
  if (input.capacity.missingData.length > 0) {
    waitData = true;
    blockedBy.push("capacity_missing_data");
  }

  if (input.market.priceJpy === null || input.market.priceAsOf === null) {
    missingData.push("price");
    waitData = true;
    blockedBy.push("price_unavailable");
  } else {
    const ageDays = daysBetween(now, new Date(input.market.priceAsOf));
    if (ageDays > policy.freshness.priceMaxAgeDays) {
      waitData = true;
      blockedBy.push("price_stale");
    }
  }

  // 3. 配分・集中リスク（§5）
  const { stockValueJpy, tickerValueJpy, themeValueJpy } = input.portfolio;
  if (stockValueJpy > 0) {
    const singlePct = (tickerValueJpy / stockValueJpy) * 100;
    if (singlePct >= policy.singleStock.highConcentrationPct) {
      blockedBy.push("single_stock_limit");
      warnings.push(
        `single_stock_high_concentration: ${singlePct.toFixed(1)}%`
      );
    } else if (singlePct >= policy.singleStock.hardLimitPct) {
      blockedBy.push("single_stock_limit");
    } else if (singlePct >= policy.singleStock.warningPct) {
      warnings.push(`single_stock_warning: ${singlePct.toFixed(1)}%`);
    }

    const themePct = (themeValueJpy / stockValueJpy) * 100;
    if (themePct > policy.theme.hardLimitPct) {
      blockedBy.push("theme_limit");
    } else if (themePct >= policy.theme.warningPct) {
      warnings.push(`theme_warning: ${themePct.toFixed(1)}%`);
    }
  }

  // 配分帯の警告（§5.1 — 購入停止ではなく優先候補の変更）
  const total = input.portfolio.stockValueJpy + input.portfolio.fundValueJpy;
  if (total > 0) {
    const stockPct = (input.portfolio.stockValueJpy / total) * 100;
    const a = policy.allocation;
    if (stockPct < a.strongWarnLowPct || stockPct > a.strongWarnHighPct) {
      warnings.push(`allocation_strong_warning: stock ${stockPct.toFixed(1)}%`);
    } else if (stockPct > a.targetStockPct + a.tolerancePct) {
      warnings.push("allocation_prefer_fund");
    } else if (stockPct < a.targetStockPct - a.tolerancePct) {
      warnings.push("allocation_prefer_stock");
    }
  }

  // 5. 価格・出来高・RVOL系ゲート（§6, §8.1）
  const liq = policy.liquidity[input.horizon];
  if (input.market.adtv20Usd !== null && input.market.adtv20Usd < liq.minAdtvUsd) {
    blockedBy.push("adtv_below_minimum");
  }
  if (input.market.adtv20Usd === null) {
    missingData.push("adtv20");
    if (input.horizon === "short") blockedBy.push("adtv_unknown_short");
    else warnings.push("adtv_unknown");
  }
  if (input.market.spreadPct === null) {
    missingData.push("spread");
    // §6.2: スプレッド不明の場合、短期は実資金購入不可、中長期は警告付き。
    // 短期×paper mode中は仮想候補の生成だけを許可する（executionBlocked扱い）。
    // 実資金移行前にbid/ask取得可能なデータ元へ切り替えること。
    if (input.horizon === "short") {
      if (policy.paperMode.enabled) {
        executionBlockedBy.push("spread_unknown");
        warnings.push("paper_virtual_only_spread_unknown");
      } else {
        blockedBy.push("spread_unknown_short");
      }
    } else {
      warnings.push("spread_unknown");
    }
  } else if (input.market.spreadPct > liq.maxSpreadPct) {
    blockedBy.push("spread_too_wide");
  }

  // §8.1 過熱（追いかけ買い禁止）
  if (
    input.market.rvol20 !== null &&
    input.market.changePct !== null &&
    input.market.rvol20 >= policy.rvol.overheatedRvol &&
    input.market.changePct >= policy.rvol.overheatedChangePct
  ) {
    blockedBy.push("overheated");
  }

  // §8.1 決算ブラックアウト
  if (
    input.horizon === "short" &&
    input.market.daysToEarnings !== null &&
    input.market.daysToEarnings >= 0 &&
    input.market.daysToEarnings <= policy.earningsBlackoutDays
  ) {
    blockedBy.push("earnings_blackout");
  }

  // §12.1 短期は撤退基準必須
  if (input.horizon === "short" && input.exit.exitPriceJpy === null) {
    blockedBy.push("no_exit_price_short");
  }

  // §3 RVOL単独購入の禁止:
  // 出来高系以外の素点が1点も付いていない場合、購入候補にしない
  const nonVolumeScore = Object.entries(input.scores)
    .filter(([k]) => !input.volumeScoreKeys.includes(k))
    .reduce((s, [, v]) => s + (Number.isFinite(v) ? v : 0), 0);
  if (nonVolumeScore <= 0 && totalScore(input.scores) > 0) {
    blockedBy.push("rvol_only_signal");
  }

  return {
    blockedBy: [...new Set(blockedBy)],
    warnings: [...new Set(warnings)],
    missingData: [...new Set(missingData)],
    waitData,
    buyBlocked: blockedBy.length > 0,
    executionBlockedBy: [...new Set(executionBlockedBy)],
  };
}

// ─── 購入数量計算（§9・決定論的） ───────────────────────────

export interface SizingResult {
  maxBuyJpy: number;
  maxShares: number;
  stagedBuyJpy: number[];
  sizingNotes: string[];
}

export function calcMaxBuy(
  input: EvaluationInput,
  policy: FundPolicy,
  gates: GateResult
): SizingResult {
  const notes: string[] = [];
  const zero: SizingResult = {
    maxBuyJpy: 0,
    maxShares: 0,
    stagedBuyJpy: policy.stagedBuyPct.map(() => 0),
    sizingNotes: notes,
  };

  // ゲートを通過しない場合は購入0（§3: 上位条件優先）
  if (gates.buyBlocked || gates.waitData) return zero;

  const price = input.market.priceJpy;
  const investable = input.capacity.investableJpy;
  if (price === null || price <= 0 || investable === null || investable <= 0) {
    return zero;
  }

  // §9.1 損失予算
  const budgetPct = policy.riskBudgetPct[input.horizon];
  const lossBudgetJpy =
    (input.portfolio.totalInvestmentAssetsJpy * budgetPct) / 100;

  // 1株あたり撤退時損失額
  let perShareLossJpy: number;
  if (input.exit.exitPriceJpy !== null && input.exit.exitPriceJpy < price) {
    perShareLossJpy = price - input.exit.exitPriceJpy;
  } else if (input.horizon === "medium") {
    perShareLossJpy = price * (policy.stopLoss.medium.forcedReviewDropPct / 100);
    notes.push("exit_price_proxy_medium_15pct");
  } else if (input.horizon === "long") {
    perShareLossJpy = price * (policy.stopLoss.long.forcedReviewDropPct / 100);
    notes.push("exit_price_proxy_long_20pct");
  } else {
    // 短期で撤退価格なしはゲートで弾かれている
    return zero;
  }

  // §9.1 リスク上の購入可能額 = 最大損失額 ÷ 撤退率（整数株へ切り捨て）。
  // min() へは最大損失額そのものではなく、この購入可能額を入れる。
  // 例: 総資産200万×短期0.5%=最大損失1万円、撤退幅8% → 購入可能額 1万÷8% = 12.5万円
  const sharesByRisk = Math.floor(lossBudgetJpy / perShareLossJpy);
  const riskCapJpy = sharesByRisk * price;

  // §5.2 / §5.3 上限までの余地
  const singleHeadroom = headroomJpy(
    input.portfolio.tickerValueJpy,
    input.portfolio.stockValueJpy,
    policy.singleStock.hardLimitPct
  );
  const themeHeadroom =
    themeOfTicker(policy, input.ticker) !== null
      ? headroomJpy(
          input.portfolio.themeValueJpy,
          input.portfolio.stockValueJpy,
          policy.theme.hardLimitPct
        )
      : Number.MAX_SAFE_INTEGER;

  // §9.1 最終購入上限 = min(...) × 市場環境係数
  const envCoef = policy.marketEnvCoefficient[input.market.env];
  const rawCap = Math.min(investable, riskCapJpy, singleHeadroom, themeHeadroom);
  const cappedJpy = floorYen(rawCap * envCoef);

  const maxShares = Math.floor(cappedJpy / price);
  if (maxShares <= 0) {
    // §9.1 1株でも予算・上限を超えるなら0株
    notes.push("one_share_exceeds_budget_or_limits");
    return { ...zero, sizingNotes: notes };
  }

  const maxBuyJpy = floorYen(maxShares * price);
  const stagedBuyJpy = policy.stagedBuyPct.map((pct) =>
    floorYen((maxBuyJpy * pct) / 100)
  );

  return { maxBuyJpy, maxShares, stagedBuyJpy, sizingNotes: notes };
}

// ─── 総合評価（§14出力） ────────────────────────────────────

export function evaluate(
  input: EvaluationInput,
  policy: FundPolicy
): FundRecommendation {
  const now = input.now ?? new Date();
  const gates = runGates(input, policy);
  const score = totalScore(input.scores);
  const sizing = calcMaxBuy(input, policy, gates);

  const executionBlocked = gates.executionBlockedBy.length > 0;
  const isPaperShort = input.horizon === "short" && policy.paperMode.enabled;

  const base = {
    ticker: input.ticker.toUpperCase(),
    horizon: input.horizon,
    score,
    confidence: (input.capacity.confidence ?? "low") as Confidence,
    maxBuyJpy: sizing.maxBuyJpy,
    maxShares: sizing.maxShares,
    stagedBuyJpy: sizing.stagedBuyJpy,
    entryZone: null as string | null,
    invalidation: input.thesis.invalidation,
    reasons: input.reasons,
    counterarguments: input.counterarguments,
    blockedBy: [...gates.blockedBy, ...gates.executionBlockedBy],
    warnings: [...gates.warnings, ...sizing.sizingNotes],
    missingData: gates.missingData,
    dataAsOf: input.market.priceAsOf ?? "unknown",
    nextReviewAt: "次回決算後または1か月後",
    executionBlocked,
    assumedRoundTripCostPct: isPaperShort
      ? policy.paperMode.assumedRoundTripCostPct
      : null,
    evaluatedAt: now.toISOString(),
    policyVersion: policy.policyVersion,
  };

  // データ不足は最優先で WAIT_DATA（§6.3）
  if (gates.waitData) {
    return { ...base, decision: "WAIT_DATA", maxBuyJpy: 0, maxShares: 0 };
  }

  const s = policy.scoring;
  const held = input.portfolio.isHeld;

  // 保有していない場合
  if (!held) {
    if (score >= s.buyMin && !gates.buyBlocked && sizing.maxShares > 0) {
      return { ...base, decision: "BUY_CANDIDATE" };
    }
    return { ...base, decision: "WAIT", maxBuyJpy: 0, maxShares: 0 };
  }

  // 保有中の場合
  // §12: スコアによる撤退・縮小候補（下落率だけでは自動売却しない）
  if (score < s.reviewMin) {
    return {
      ...base,
      decision: input.horizon === "long" ? "TRIM_CANDIDATE" : "EXIT_CANDIDATE",
      maxBuyJpy: 0,
      maxShares: 0,
    };
  }
  if (score < s.watchMin) {
    return { ...base, decision: "TRIM_CANDIDATE", maxBuyJpy: 0, maxShares: 0 };
  }

  // §12.2/§12.3 強制再審査（自動売却ではなく警告として返す）
  const dd = input.drawdownFromCostPct;
  if (dd !== null) {
    const limit =
      input.horizon === "medium"
        ? policy.stopLoss.medium.forcedReviewDropPct
        : input.horizon === "long"
          ? policy.stopLoss.long.forcedReviewDropPct
          : null;
    if (limit !== null && dd > limit) {
      base.warnings = [...base.warnings, "forced_review_drawdown"];
    }
  }

  // §10 ナンピン/追加購入
  if (
    score >= s.buyMin &&
    !gates.buyBlocked &&
    sizing.maxShares > 0 &&
    input.thesis.hypothesisMaintained &&
    input.thesis.hasNewCatalyst
  ) {
    return { ...base, decision: "ADD_CANDIDATE" };
  }

  return { ...base, decision: "HOLD", maxBuyJpy: 0, maxShares: 0 };
}
