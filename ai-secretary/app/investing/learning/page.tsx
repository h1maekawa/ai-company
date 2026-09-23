"use client";

import { InvestingShell } from "@/components/investing/Shell";
import { Card, CardHeader, Skeleton } from "@/components/investing/ui";
import { HumanDecisionPanel, postHumanDecision } from "@/components/mobile-ceo/HumanDecision";
import { pendingSkillProposalCount, SkillProposalList, useDepartmentControl } from "@/components/mobile-ceo/DepartmentAttention";
import type { InvestmentLearning } from "@/app/lib/fund/learning/types";
import type { FundPolicy } from "@/app/lib/fund/policy";
import { latestDecisionFor } from "@/app/lib/mobile-ceo/controlCenter";
import { useJson } from "../usePortfolio";

const CONFIDENCE: Record<InvestmentLearning["confidence"], string> = { low: "low", medium: "medium", high: "high" };

function LearningBody({ learning }: { learning: InvestmentLearning }) {
  return (
    <dl className="space-y-2 text-sm">
      <div><dt className="text-[11px] text-sub">Observation</dt><dd className="text-slate-200">{learning.observation}</dd></div>
      <div><dt className="text-[11px] text-sub">Interpretation（AI解釈）</dt><dd className="text-slate-200">{learning.interpretation}</dd></div>
      {learning.proposedPrinciple ? <div><dt className="text-[11px] text-sub">Proposed Principle（AI提案）</dt><dd className="text-slate-200">{learning.proposedPrinciple}</dd></div> : null}
      <div className="flex flex-wrap gap-x-4 text-[11px] text-sub"><span>Confidence {CONFIDENCE[learning.confidence]}</span><span>Sample {learning.sampleSize}</span><span>Horizon {learning.horizon}</span><span>{learning.createdAt.slice(0, 10)}</span></div>
    </dl>
  );
}

/** 実際のPolicyに存在する原則だけを表示する（Policyは読み取りのみ）。 */
function constitutionRules(policy: FundPolicy): Array<[string, string]> {
  return [
    ["資産配分", `投信 ${policy.allocation.targetFundPct}% : 個別株 ${policy.allocation.targetStockPct}%（許容 ±${policy.allocation.tolerancePct}%）`],
    ["単一銘柄の集中", `警告 ${policy.singleStock.warningPct}% / 上限 ${policy.singleStock.hardLimitPct}%`],
    ["テーマ集中", `警告 ${policy.theme.warningPct}% / 上限 ${policy.theme.hardLimitPct}%`],
    ["判定スコア", `BUY ≥ ${policy.scoring.buyMin} / WATCH ≥ ${policy.scoring.watchMin} / REVIEW ≥ ${policy.scoring.reviewMin}`],
    ["損切り・見直し", `短期 ATR×${policy.stopLoss.short.atrMult}（${policy.stopLoss.short.minPct}〜${policy.stopLoss.short.maxPct}%）/ 中期 -${policy.stopLoss.medium.forcedReviewDropPct}% / 長期 -${policy.stopLoss.long.forcedReviewDropPct}% で強制見直し`],
    ["決算前", `決算 ${policy.earningsBlackoutDays}日前は新規判断しない`],
    ["データ鮮度", `価格 ${policy.freshness.priceMaxAgeDays}日以内 / 投資可能額 ${policy.freshness.capacityMaxAgeHours}時間以内`],
    ["Paper mode", policy.paperMode.enabled ? `有効（${policy.paperMode.minimumDays}日 or ${policy.paperMode.minimumClosedSignals}件決着まで実資金に移行しない）` : "無効"],
  ];
}

/**
 * Investment Learning。
 * すべての承認は「人間が認めた候補」にするだけで、Policy / Constitution本文・Skill Registry・
 * Recommendation Scoreを自動変更しない。
 */
