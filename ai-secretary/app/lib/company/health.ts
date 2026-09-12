/**
 * Company Health / Department Health — Phase 4 §16〜§19
 *
 * §17 の要点: データが無い項目を0点として会社全体を低評価にしない。
 * 測れた項目だけでスコアを出し、どれだけ測れたかを coverage として別に示す。
 * 未計測を0点にすると、「銀行を繋いでいない」ことが「経営が悪い」に化ける。
 *
 * §18 の要点: セキュリティに重大問題があれば、他が高くても AT_RISK にする。
 * スコアの平均に混ぜると、他の項目が高いときに重大問題が薄まってしまう。
 */

import { isAvailable, type Metric, type PersonalCompanyMetrics } from "./personalMetrics";

export type HealthDimension =
  | "income"
  | "assets"
  | "savings"
  | "automation"
  | "quality"
  | "time"
  | "security"
  | "organization";

export const HEALTH_WEIGHTS: Record<HealthDimension, number> = {
  income: 20,
  assets: 15,
  savings: 10,
  automation: 10,
  quality: 10,
  time: 10,
  security: 15,
  organization: 10,
};

export const HEALTH_DIMENSION_LABELS: Record<HealthDimension, string> = {
  income: "収入",
  assets: "資産",
  savings: "貯蓄",
  automation: "自動化",
  quality: "品質",
  time: "時間",
  security: "セキュリティ",
  organization: "組織",
};

export type HealthStatus = "HEALTHY" | "WATCH" | "AT_RISK";

export type DimensionScore = {
  dimension: HealthDimension;
  /** 0〜weight。測れなかった場合は null */
  score: number | null;
  weight: number;
  /** 測れなかった理由 */
  note?: string;
};

export type CompanyHealth = {
  /** 測れた項目だけで算出した0〜100 */
  score: number;
  /** 全体の何割を測れたか（0〜100） */
  coveragePct: number;
  status: HealthStatus;
  dimensions: DimensionScore[];
  /** AT_RISK の理由。無ければ空 */
  risks: string[];
  computedAt: string;
};

/** 重大なセキュリティ問題。1件でもあれば AT_RISK（§18） */
export type SecurityIssue = {
  id: string;
  severity: "critical" | "warning";
  description: string;
};

/** Metric → 0〜1 のスコアへ。測れなければ null */
function normalize(
  metric: Metric,
  scale: (value: number) => number
): { value: number | null; note?: string } {
  if (!isAvailable(metric)) {
    return { value: null, note: metric.note ?? "未測定" };
  }
  return { value: Math.max(0, Math.min(1, scale(metric.value))) };
}

export type HealthInput = {
  metrics: PersonalCompanyMetrics;
  securityIssues?: SecurityIssue[];
  /** 収入・資産の満点基準。個人ごとに違うため外から渡す */
  targets?: {
    monthlyIncomeYen?: number;
    netWorthYen?: number;
  };
  now?: Date;
};

