"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DepartmentId } from "@/app/lib/mobile-ceo/departments";
import type { AttentionCard, DepartmentKpiGoal, HumanDecisionFeedback } from "@/app/lib/mobile-ceo/controlCenter";
import type { SkillImprovementCandidate } from "@/app/lib/company/evolution/skillObservability";
import type { SkillCandidate } from "@/app/lib/company/evolution/skillCandidates";
import { HumanDecisionPanel, postHumanDecision } from "./HumanDecision";
import { Section } from "./MobilePrimitives";

export type DepartmentControlData = {
  skillIds: string[];
  skillImprovements: Array<SkillImprovementCandidate & { skillName: string }> | null;
  skillCandidates: SkillCandidate[] | null;
  feedback: HumanDecisionFeedback[] | null;
  kpiGoals: DepartmentKpiGoal[] | null;
};

/** CEO確認・KPI目標で共有する Department Control データ。 */
export function useDepartmentControl(id: DepartmentId) {
  const [data, setData] = useState<DepartmentControlData | null>(null);
  const reload = useCallback(async () => {
    try { const response = await fetch(`/api/company/departments/${id}/control`); setData(await response.json()); } catch { setData(null); }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, reload };
}

const REASON: Record<SkillImprovementCandidate["reasonType"], string> = {
  HIGH_FAILURE_RATE: "失敗率が高い",
  REPEATED_ERROR: "同じエラーが繰り返されている",
  LOW_USAGE: "ほとんど使われていない",
  MISSION_BLOCK_CORRELATION: "Mission停止と相関している",
};
const CARD_TONE: Record<AttentionCard["type"], string> = {
  ACTION_REQUIRED: "border-amber-500/40 bg-amber-500/10",
  WARNING: "border-orange-500/30 bg-orange-500/5",
  DATA_MISSING: "border-slate-700 bg-slate-900",
  PROPOSAL: "border-violet-500/40 bg-violet-500/10",
};
const CARD_LABEL: Record<AttentionCard["type"], string> = { ACTION_REQUIRED: "要対応", WARNING: "注意", DATA_MISSING: "データ不足", PROPOSAL: "提案" };

export function FeedbackHistory({ records }: { records: HumanDecisionFeedback[] }) {
  if (!records.length) return null;
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-violet-300">判断済み {records.length}件</summary>
      <ul className="space-y-2 text-xs">
        {records.slice().reverse().map((record) => (
          <li key={record.id} className="rounded-lg bg-slate-950 p-2">
            <span className="text-slate-300">{record.targetType} · {record.decision}</span>
            <span className="ml-2 text-slate-600">{record.createdAt.slice(0, 16).replace("T", " ")}</span>
            {record.note ? <p className="mt-1 whitespace-pre-wrap text-amber-100"><span className="text-slate-500">CEO補足: </span>{record.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Skill改善提案・新Skill提案（Human Decision対象）。Creator / Fund / Investment Learningで共用する。 */
export function SkillProposalList({ id, control, onChanged }: { id: DepartmentId; control: DepartmentControlData | null; onChanged: () => void }) {
  const improvements = (control?.skillImprovements ?? []).filter((item) => item.status === "PROPOSED");
  const candidates = (control?.skillCandidates ?? []).filter((item) => item.status === "PROPOSED");

  async function decideImprovement(candidateId: string, decision: string, note: string) {
    const error = await postHumanDecision(`/api/company/skill-improvements/${encodeURIComponent(candidateId)}/decision`, { decision, note, departmentId: id });
    if (!error) onChanged();
    return error;
  }
  async function decideCandidate(candidateId: string, decision: string, note: string) {
    if (decision === "REJECTED" && !note) return "却下には理由（補足欄）が必要です";
    const error = await postHumanDecision(`/api/company/skill-candidates/${encodeURIComponent(candidateId)}/decision`, { decision, note, reason: decision === "REJECTED" ? note : undefined, departmentId: id });
    if (!error) onChanged();
    return error;
  }

  return <>
    {improvements.map((item) => (
      <li key={item.id} className={`rounded-xl border p-3 text-sm ${CARD_TONE.PROPOSAL}`}>
        <span className="text-[10px] font-semibold text-slate-400">Skill改善提案（AI提案）</span>
        <p className="mt-1 font-semibold">「{item.skillName}」の改善</p>
        <p className="mt-2 text-xs text-slate-300">理由: {REASON[item.reasonType]} — {item.evidence.failureCount} / {item.evidence.executionCount} 回失敗{item.evidence.errorCodes.length ? `（${item.evidence.errorCodes.join(", ")}）` : ""}</p>
        <p className="mt-1 text-xs text-slate-500">承認してもSkillコードは変更されません。実装は別のEngineering工程です。</p>
        <HumanDecisionPanel onDecide={(decision, note) => decideImprovement(item.id, decision, note)} />
      </li>
    ))}
    {candidates.map((item) => (
      <li key={item.id} className={`rounded-xl border p-3 text-sm ${CARD_TONE.PROPOSAL}`}>
        <span className="text-[10px] font-semibold text-slate-400">新Skill提案（AI提案）</span>
        <p className="mt-1 font-semibold">{item.name}</p>
        <p className="mt-2 text-xs text-slate-300">目的: {item.purpose}</p>
        <p className="mt-1 text-xs text-slate-300">理由: {item.reason}（{item.usageCount}件のMissionで反復）</p>
        <p className="mt-1 text-xs text-slate-500">承認してもSkill Registryは変更されません。仕様化・実装は別工程です。</p>
        <HumanDecisionPanel onDecide={(decision, note) => decideCandidate(item.id, decision, note)} />
      </li>
    ))}
  </>;
}

export function pendingSkillProposalCount(control: DepartmentControlData | null) {
  return (control?.skillImprovements ?? []).filter((item) => item.status === "PROPOSED").length + (control?.skillCandidates ?? []).filter((item) => item.status === "PROPOSED").length;
}

/**
 * 「CEO確認」。確認事項とAI提案を1つにまとめ、Human Decisionが必要なProposalだけに承認UIを付ける。
 * Skill Proposalは承認してもSkillコード・Registryを変更しない（executable: false を維持）。
 */
export function DepartmentAttention({ id, cards, control, onChanged }: { id: DepartmentId; cards: AttentionCard[]; control: DepartmentControlData | null; onChanged: () => void }) {
  const total = cards.length + pendingSkillProposalCount(control);
  return (
    <Section title={`CEO確認  ${total}件`}>
      {total === 0 ? <p className="text-sm text-slate-400">いまCEOが判断する必要のあるものはありません。</p> : null}
      <ul className="space-y-3">
        {cards.map((card) => (
          <li key={card.id} className={`rounded-xl border p-3 text-sm ${CARD_TONE[card.type]}`}>
            <span className="text-[10px] font-semibold text-slate-400">{CARD_LABEL[card.type]}</span>
            <p className="mt-1 text-slate-100">{card.title}</p>
            {card.detail ? <p className="mt-1 text-xs text-slate-400">{card.detail}</p> : null}
            {card.href ? <Link href={card.href} className="mt-2 inline-flex min-h-11 items-center text-xs text-violet-300">確認する →</Link> : null}
          </li>
        ))}
        <SkillProposalList id={id} control={control} onChanged={onChanged} />
      </ul>
      {control?.skillImprovements === null ? <p className="mt-2 text-xs text-slate-500">Skill提案: 未取得</p> : null}
      <FeedbackHistory records={(control?.feedback ?? []).filter((record) => record.targetType !== "constitution-proposal")} />
    </Section>
  );
}