export default function InvestmentLearningPage() {
  const learning = useJson<{ learnings: InvestmentLearning[] }>("/api/fund/learning");
  const policy = useJson<{ policy: FundPolicy; source: string }>("/api/fund/policy");
  const { data: control, reload: reloadControl } = useDepartmentControl("fund");

  const learnings = learning.data?.learnings ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todays = learnings.filter((item) => item.createdAt.slice(0, 10) === today);
  const candidates = learnings.filter((item) => item.status === "candidate");
  const decided = learnings.filter((item) => item.status !== "candidate");
  const proposals = learnings.filter((item) => item.proposedPrinciple && item.status !== "rejected");

  async function decideLearning(learningId: string, decision: string) {
    const error = await postHumanDecision("/api/fund/learning", { action: decision === "APPROVED" ? "approve" : "reject", learningId, confirmedByHuman: true });
    if (!error) learning.reload();
    return error;
  }
  async function decideConstitution(learningId: string, decision: string, note: string) {
    const error = await postHumanDecision("/api/company/departments/fund/control", { action: "constitution-decision", confirmedByHuman: true, learningId, decision, note });
    if (!error) void reloadControl();
    return error;
  }

  return (
    <InvestingShell title="🧠 Investment Learning">
      <div className="space-y-4">
        <Card>
          <CardHeader title="今日学んだこと" hint={today} />
          {learning.loading ? <Skeleton className="h-16" /> : learning.data === null ? <p className="text-sm text-sub">未取得</p> : todays.length === 0 ? <p className="text-sm text-sub">今日作成されたLearningはありません。</p> : <ul className="space-y-3">{todays.map((item) => <li key={item.id}><LearningBody learning={item} /></li>)}</ul>}
        </Card>

        <Card>
          <CardHeader title="Knowledge Candidates" hint={`${candidates.length}件 · 承認するまで正式Knowledgeにはなりません`} />
          {learning.loading ? <Skeleton className="h-24" /> : candidates.length === 0 ? <p className="text-sm text-sub">確認待ちの候補はありません。</p> : (
            <ul className="space-y-4">
              {candidates.map((item) => (
                <li key={item.id} className="rounded-xl border border-hairline p-4">
                  <LearningBody learning={item} />
                  <HumanDecisionPanel options={["APPROVED", "REJECTED"]} withNote={false} onDecide={(decision) => decideLearning(item.id, decision)} />
                </li>
              ))}
            </ul>
          )}
          {decided.length ? (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-brand">判断済み（approved {decided.filter((item) => item.status === "approved").length} / rejected {decided.filter((item) => item.status === "rejected").length}）</summary>
              <ul className="space-y-3">{decided.map((item) => <li key={item.id} className="rounded-xl bg-white/[0.02] p-3"><span className="text-[11px] font-semibold text-sub">{item.status}</span><LearningBody learning={item} /></li>)}</ul>
            </details>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Skill Improvement Candidates" hint="Investment関連Skillへの改善提案" />
          {control === null ? <Skeleton className="h-16" /> : pendingSkillProposalCount(control) === 0 ? <p className="text-sm text-sub">{control.skillImprovements === null ? "未取得" : "確認待ちのSkill提案はありません。"}</p> : <ul className="space-y-3"><SkillProposalList id="fund" control={control} onChanged={() => void reloadControl()} /></ul>}
        </Card>

        <Card>
          <CardHeader title="Constitution Change Proposals" hint="承認しても投資原則（Policy）本文は変更されません" />
          {learning.loading ? <Skeleton className="h-16" /> : proposals.length === 0 ? <p className="text-sm text-sub">Proposed Principleを持つLearningはありません。</p> : (
            <ul className="space-y-4">
              {proposals.map((item) => {
                const decision = latestDecisionFor(control?.feedback ?? undefined, "constitution-proposal", item.id);
                return (
                  <li key={item.id} className="rounded-xl border border-hairline p-4">
                    <p className="font-semibold text-white">{item.proposedPrinciple}</p>
                    <p className="mt-2 text-[11px] text-sub">Source: Investment Learning {item.id} · Evidence: Decision Review × {item.sourceDecisionIds.length} · Sample {item.sampleSize}</p>
                    {decision ? (
                      <p className="mt-3 text-sm text-slate-200">
                        人間の判断: <strong>{decision.decision === "APPROVED" ? "採用候補として承認" : "却下"}</strong>（{decision.createdAt.slice(0, 10)}）
                        {decision.note ? <span className="mt-1 block text-amber-100"><span className="text-sub">CEO補足: </span>{decision.note}</span> : null}
                        <span className="mt-1 block text-[11px] text-sub">Policyへの反映は別のHuman-supervised implementationで行います。</span>
                      </p>
                    ) : <HumanDecisionPanel options={["APPROVED", "REJECTED"]} onDecide={(value, note) => decideConstitution(item.id, value, note)} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Investment Constitution" hint={policy.data ? `Policy v${policy.data.policy.policyVersion} · ${policy.data.policy.updatedAt} · ${policy.data.source}` : "Fund Policy"} />
          {policy.loading ? <Skeleton className="h-32" /> : !policy.data ? <p className="text-sm text-sub">未取得</p> : (
            <dl className="divide-y divide-hairline/60 text-sm">
              {constitutionRules(policy.data.policy).map(([label, value]) => <div key={label} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]"><dt className="text-sub">{label}</dt><dd className="text-slate-200">{value}</dd></div>)}
            </dl>
          )}
          <p className="mt-3 text-[11px] text-sub">表示のみ。変更は投資設定（/investing/settings）から人間が行います。</p>
        </Card>
      </div>
    </InvestingShell>
  );
}
