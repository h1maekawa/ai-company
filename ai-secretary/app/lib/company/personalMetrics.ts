/**
 * Personal AI Company のKPI — Phase 4 §10 / §11 / §12
 *
 * §11 の要点: 財務データはすべて optional。値が無いことをエラーにしない。
 * そして最も大事なのは「0円」と「未設定」を混同しないこと。
 * 未設定を0として扱うと、貯蓄率0%・FIRE進捗0%として表示され、
 * 実態と無関係な数字がダッシュボードに並ぶ。
 */

export type MetricAvailability = "AVAILABLE" | "NOT_CONNECTED" | "NO_DATA" | "NOT_CONFIGURED";

/** 値と、その値が無い場合の理由を一緒に持つ */
export type Metric<T = number> = {
  availability: MetricAvailability;
  value: T | null;
  /** 表示用の補足（「銀行未接続」など） */
  note?: string;
};

export function available<T>(value: T): Metric<T> {
  return { availability: "AVAILABLE", value };
}

export function unavailable<T>(
  availability: Exclude<MetricAvailability, "AVAILABLE">,
  note?: string
): Metric<T> {
  return { availability, value: null, note };
}

export function isAvailable<T>(metric: Metric<T>): metric is Metric<T> & { value: T } {
  return metric.availability === "AVAILABLE" && metric.value !== null;
}

export type PersonalCompanyMetrics = {
  financial: {
    monthlyIncomeYen: Metric;
    monthlyExpenseYen: Metric;
    cashBalanceYen: Metric;
    investmentAssetsYen: Metric;
    netWorthYen: Metric;
    /** 貯蓄率（0〜1） */
    savingsRate: Metric;
    sideIncomeYen: Metric;
    passiveIncomeYen: Metric;
    /** 最重要指標。AI Companyが直接関与した収益 */
    aiGeneratedRevenueYen: Metric;
  };
  freedom: {
    /** 生活費を副収入＋不労所得でどれだけ賄えているか（0〜1） */
    livingCostCoverageRate: Metric;
    /** 生活費を不労所得だけで賄えているか（0〜1） */
    passiveIncomeCoverageRate: Metric;
    /** FIRE進捗（0〜1） */
    fireProgress: Metric;
  };
  productivity: {
    ceoInterventionRate: Metric;
    automationRate: Metric;
    estimatedTimeSavedHours: Metric;
  };
  organization: {
    taskSuccessRate: Metric;
    failureRate: Metric;
    averageLatencyMs: Metric;
    aiCostUsd: Metric;
  };
};

/* ─── FIRE Progress（§12） ──────────────────────── */

export type FireInput = {
  /** 年間生活費（円）。未設定は null */
  annualLivingCostYen: number | null;
  /** 目標資産額（円）。未設定なら年間生活費から4%ルールで算出する */
  targetAssetYen: number | null;
  currentNetWorthYen: number | null;
  annualPassiveIncomeYen: number | null;
};

export type FireResult = {
  status: "NOT_CONFIGURED" | "IN_PROGRESS" | "ACHIEVED";
  progress: Metric;
  targetAssetYen: Metric;
  /** 不労所得だけで生活費を賄えている割合（0〜1） */
  passiveCoverageRate: Metric;
  /** 何が足りなくて計算できないか */
  missing: string[];
};

/** 4%ルール。目標額が未設定のときの算出根拠を明示しておく */
const SAFE_WITHDRAWAL_RATE = 0.04;

/**
 * FIRE進捗を計算する。
 *
 * 生活費も目標額も無いときは NOT_CONFIGURED を返す。
 * 0%として扱わない（§12「勝手に生活費や目標額を推測しないこと」）。
 * 0%と表示すると「進んでいない」に読めるが、実際は「測っていない」であり別物。
 */
export function computeFireProgress(input: FireInput): FireResult {
  const missing: string[] = [];
  if (input.annualLivingCostYen === null && input.targetAssetYen === null) {
    missing.push("年間生活費または目標資産額");
  }
  if (input.currentNetWorthYen === null) missing.push("現在の純資産");

  const target =
    input.targetAssetYen ??
    (input.annualLivingCostYen !== null
      ? Math.round(input.annualLivingCostYen / SAFE_WITHDRAWAL_RATE)
      : null);

  if (target === null || input.currentNetWorthYen === null) {
    return {
      status: "NOT_CONFIGURED",
      progress: unavailable("NOT_CONFIGURED", `未設定: ${missing.join(" / ")}`),
      targetAssetYen:
        target === null
          ? unavailable("NOT_CONFIGURED", "年間生活費・目標資産額のどちらも未設定")
          : available(target),
      passiveCoverageRate:
        input.annualPassiveIncomeYen !== null && input.annualLivingCostYen !== null
          ? available(
              Math.round((input.annualPassiveIncomeYen / Math.max(1, input.annualLivingCostYen)) * 100) / 100
            )
          : unavailable("NOT_CONFIGURED", "不労所得または生活費が未設定"),
      missing,
    };
  }

  const progress = Math.round((input.currentNetWorthYen / Math.max(1, target)) * 1000) / 1000;
  const passiveCoverage =
    input.annualPassiveIncomeYen !== null && input.annualLivingCostYen !== null
      ? Math.round(
          (input.annualPassiveIncomeYen / Math.max(1, input.annualLivingCostYen)) * 100
        ) / 100
      : null;

  return {
    status: progress >= 1 ? "ACHIEVED" : "IN_PROGRESS",
    progress: available(Math.min(1, progress)),
    targetAssetYen: available(target),
    passiveCoverageRate:
      passiveCoverage === null
        ? unavailable("NOT_CONFIGURED", "不労所得または生活費が未設定")
        : available(passiveCoverage),
    missing,
  };
}

/** 貯蓄率。収入・支出のどちらかが無ければ計算しない */
export function computeSavingsRate(
  monthlyIncomeYen: number | null,
  monthlyExpenseYen: number | null
): Metric {
  if (monthlyIncomeYen === null || monthlyExpenseYen === null) {
    return unavailable("NO_DATA", "収入または支出が未取得");
  }
  if (monthlyIncomeYen <= 0) {
    return unavailable("NO_DATA", "収入が0のため貯蓄率を計算できません");
  }
  return available(
    Math.round(((monthlyIncomeYen - monthlyExpenseYen) / monthlyIncomeYen) * 1000) / 1000
  );
}

/** 空のKPI。すべて未接続として始める（0で埋めない） */
export function emptyPersonalMetrics(): PersonalCompanyMetrics {
  const notConnected = () => unavailable<number>("NOT_CONNECTED", "データ未接続");
  return {
    financial: {
      monthlyIncomeYen: notConnected(),
      monthlyExpenseYen: notConnected(),
      cashBalanceYen: notConnected(),
      investmentAssetsYen: notConnected(),
      netWorthYen: notConnected(),
      savingsRate: notConnected(),
      sideIncomeYen: notConnected(),
      passiveIncomeYen: notConnected(),
      aiGeneratedRevenueYen: notConnected(),
    },
    freedom: {
      livingCostCoverageRate: notConnected(),
      passiveIncomeCoverageRate: notConnected(),
      fireProgress: unavailable("NOT_CONFIGURED", "FIRE目標が未設定"),
    },
    productivity: {
      ceoInterventionRate: notConnected(),
      automationRate: notConnected(),
      estimatedTimeSavedHours: notConnected(),
    },
    organization: {
      taskSuccessRate: notConnected(),
      failureRate: notConnected(),
      averageLatencyMs: notConnected(),
      aiCostUsd: notConnected(),
    },
  };
}
