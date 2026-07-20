/**
 * Fund Department ポリシー設定（バージョン付き）
 *
 * docs/12_FUND_POLICY_ENGINE.md §18 に基づく。
 * ポリシー数値はエンジンコードへ直書きせず、全てこの設定オブジェクトで管理する。
 * 保存先: memory/personal/fund/policy.md（末尾jsonブロック）。
 * 未保存時は DEFAULT_POLICY（policyVersion: 1 の初期値）を使う。
 */

export type Horizon = "short" | "medium" | "long";

export type MarketEnv = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "UNKNOWN";

export interface FundPolicy {
  policyVersion: number;
  updatedAt: string;

  /** §5.1 投資信託・個別株配分 */
  allocation: {
    targetFundPct: number;
    targetStockPct: number;
    /** 許容帯（目標±この値） */
    tolerancePct: number;
    /** 強い配分警告の下限・上限（個別株比率） */
    strongWarnLowPct: number;
    strongWarnHighPct: number;
  };

  /** §5.2 1銘柄上限（分母=個別株評価額） */
  singleStock: {
    warningPct: number;
    hardLimitPct: number;
    highConcentrationPct: number;
  };

  /** §5.3 テーマ上限（分母=個別株評価額） */
  theme: {
    warningPct: number;
    hardLimitPct: number;
  };

  /** テーマ→ティッカーのマッピング（集計は決定論的に行う） */
  themes: Record<string, string[]>;

  /** §6.3 / §4.2 データ鮮度 */
  freshness: {
    capacityMaxAgeHours: number;
    /** 株価・出来高の許容経過日数（暦日。週末を跨ぐため営業日1日≒暦日4日を上限） */
    priceMaxAgeDays: number;
  };

  /** §8 期間別スコア閾値 */
  scoring: {
    buyMin: number;
    watchMin: number;
    reviewMin: number;
  };

  /** §9.1 1判断の損失予算（総投資資産に対する%） */
  riskBudgetPct: Record<Horizon, number>;

  /** §9.2 段階購入比率（%） */
  stagedBuyPct: number[];

  /** §7 市場環境ごとの新規購入額係数 */
  marketEnvCoefficient: Record<Exclude<MarketEnv, "UNKNOWN">, number> & {
    UNKNOWN: number;
  };

  /** §6.2 流動性最低条件 */
  liquidity: Record<
    Horizon,
    { minAdtvUsd: number; maxSpreadPct: number }
  >;

  /** §6.1 / §8.1 RVOL帯と過熱判定 */
  rvol: {
    lowMax: number;
    normalMax: number;
    elevatedMax: number;
    highMax: number;
    overheatedRvol: number;
    overheatedChangePct: number;
  };

  /** §12 損切り・撤退 */
  stopLoss: {
    short: { atrMult: number; minPct: number; maxPct: number };
    medium: { forcedReviewDropPct: number };
    long: { forcedReviewDropPct: number };
  };

  /** §8.1 決算ブラックアウト（決算N営業日前〜当日は新規購入しない） */
  earningsBlackoutDays: number;

  /** §16 短期paper mode */
  paperMode: {
    enabled: boolean;
    minimumDays: number;
    minimumClosedSignals: number;
    assumedRoundTripCostPct: number;
  };
}

