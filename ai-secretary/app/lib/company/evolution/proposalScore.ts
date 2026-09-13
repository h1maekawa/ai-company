/**
 * Proposal Score / Confidence / しきい値 — v3.1 Phase 3 §12 / §13 / §14
 *
 * 設計上の要点:
 *   Score だけで表示可否を決めない（§13）。
 *   データが薄いまま高得点が出ることはある（2件中2件が失敗すれば失敗率100%）。
 *   confidence と sampleSize を併せて見て、薄いものは WATCHING に留める。
 */

import type { Evidence, Pattern } from "./detection/types";
import {
  COMPLEXITY_BY_TYPE,
  SCORE_WEIGHTS,
  type ComplexityCost,
  type ProposalStatus,
  type ProposalType,
  type ScoreBreakdown,
} from "./proposalTypes";
import type { EvolutionThresholds } from "./thresholds";

/** 0〜max に収める */
const clamp = (value: number, max: number): number =>
  Math.max(0, Math.min(max, Math.round(value)));

const findEvidence = (evidence: Evidence[], label: string): number | null => {
  const hit = evidence.find((e) => e.label === label);
  return hit ? hit.value : null;
};

/* ─── 各配点の算出 ───────────────────────────────── */

/**
 * §12 の配点を、Patternの実測値から機械的に出す。
 * 推定できない項目は0にする（憶測で点を盛らない）。
 */
export function scorePattern(
  pattern: Pattern,
  type: ProposalType,
  thresholds: EvolutionThresholds
): ScoreBreakdown {
  const { evidence, sampleSize } = pattern;

  // Task Frequency: 強い候補のしきい値を満点の基準にする
  const frequencyBasis = thresholds.repeatedTask.strong * 2;
  const taskFrequency = clamp(
    (sampleSize / frequencyBasis) * SCORE_WEIGHTS.taskFrequency,
    SCORE_WEIGHTS.taskFrequency
  );

  // Time Saving: 処理時間の差が測れているときだけ加点する
  const opLatency = evidence.find((e) => e.unit === "秒" && e.label.includes("平均処理時間"));
  const otherLatency = evidence.find((e) => e.label === "他業務の平均処理時間");
  const timeSaving =
    opLatency && otherLatency && otherLatency.value > 0
      ? clamp(
          ((opLatency.value - otherLatency.value) / otherLatency.value) *
            SCORE_WEIGHTS.timeSaving,
          SCORE_WEIGHTS.timeSaving
        )
      : 0;

  // Quality Improvement: 人の修正率の高さを改善余地とみなす
  const correctionPct =
    findEvidence(evidence, "修正率") ??
    findEvidence(evidence, `${pattern.target.operation} の人の修正率`) ??
    findEvidence(evidence, "人の修正率") ??
    0;
  const qualityImprovement = clamp(
    (correctionPct / 50) * SCORE_WEIGHTS.qualityImprovement,
    SCORE_WEIGHTS.qualityImprovement
  );

  // Cost Reduction: コストが測れているときだけ
  const costUsd = findEvidence(evidence, "コスト") ?? 0;
  const costReduction = clamp(
    (costUsd / Math.max(1, thresholds.bottleneck.apiCostUsd)) * SCORE_WEIGHTS.costReduction,
    SCORE_WEIGHTS.costReduction
  );

  // CEO Intervention: 本来不要な修正の多さ
  const unnecessary = findEvidence(evidence, "本来不要な修正") ?? 0;
  const ceoIntervention = clamp(
    (unnecessary / Math.max(1, sampleSize)) * 2 * SCORE_WEIGHTS.ceoIntervention,
    SCORE_WEIGHTS.ceoIntervention
  );

  // Error Reduction: 失敗率
  const failurePct = findEvidence(evidence, "失敗率") ?? 0;
  const errorReduction = clamp(
    (failurePct / 50) * SCORE_WEIGHTS.errorReduction,
    SCORE_WEIGHTS.errorReduction
  );

  /*
   * Strategic Value（§15）:
   *   ログだけでは測れないため、組織を軽く保つ方向に価値を置く。
   *   軽い変更（Skill）ほど高く、重い変更（Department）ほど低い。
   *   これにより「同程度の改善ならSkillを優先」（§23）が点にも反映される。
   */
  const complexity = COMPLEXITY_BY_TYPE[type];
  const strategicValue =
    complexity === "low"
      ? SCORE_WEIGHTS.strategicValue
      : complexity === "medium"
        ? Math.round(SCORE_WEIGHTS.strategicValue * 0.6)
        : Math.round(SCORE_WEIGHTS.strategicValue * 0.3);

  return {
    taskFrequency,
    timeSaving,
    qualityImprovement,
    costReduction,
    ceoIntervention,
    errorReduction,
    strategicValue,
  };
}

export function totalScore(breakdown: ScoreBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

/* ─── Confidence（§14） ──────────────────────────── */

/**
 * サンプル数・観測日数・組織の重さから 0〜1 を出す。
 *
 * 重い提案ほど高い確信を要求する。
 * 部署新設が2件の観測で通ってしまうと、組織が観測ノイズで動く。
 */
export function computeConfidence(
  pattern: Pattern,
  type: ProposalType,
  thresholds: EvolutionThresholds
): number {
  const complexity: ComplexityCost = COMPLEXITY_BY_TYPE[type];
  const required =
    complexity === "low"
      ? thresholds.minimumSampleSize
      : complexity === "medium"
        ? thresholds.newAgent.minTasksInCategory
        : thresholds.newDepartment.minTaskVolume;

  const sampleRatio = Math.min(1, pattern.sampleSize / Math.max(1, required));

  // 観測窓を長く取れているほど確からしい
  const windowRatio = Math.min(1, pattern.observationWindowDays / thresholds.windowDays);

  const confidence = sampleRatio * 0.8 + windowRatio * 0.2;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
}

/* ─── しきい値（§13） ───────────────────────────── */

export type StatusDecision = {
  status: ProposalStatus;
  /** CEOへ見せてよいか */
  visibleToCeo: boolean;
  /** WATCHING に留めた理由 */
  heldReason?: string;
};

/**
 * Score / confidence / sampleSize の3つを見て status を決める。
 *
 * Score が高くても、サンプルが足りない・確信が低いものは WATCHING に留める。
 * §14 の例（score 88 / confidence 0.31 / sampleSize 2 → WATCH）がそのまま通る。
 */
export function decideStatus(
  score: number,
  confidence: number,
  sampleSize: number,
  thresholds: EvolutionThresholds,
  options: { minConfidence?: number } = {}
): StatusDecision {
  const minConfidence = options.minConfidence ?? 0.5;

  if (sampleSize < thresholds.minimumSampleSize) {
    return {
      status: "WATCHING",
      visibleToCeo: false,
      heldReason: `サンプルが${sampleSize}件（最低${thresholds.minimumSampleSize}件必要）`,
    };
  }
  if (confidence < minConfidence) {
    return {
      status: "WATCHING",
      visibleToCeo: false,
      heldReason: `確信度が${confidence}（最低${minConfidence}必要）`,
    };
  }

  if (score >= 85) return { status: "HIGH_PRIORITY", visibleToCeo: true };
  if (score >= 70) return { status: "PROPOSED", visibleToCeo: true };
  if (score >= 50) {
    return { status: "WATCHING", visibleToCeo: false, heldReason: `スコア${score}（70未満）` };
  }
  return { status: "WATCHING", visibleToCeo: false, heldReason: `スコア${score}（50未満・無視）` };
}
