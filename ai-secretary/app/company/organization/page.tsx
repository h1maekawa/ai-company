"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/primitives";

type ProposalView = {
  id: string;
  type: string;
  title: string;
  summary: string;
  score: number;
  confidence: number;
  complexityCost: string;
  status: string;
  evidence: { label: string; value: number; unit: string | null }[];
  risks: string[];
};
type SkillCandidateView = { id: string; name: string; purpose: string; status: string; reason: string; usageCount: number; sourceMissionIds: string[]; sourceKnowledgeIds: string[]; repeatedSteps: string[]; suggestedAgents: string[]; suggestedCategory: string; inputDescription: string; outputDescription: string; existingSimilarSkillIds: string[] };
type SpecificationView = { id: string; skillCandidateId: string; proposedSkillId: string; title: string; purpose: string; status: string; allowedAgentIds: string[]; acceptanceCriteria: string[]; requiredTests: string[]; constraints: string[]; inputDescription: string; outputDescription: string; evidenceSummary: string };
type HandoffView = { candidateId: string; specificationId: string; githubIssueNumber: number; githubIssueUrl: string; aiReadyApprovedAt?: string; workerStatus?: string; pullRequestUrl?: string; implementedSkillId?: string; reconciledAt?: string };

/**
 * /company/organization — 組織の提案を閲覧する（Phase 4 §35）
 *
 * Phase 4 では閲覧まで。承認・自動実装は行わない。
 */
