/**
 * 収益機会のスコア — Phase 5 §17 / §18
 *
 * 測れた項目だけで100点満点に換算し、coverage を別に出す。
 * 測れなかった項目を0点にすると、
 * 「情報が足りないだけの機会」が「価値のない機会」として沈む。
 */

import {
  OPPORTUNITY_WEIGHTS,
  type ExpectedRevenue,
  type OpportunityScoreBreakdown,
} from "./types";

export type ScoreInput = {
  expectedRevenue: ExpectedRevenue;
  estimatedEffortMinutes?: number;
  existingAssetMatch: number;
  automationPotential: number;
  /** 初期費用（円）。分からなければ undefined */
  initialCostYen?: number;
  /** 拡張性（0〜1）。分からなければ undefined */
  scalability?: number;
  /** 参考にする「最初の1円」の基準額。これを超えれば満点に近づく */
  revenueReferenceYen?: number;
};

export type ScoreResult = {
  score: number;
  breakdown: OpportunityScoreBreakdown;
  coveragePct: number;
  /** 測れなかった項目 */
  missing: string[];
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreOpportunity(input: ScoreInput): ScoreResult {
  const reference = input.revenueReferenceYen ?? 10_000;
  const missing: string[] = [];

  /** 測れた項目だけを積む。測れなければ null を返して重みごと除外する */
  const measure = (
    key: keyof OpportunityScoreBreakdown,
    value: number | null,
    label: string
  ): number | null => {
    if (value === null) {
      missing.push(label);
      return null;
    }
    return Math.round(clamp01(value) * OPPORTUNITY_WEIGHTS[key]);
  };

  const revenuePotential = measure(
    "revenuePotential",
    input.expectedRevenue.known
      ? clamp01(((input.expectedRevenue.minYen + input.expectedRevenue.maxYen) / 2) / reference)
      : null,
    "収益見込み"
  );

  const probability = measure(
    "probability",
    input.expectedRevenue.known ? clamp01(input.expectedRevenue.confidence) : null,
    "実現確率"
  );

  // 短時間で終わるものほど高い。8時間を基準にする
  const timeRequired = measure(
    "timeRequired",
    typeof input.estimatedEffortMinutes === "number"
      ? clamp01(1 - input.estimatedEffortMinutes / 480)
      : null,
    "所要時間"
  );

  const assetMatch = measure("existingAssetMatch", input.existingAssetMatch, "既存資産の活用度");

  // 初期費用が小さいほど高い。5万円を基準にする
  const initialCost = measure(
    "initialCost",
    typeof input.initialCostYen === "number" ? clamp01(1 - input.initialCostYen / 50_000) : null,
    "初期費用"
  );

  const scalability = measure(
    "scalability",
    typeof input.scalability === "number" ? input.scalability : null,
    "拡張性"
  );

  const automation = measure("automationPotential", input.automationPotential, "自動化の余地");

  const parts: { key: keyof OpportunityScoreBreakdown; value: number | null }[] = [
    { key: "revenuePotential", value: revenuePotential },
    { key: "probability", value: probability },
    { key: "timeRequired", value: timeRequired },
    { key: "existingAssetMatch", value: assetMatch },
    { key: "initialCost", value: initialCost },
    { key: "scalability", value: scalability },
    { key: "automationPotential", value: automation },
  ];

  const measured = parts.filter((p) => p.value !== null);
  const measuredWeight = measured.reduce((sum, p) => sum + OPPORTUNITY_WEIGHTS[p.key], 0);
  const earned = measured.reduce((sum, p) => sum + (p.value as number), 0);
  const totalWeight = Object.values(OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0);

  const breakdown = parts.reduce((acc, p) => {
    acc[p.key] = p.value ?? 0;
    return acc;
  }, {} as OpportunityScoreBreakdown);

  return {
    score: measuredWeight > 0 ? Math.round((earned / measuredWeight) * 100) : 0,
    breakdown,
    coveragePct: Math.round((measuredWeight / totalWeight) * 100),
    missing,
  };
}
