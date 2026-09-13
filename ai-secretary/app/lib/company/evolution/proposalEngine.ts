/**
 * Proposal Engine — v3.1 Phase 3 §9〜§24
 *
 * Pattern（観測）を Proposal（提案）へ変換する。
 *
 * 抑制の方針（§22 / §23 / §24）:
 *   AI Company が「何でもSkillにしよう」「何でも社員を増やそう」と
 *   なるのを防ぐ。具体的には3つの関門を置く。
 *     1. Pattern → Proposal に写す時点で、軽い手段で解ける観測は
 *        重い提案へ変換しない（NEW_DEPARTMENT は最後の手段）
 *     2. Score / confidence / sampleSize でCEO表示を止める（§13 §14）
 *     3. 同じ問題に複数の提案が立ったら、軽い方だけを残す（§24）
 *
 * このエンジンは読み取り専用。組織もコードも変更しない（§25）。
 */

import type { Pattern, PatternType } from "./detection/types";
import {
  COMPLEXITY_BY_TYPE,
  RECOMMENDATION_RANK,
  targetsFromPattern,
  type OrganizationProposal,
  type ProposalStatus,
  type ProposalType,
} from "./proposalTypes";
import { computeConfidence, decideStatus, scorePattern, totalScore } from "./proposalScore";
import { defaultThresholds, type EvolutionThresholds } from "./thresholds";

/**
 * 観測 → 提案種別の対応。
 *
 * BOTTLENECK / HIGH_FAILURE_RATE / HIGH_RETRY_RATE は
 * 意図的に PROMPT_UPDATE へ寄せている。
 * 失敗が多いことの一次対処は、まずプロンプトや手順の見直しであって、
 * 社員を増やすことではない（§24 の優先順位）。
 */
const PATTERN_TO_PROPOSAL: Partial<Record<PatternType, ProposalType>> = {
  SKILL_CANDIDATE: "NEW_SKILL",
  WORKFLOW_CANDIDATE: "NEW_WORKFLOW",
  NEW_AGENT_CANDIDATE: "NEW_AGENT",
  AGENT_SPLIT_CANDIDATE: "SPLIT_AGENT",
  AGENT_MERGE_CANDIDATE: "MERGE_AGENT",
  NEW_DEPARTMENT_CANDIDATE: "NEW_DEPARTMENT",
  HIGH_HUMAN_INTERVENTION: "PROMPT_UPDATE",
  HIGH_FAILURE_RATE: "PROMPT_UPDATE",
  HIGH_RETRY_RATE: "PROMPT_UPDATE",
  // REPEATED_TASK と HIGH_API_COST は単体では提案にしない。
  // 前者は SKILL_CANDIDATE が拾い、後者は原因側の提案に根拠として付く
};

/** §16 同じ提案を毎日作り直さないためのキー */
export function proposalFingerprint(
  type: ProposalType,
  target: { departmentId?: string; agentId?: string; skillId?: string; operation?: string }
): string {
  return [
    type,
    target.departmentId ?? "-",
    target.agentId ?? "-",
    target.skillId ?? target.operation ?? "-",
  ].join(":");
}

function summarize(pattern: Pattern, type: ProposalType): string {
  const top = pattern.evidence
    .slice(0, 3)
    .map((e) => `${e.label} ${e.value}${e.unit ?? ""}`)
    .join(" / ");
  return `${pattern.title}。根拠: ${top}`;
}

/** 提案ごとのリスク。空にしない（§9 risks） */
function risksFor(type: ProposalType): string[] {
  switch (type) {
    case "NEW_DEPARTMENT":
      return [
        "部署が増えると責任範囲の重複と連携コストが生じる",
        "タスク量が一時的な増加だった場合、空の部署が残る",
      ];
    case "NEW_AGENT":
      return [
        "AI社員が増えるとルーティングが複雑になる",
        "既存AI社員の責務内で処理できる場合、重複が生じる",
      ];
    case "SPLIT_AGENT":
      return ["分割すると文脈が分断され、横断的な判断が弱くなる可能性がある"];
    case "MERGE_AGENT":
      return ["統合すると専門性が薄まり、プロンプトが肥大化する"];
    case "NEW_WORKFLOW":
      return ["手順を固定すると、例外的なケースで硬直する"];
    case "NEW_SKILL":
      return ["Skillが増えると、どれを使うかの判断コストが上がる"];
    case "PROMPT_UPDATE":
      return ["プロンプト変更は既存の出力品質に影響しうるため、変更前後の比較が要る"];
    default:
      return ["変更による影響範囲の確認が必要"];
  }
}

function expectedImpact(pattern: Pattern, type: ProposalType) {
  const share = pattern.evidence.find((e) => e.label === "そのAI社員に占める割合");
  const opLatency = pattern.evidence.find((e) => e.label.includes("平均処理時間") && e.unit === "秒");
  const otherLatency = pattern.evidence.find((e) => e.label === "他業務の平均処理時間");

  const timeReductionPct =
    opLatency && otherLatency && opLatency.value > 0
      ? Math.round(((opLatency.value - otherLatency.value) / opLatency.value) * 100)
      : null;

  return {
    description:
      type === "NEW_SKILL"
        ? "同じ処理を繰り返し手作業で行う必要がなくなる"
        : type === "NEW_WORKFLOW"
          ? "手順の抜け漏れが減り、実行のばらつきが小さくなる"
          : type === "PROMPT_UPDATE"
            ? "人の修正・失敗の原因を出力側で減らせる可能性がある"
            : "担当を分けることで、他業務への圧迫が緩和される",
    loadReductionPct: share ? share.value : null,
    timeReductionPct,
  };
}