export default function OrganizationPage() {
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidateView[] | null>(null);
  const [specifications, setSpecifications] = useState<SpecificationView[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffView[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [proposalResponse, candidateResponse] = await Promise.all([fetch("/api/company/proposals"), fetch("/api/company/skill-candidates")]);
      if (!proposalResponse.ok || !candidateResponse.ok) throw new Error();
      const [proposalJson, candidateJson] = await Promise.all([proposalResponse.json(), candidateResponse.json()]);
      setProposals(proposalJson.visible ?? []); setSkillCandidates(candidateJson.candidates ?? []); setSpecifications(candidateJson.specifications ?? []); setHandoffs(candidateJson.handoffs ?? []); setError("");
    } catch { setProposals([]); setSkillCandidates([]); setError("改善候補を取得できませんでした"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(candidate: SkillCandidateView, decision: "APPROVED" | "REJECTED" | "HOLD") {
    const reason = decision === "REJECTED" ? window.prompt("却下理由を入力してください") : undefined;
    if (decision === "REJECTED" && !reason?.trim()) return;
    if (!window.confirm(`${candidate.name}を${decision}にしますか？\n承認してもSkill実装やEngineeringは開始されません。`)) return;
    const response = await fetch(`/api/company/skill-candidates/${encodeURIComponent(candidate.id)}/decision`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ decision, reason }) });
    if (!response.ok) setError("判断を保存できませんでした"); else void load();
  }

  async function humanAction(path: string, confirmation: string, body?: Record<string, unknown>) {
    if (!window.confirm(confirmation)) return;
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body ?? {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(String(payload.error ?? "操作を保存できませんでした")); else void load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-3 py-6 sm:px-6">
      <header>
        <Link href="/company" className="text-[11px] text-sub hover:text-white">
          ← ダッシュボードへ
        </Link>
        <h1 className="mt-2 text-lg font-bold text-white">AI会社改善</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-sub">
          日々の記録から見つかった組織変更の候補です。
          Phase 4 時点では閲覧のみで、自動実装は行いません。
        </p>
      </header>

      <section className="space-y-3"><div><h2 className="text-sm font-semibold text-white">Skill候補</h2><p className="text-[11px] text-sub">3段階のHuman Gate: Skill価値判断 → 仕様承認 → 実装開始許可。各Gateは自動通過しません。</p></div>{error ? <p className="rounded-xl border border-loss/30 p-3 text-xs text-loss">{error}</p> : null}{skillCandidates === null ? <Skeleton className="h-32 rounded-2xl" /> : skillCandidates.length === 0 ? <p className="rounded-2xl border border-hairline bg-ink-card p-5 text-xs text-sub">現在、十分なEvidenceを持つSkill候補はありません。</p> : <ul className="space-y-3">{skillCandidates.map((candidate)=>{const specification=specifications.find((item)=>item.skillCandidateId===candidate.id);const handoff=handoffs.find((item)=>item.candidateId===candidate.id);return <li id={`skill-candidate-${candidate.id}`} key={candidate.id} className="rounded-2xl border border-hairline bg-ink-card p-5"><div className="flex justify-between gap-3"><div><span className="text-[10px] text-brand">{candidate.status} · {candidate.suggestedCategory}</span><h3 className="mt-1 text-sm font-semibold">{candidate.name}</h3><p className="mt-1 text-xs text-sub">{candidate.purpose}</p></div><strong className="text-lg text-brand">{candidate.usageCount} Missions</strong></div><details className="mt-3 text-xs text-sub"><summary className="cursor-pointer">EvidenceとEngineering詳細</summary><div className="mt-3 space-y-2"><p>Source Missions: {candidate.sourceMissionIds.join(", ")}</p><p>Knowledge: {candidate.sourceKnowledgeIds.join(", ")}</p><p>Steps: {candidate.repeatedSteps.join(", ")}</p><p>Suggested Agents: {candidate.suggestedAgents.join(", ")}</p>{specification?<div className="mt-4 rounded-xl border border-hairline p-3"><p className="font-semibold text-white">Engineering Specification · {specification.status}</p><p>Skill ID: {specification.proposedSkillId}</p><p>Purpose: {specification.purpose}</p><p>Input: {specification.inputDescription}</p><p>Output: {specification.outputDescription}</p><p>Allowed Agents: {specification.allowedAgentIds.join(", ")}</p><p>Acceptance Criteria: {specification.acceptanceCriteria.join(" / ")}</p></div>:null}{handoff?<div className="mt-3 rounded-xl border border-hairline p-3"><p className="font-semibold text-white">Engineering Request · Issue #{handoff.githubIssueNumber}</p><p>Worker Permission: {handoff.aiReadyApprovedAt?"READY":"NOT READY"}</p><p>Worker: {handoff.workerStatus??"UNKNOWN"}</p>{handoff.implementedSkillId?<p>Implemented Skill: {handoff.implementedSkillId}</p>:null}<a className="text-brand underline" href={handoff.githubIssueUrl} target="_blank" rel="noreferrer">GitHubで確認</a></div>:null}</div></details>{candidate.status === "PROPOSED" ? <div className="mt-4 grid grid-cols-3 gap-2"><button onClick={()=>void decide(candidate,"REJECTED")} className="min-h-11 rounded-xl border border-loss/40 text-xs">却下</button><button onClick={()=>void decide(candidate,"HOLD")} className="min-h-11 rounded-xl border border-hairline text-xs">保留</button><button onClick={()=>void decide(candidate,"APPROVED")} className="min-h-11 rounded-xl bg-brand px-2 text-xs font-semibold text-black">Skill化を承認</button></div> : null}{candidate.status==="APPROVED"&&!specification?<button onClick={()=>void humanAction(`/api/company/skill-candidates/${encodeURIComponent(candidate.id)}/specifications`,"Candidate EvidenceからEngineering Specificationを作成します。まだIssueや実装は開始されません。")} className="mt-4 min-h-11 w-full rounded-xl border border-brand/50 text-xs text-brand">Engineering Specificationを作成</button>:null}{specification?.status==="READY_FOR_HUMAN_REVIEW"?<div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>void humanAction(`/api/company/skill-specifications/${encodeURIComponent(specification.id)}/decision`,"この仕様を却下しますか？",{decision:"REJECTED",reason:"CEO rejected specification"})} className="min-h-11 rounded-xl border border-loss/40 text-xs">仕様を却下</button><button onClick={()=>void humanAction(`/api/company/skill-specifications/${encodeURIComponent(specification.id)}/decision`,"このEngineering仕様を承認します。Issue作成や実装開始はまだ行いません。",{decision:"APPROVED_FOR_ENGINEERING"})} className="min-h-11 rounded-xl bg-brand text-xs font-semibold text-black">仕様を承認</button></div>:null}{specification?.status==="APPROVED_FOR_ENGINEERING"&&!handoff?<button onClick={()=>void humanAction(`/api/company/skill-specifications/${encodeURIComponent(specification.id)}/engineering-request`,"この仕様でGitHub Engineering Issueを作成します。ai-readyは付与されず、Workerは開始しません。")} className="mt-4 min-h-11 w-full rounded-xl bg-brand text-xs font-semibold text-black">Engineering Requestを作成</button>:null}{handoff&&!handoff.aiReadyApprovedAt?<button onClick={()=>void humanAction(`/api/company/skill-specifications/${encodeURIComponent(handoff.specificationId)}/ai-ready`,"このIssueの実装開始をWorkerへ明示的に許可し、ai-readyを付与します。")} className="mt-4 min-h-11 w-full rounded-xl bg-warning text-xs font-semibold text-black">実装開始を許可</button>:null}{handoff?.aiReadyApprovedAt?<button onClick={()=>void humanAction(`/api/company/skill-specifications/${encodeURIComponent(handoff.specificationId)}/reconcile`,"GitHub PR mergeとSkill Registry実装状態を再確認します。")} className="mt-4 min-h-11 w-full rounded-xl border border-hairline text-xs">実装状態を再照合</button>:null}</li>})}</ul>}</section>

      {proposals === null ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : proposals.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-ink-card px-5 py-8 text-center">
          <p className="text-sm text-slate-300">いま提案はありません。</p>
          <p className="mt-1 text-[11px] text-sub">
            データが足りない場合も提案は出ません（誤った提案を出さないためです）。
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="rounded-2xl border border-hairline bg-ink-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="rounded-full border border-hairline bg-white/5 px-2 py-0.5 text-[10px] text-sub">
                    {proposal.type}
                  </span>
                  <p className="mt-1.5 text-sm font-semibold text-white">{proposal.title}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums text-brand">{proposal.score}</p>
                  <p className="text-[10px] text-sub">確信度 {proposal.confidence}</p>
                </div>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-sub">{proposal.summary}</p>

              <div className="mt-3">
                <p className="text-[10px] font-medium text-slate-300">根拠</p>
                <ul className="mt-1 space-y-0.5">
                  {proposal.evidence.slice(0, 5).map((item, index) => (
                    <li key={index} className="text-[10px] text-sub">
                      {item.label}: {item.value}
                      {item.unit ?? ""}
                    </li>
                  ))}
                </ul>
              </div>

              {proposal.risks.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-medium text-slate-300">リスク</p>
                  <ul className="mt-1 space-y-0.5">
                    {proposal.risks.map((risk) => (
                      <li key={risk} className="text-[10px] text-loss/80">
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