export function computeCompanyHealth(input: HealthInput): CompanyHealth {
  const now = input.now ?? new Date();
  const { financial, productivity, organization } = input.metrics;
  const targets = input.targets ?? {};

  const raw: Record<HealthDimension, { value: number | null; note?: string }> = {
    // 収入は「AIが生んだ収益」を主役にする。North Star に直結する指標だから
    income: normalize(financial.aiGeneratedRevenueYen, (v) =>
      targets.monthlyIncomeYen ? v / targets.monthlyIncomeYen : v > 0 ? 1 : 0
    ),
    assets: normalize(financial.netWorthYen, (v) =>
      targets.netWorthYen ? v / targets.netWorthYen : v > 0 ? 1 : 0
    ),
    savings: normalize(financial.savingsRate, (v) => v),
    automation: normalize(productivity.automationRate, (v) => v / 100),
    quality: normalize(organization.taskSuccessRate, (v) => v / 100),
    time: normalize(productivity.estimatedTimeSavedHours, (v) => Math.min(1, v / 40)),
    // セキュリティは問題の有無で決まる。指標からは作らない
    security: {
      value: (input.securityIssues ?? []).some((i) => i.severity === "critical")
        ? 0
        : (input.securityIssues ?? []).length > 0
          ? 0.5
          : 1,
    },
    organization: normalize(organization.failureRate, (v) => 1 - v / 100),
  };

  const dimensions: DimensionScore[] = (
    Object.keys(HEALTH_WEIGHTS) as HealthDimension[]
  ).map((dimension) => ({
    dimension,
    weight: HEALTH_WEIGHTS[dimension],
    score:
      raw[dimension].value === null
        ? null
        : Math.round((raw[dimension].value as number) * HEALTH_WEIGHTS[dimension]),
    note: raw[dimension].note,
  }));

  const measured = dimensions.filter((d) => d.score !== null);
  const measuredWeight = measured.reduce((sum, d) => sum + d.weight, 0);
  const earned = measured.reduce((sum, d) => sum + (d.score as number), 0);

  // 測れた範囲のなかでの達成度を100点満点に直す
  const score = measuredWeight > 0 ? Math.round((earned / measuredWeight) * 100) : 0;
  const coveragePct = Math.round(
    (measuredWeight / Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)) * 100
  );

  const criticals = (input.securityIssues ?? []).filter((i) => i.severity === "critical");
  const risks = criticals.map((i) => i.description);

  /*
   * §18: セキュリティに重大問題があれば、他がどれだけ高くても AT_RISK。
   * スコアの平均に混ぜると重大問題が薄まるため、状態は別判定にする。
   */
  const status: HealthStatus = criticals.length > 0
    ? "AT_RISK"
    : score >= 70
      ? "HEALTHY"
      : "WATCH";

  return { score, coveragePct, status, dimensions, risks, computedAt: now.toISOString() };
}

/* ─── Department Health（§19） ──────────────────── */

export type DepartmentHealth = {
  departmentId: string;
  name: string;
  /** 共通指標 */
  taskSuccessRatePct: number | null;
  failureRatePct: number | null;
  averageLatencyMs: number | null;
  humanCorrectionRatePct: number | null;
  costUsd: number | null;
  /** その部門固有の指標。部門によって意味が違うため自由形式 */
  specific: { label: string; value: number | null; unit: string | null; note?: string }[];
  score: number;
  coveragePct: number;
};

/**
 * 部門ごとのHealth。
 *
 * §19 の要点: Investment と Media を同じKPIだけで評価しない。
 * 共通部分（成功率・失敗・遅延・修正・コスト）は揃えつつ、
 * 固有指標は呼び出し側から渡す。
 */
export function computeDepartmentHealth(input: {
  departmentId: string;
  name: string;
  taskSuccessRatePct: number | null;
  failureRatePct: number | null;
  averageLatencyMs: number | null;
  humanCorrectionRatePct: number | null;
  costUsd: number | null;
  specific?: DepartmentHealth["specific"];
}): DepartmentHealth {
  const parts: { value: number | null; weight: number }[] = [
    { value: input.taskSuccessRatePct === null ? null : input.taskSuccessRatePct / 100, weight: 40 },
    { value: input.failureRatePct === null ? null : 1 - input.failureRatePct / 100, weight: 30 },
    {
      value:
        input.humanCorrectionRatePct === null ? null : 1 - input.humanCorrectionRatePct / 100,
      weight: 30,
    },
  ];

  const measured = parts.filter((p) => p.value !== null);
  const measuredWeight = measured.reduce((sum, p) => sum + p.weight, 0);
  const earned = measured.reduce((sum, p) => sum + (p.value as number) * p.weight, 0);

  return {
    ...input,
    specific: input.specific ?? [],
    score: measuredWeight > 0 ? Math.round((earned / measuredWeight) * 100) : 0,
    coveragePct: Math.round((measuredWeight / 100) * 100),
  };
}