export type BuildProposalsOptions = {
  thresholds?: EvolutionThresholds;
  /** 既存の提案。fingerprint が一致すれば更新する（§16） */
  existing?: OrganizationProposal[];
  now?: Date;
};

export type ProposalBuildResult = {
  proposals: OrganizationProposal[];
  /** CEOへ見せてよいもの（§13 §14 を通過したもの） */
  visible: OrganizationProposal[];
  /** 軽い手段が別にあるため抑制したもの（§24） */
  suppressed: { fingerprint: string; reason: string }[];
};

export function buildProposals(
  patterns: Pattern[],
  options: BuildProposalsOptions = {}
): ProposalBuildResult {
  const now = options.now ?? new Date();
  const thresholds = options.thresholds ?? defaultThresholds();
  const nowIso = now.toISOString();
  const existingByFingerprint = new Map(
    (options.existing ?? []).map((proposal) => [proposal.fingerprint, proposal])
  );

  const built = new Map<string, OrganizationProposal>();

  for (const pattern of patterns) {
    const type = PATTERN_TO_PROPOSAL[pattern.type];
    if (!type) continue;

    const fingerprint = proposalFingerprint(type, pattern.target);
    const breakdown = scorePattern(pattern, type, thresholds);
    const score = totalScore(breakdown);
    const confidence = computeConfidence(pattern, type, thresholds);
    const decision = decideStatus(score, confidence, pattern.sampleSize, thresholds);

    const previous = existingByFingerprint.get(fingerprint);
    const alreadyBuilt = built.get(fingerprint);

    // 同じfingerprintの観測が複数来たら、根拠の厚い方を採る
    if (alreadyBuilt && alreadyBuilt.sampleSize >= pattern.sampleSize) continue;

    const history = previous ? [...previous.history] : [];
    if (!previous) {
      history.push({ at: nowIso, change: "created", score, confidence, status: decision.status });
    } else {
      if (previous.score !== score) {
        history.push({ at: nowIso, change: "score_changed", score, confidence });
      }
      if (previous.status !== decision.status) {
        history.push({ at: nowIso, change: "status_changed", status: decision.status });
      }
      history.push({ at: nowIso, change: "evidence_updated", note: `sampleSize ${pattern.sampleSize}` });
    }

    built.set(fingerprint, {
      id: previous?.id ?? `prop_${fingerprint.replace(/[^A-Za-z0-9]/g, "_")}`,
      fingerprint,
      type,
      title: pattern.title,
      summary: summarize(pattern, type),
      evidence: pattern.evidence,
      sourcePatternKeys: [pattern.key],
      ...targetsFromPattern(pattern),
      score,
      scoreBreakdown: breakdown,
      confidence,
      complexityCost: COMPLEXITY_BY_TYPE[type],
      recommendationRank: RECOMMENDATION_RANK[type],
      expectedImpact: expectedImpact(pattern, type),
      risks: risksFor(type),
      sampleSize: pattern.sampleSize,
      observationWindowDays: pattern.observationWindowDays,
      // 却下済みのものは status を引き継ぐ（毎日提案し直さない・§18）
      status: previous?.status === "REJECTED" ? "REJECTED" : decision.status,
      rejectedAt: previous?.rejectedAt,
      rejectionReason: previous?.rejectionReason,
      cooldownUntil: previous?.cooldownUntil,
      history,
      createdAt: previous?.createdAt ?? nowIso,
      updatedAt: nowIso,
    });
  }

  const proposals = [...built.values()];
  const suppressed = suppressHeavierDuplicates(proposals);
  const suppressedKeys = new Set(suppressed.map((s) => s.fingerprint));

  const visible = proposals
    .filter((proposal) => !suppressedKeys.has(proposal.fingerprint))
    .filter((proposal) => proposal.status === "PROPOSED" || proposal.status === "HIGH_PRIORITY")
    .sort((a, b) => b.score - a.score || a.recommendationRank - b.recommendationRank);

  return { proposals, visible, suppressed };
}

/**
 * §24 同じ対象に軽い提案と重い提案が同時に立ったら、軽い方を残す。
 * 「新部署を作らなくてもSkill追加で解決できるならSkillを優先」の実装。
 */
export function suppressHeavierDuplicates(
  proposals: OrganizationProposal[]
): { fingerprint: string; reason: string }[] {
  const suppressed: { fingerprint: string; reason: string }[] = [];

  // 同じ部門・同じ業務に対する提案をまとめる
  const groups = new Map<string, OrganizationProposal[]>();
  for (const proposal of proposals) {
    const key = `${proposal.targetDepartment ?? "-"}:${proposal.targetSkill ?? proposal.targetAgent ?? "-"}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(proposal);
    else groups.set(key, [proposal]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const lightest = [...group].sort(
      (a, b) => a.recommendationRank - b.recommendationRank
    )[0];

    for (const proposal of group) {
      if (proposal.fingerprint === lightest.fingerprint) continue;
      if (proposal.recommendationRank <= lightest.recommendationRank) continue;
      suppressed.push({
        fingerprint: proposal.fingerprint,
        reason: `より軽い手段（${lightest.type}）で対処できるため抑制`,
      });
    }
  }

  return suppressed;
}

/** 表示可否の理由を出す（UI・監査用） */
export function explainVisibility(
  proposal: OrganizationProposal,
  thresholds: EvolutionThresholds = defaultThresholds()
): string {
  const decision = decideStatus(
    proposal.score,
    proposal.confidence,
    proposal.sampleSize,
    thresholds
  );
  return decision.visibleToCeo
    ? `表示（スコア${proposal.score} / 確信度${proposal.confidence}）`
    : `保留: ${decision.heldReason ?? "条件未達"}`;
}

export type { ProposalStatus };
