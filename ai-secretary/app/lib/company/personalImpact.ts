/**
 * Proposal への Personal Impact 付与 — Phase 5 §32 〜 §35 / §60
 *
 * §60 の要点: 収益履歴を Pattern Analyzer へ生データとして混ぜない。
 * 責務を分け、ここでは「提案にPersonal Companyの観点を後付けする」だけにする。
 *
 * §35 の要点: 推定根拠が無ければ UNKNOWN のままにする。
 * 数字を捏造して提案を通りやすくしない。
 */

import type { OrganizationProposal, PersonalImpact } from "./evolution/proposalTypes";
import { effectiveEntries, type RevenueEntry } from "./revenueStore";

/** CEOの手直し1件あたりに失われる時間の目安（分）。調整可能にしておく */
const MINUTES_PER_INTERVENTION = 10;

export type ImpactInput = {
  proposal: OrganizationProposal;
  revenueEntries?: RevenueEntry[];
};

/**
 * 提案に Personal Impact を付ける。
 *
 * 収益への影響は、その対象で実際に稼げた実績があるときだけ見積もる。
 * 実績が無い対象に「月+¥Xの見込み」と書くのは推測でしかない。
 */
export function attachPersonalImpact(input: ImpactInput): OrganizationProposal {
  const { proposal } = input;
  const unknownReasons: string[] = [];
  const impact: PersonalImpact = {};

  /* ─── 時間への影響 ─── */
  const interventions = proposal.evidence.find((e) => e.label === "本来不要な修正");
  if (interventions && interventions.value > 0) {
    impact.expectedTimeSavedMinutes = Math.round(interventions.value * MINUTES_PER_INTERVENTION);
  } else {
    unknownReasons.push("削減できる手直し時間の根拠がありません");
  }

  /* ─── 収益への影響 ─── */
  const entries = effectiveEntries(input.revenueEntries ?? []).filter(
    (e) => e.confirmedByHuman && e.sourceType !== "investment"
  );
  const linked = entries.filter(
    (e) =>
      (proposal.targetAgent && e.originAgentId === proposal.targetAgent) ||
      (proposal.targetSkill && e.originSkillId === proposal.targetSkill)
  );

  if (linked.length > 0) {
    impact.expectedRevenueImpactYen = Math.round(
      linked.reduce((sum, e) => sum + e.amountYen, 0) / linked.length
    );
    impact.confidence = Math.min(0.7, 0.2 + linked.length * 0.1);
  } else {
    // 実績が無いなら金額を出さない（§35）
    unknownReasons.push("この対象で実際に稼げた実績がないため収益影響を見積もれません");
  }

  /* ─── 資産・貯蓄への影響 ─── */
  // 組織変更が直接資産・貯蓄を動かす根拠は現状ない。推測で埋めない
  unknownReasons.push("資産・貯蓄への直接の影響は測れていません");

  return {
    ...proposal,
    personalImpact: {
      ...impact,
      unknownReasons: unknownReasons.length > 0 ? unknownReasons : undefined,
    },
  };
}

export function attachPersonalImpactAll(
  proposals: OrganizationProposal[],
  revenueEntries?: RevenueEntry[]
): OrganizationProposal[] {
  return proposals.map((proposal) => attachPersonalImpact({ proposal, revenueEntries }));
}