export const DEFAULT_POLICY: FundPolicy = {
  policyVersion: 1,
  updatedAt: "2026-07-19",
  allocation: {
    targetFundPct: 50,
    targetStockPct: 50,
    tolerancePct: 5,
    strongWarnLowPct: 40,
    strongWarnHighPct: 60,
  },
  singleStock: {
    warningPct: 30,
    hardLimitPct: 40,
    highConcentrationPct: 50,
  },
  theme: {
    warningPct: 60,
    hardLimitPct: 70,
  },
  themes: {
    semiconductor: ["NVDA", "MU", "AMD", "AVGO", "TSM", "ASML", "LRCX", "AMAT", "INTC", "QCOM", "ARM", "SMCI"],
    ai_software: ["MSFT", "GOOGL", "META", "PLTR", "CRM", "NOW"],
    cybersecurity: ["CRWD", "PANW", "ZS", "S", "FTNT"],
  },
  freshness: {
    capacityMaxAgeHours: 24,
    priceMaxAgeDays: 4,
  },
  scoring: {
    buyMin: 75,
    watchMin: 60,
    reviewMin: 40,
  },
  riskBudgetPct: {
    short: 0.5,
    medium: 0.75,
    long: 1.0,
  },
  stagedBuyPct: [40, 30, 30],
  marketEnvCoefficient: {
    RISK_ON: 1.0,
    NEUTRAL: 0.75,
    RISK_OFF: 0.5,
    UNKNOWN: 0.5,
  },
  liquidity: {
    short: { minAdtvUsd: 20_000_000, maxSpreadPct: 0.3 },
    medium: { minAdtvUsd: 10_000_000, maxSpreadPct: 0.5 },
    long: { minAdtvUsd: 5_000_000, maxSpreadPct: 0.75 },
  },
  rvol: {
    lowMax: 0.8,
    normalMax: 1.2,
    elevatedMax: 1.5,
    highMax: 2.0,
    overheatedRvol: 3.0,
    overheatedChangePct: 10,
  },
  stopLoss: {
    short: { atrMult: 1.5, minPct: 5, maxPct: 10 },
    medium: { forcedReviewDropPct: 15 },
    long: { forcedReviewDropPct: 20 },
  },
  earningsBlackoutDays: 2,
  paperMode: {
    enabled: true,
    minimumDays: 30,
    minimumClosedSignals: 20,
    assumedRoundTripCostPct: 0.4,
  },
};

/** policy.md 等のjsonブロックからポリシーを取り出す。壊れていればnull */
export function parsePolicyMarkdown(markdown: string): FundPolicy | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return validatePolicy(parsed) ? (parsed as FundPolicy) : null;
  } catch {
    return null;
  }
}

/** 最低限のスキーマ検証。数値閾値が欠けたポリシーは受け入れない */
export function validatePolicy(p: unknown): p is FundPolicy {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, any>;
  return (
    typeof o.policyVersion === "number" &&
    o.policyVersion >= 1 &&
    typeof o.allocation?.targetStockPct === "number" &&
    typeof o.singleStock?.hardLimitPct === "number" &&
    typeof o.singleStock?.warningPct === "number" &&
    typeof o.theme?.hardLimitPct === "number" &&
    typeof o.freshness?.capacityMaxAgeHours === "number" &&
    typeof o.scoring?.buyMin === "number" &&
    typeof o.riskBudgetPct?.short === "number" &&
    typeof o.riskBudgetPct?.medium === "number" &&
    typeof o.riskBudgetPct?.long === "number" &&
    typeof o.liquidity?.short?.minAdtvUsd === "number" &&
    typeof o.rvol?.overheatedRvol === "number" &&
    typeof o.marketEnvCoefficient?.RISK_ON === "number" &&
    typeof o.paperMode?.assumedRoundTripCostPct === "number" &&
    o.themes !== null &&
    typeof o.themes === "object"
  );
}

/** ポリシーをpolicy.md用のMarkdownへシリアライズ */
export function buildPolicyMarkdown(policy: FundPolicy): string {
  return `---
id: fund-policy
type: fund_policy
version: ${policy.policyVersion}
updated: ${policy.updatedAt}
---

# Fund Department ポリシー設定（policyVersion: ${policy.policyVersion}）

このファイルは /api/fund/policy が読み書きする。仕様は docs/12_FUND_POLICY_ENGINE.md。
数値の意味を変更する場合は必ず policyVersion を上げること。

\`\`\`json
${JSON.stringify(policy, null, 2)}
\`\`\`
`;
}

/** ティッカーが属するテーマ名を返す（無所属はnull） */
export function themeOfTicker(policy: FundPolicy, ticker: string): string | null {
  const upper = ticker.toUpperCase();
  for (const [theme, tickers] of Object.entries(policy.themes)) {
    if (tickers.includes(upper)) return theme;
  }
  return null;
}
