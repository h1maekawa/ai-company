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

/**
 * /company/organization — 組織の提案を閲覧する（Phase 4 §35）
 *
 * Phase 4 では閲覧まで。承認・自動実装は行わない。
 */
export default function OrganizationPage() {
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidateView[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [proposalResponse, candidateResponse] = await Promise.all([fetch("/api/company/proposals"), fetch("/api/company/skill-candidates")]);
      if (!proposalResponse.ok || !candidateResponse.ok) throw new Error();
      const [proposalJson, candidateJson] = await Promise.all([proposalResponse.json(), candidateResponse.json()]);
      setProposals(proposalJson.visible ?? []); setSkillCandidates(candidateJson.candidates ?? []); setError("");
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

      <section className="space-y-3"><div><h2 className="text-sm font-semibold text-white">Skill候補</h2><p className="text-[11px] text-sub">Actual Usageと3つ以上のdistinct Missionから検出。承認は実装開始を意味しません。</p></div>{error ? <p className="rounded-xl border border-loss/30 p-3 text-xs text-loss">{error}</p> : null}{skillCandidates === null ? <Skeleton className="h-32 rounded-2xl" /> : skillCandidates.length === 0 ? <p className="rounded-2xl border border-hairline bg-ink-card p-5 text-xs text-sub">現在、十分なEvidenceを持つSkill候補はありません。</p> : <ul className="space-y-3">{skillCandidates.map((candidate)=><li id={`skill-candidate-${candidate.id}`} key={candidate.id} className="rounded-2xl border border-hairline bg-ink-card p-5"><div className="flex justify-between gap-3"><div><span className="text-[10px] text-brand">{candidate.status} · {candidate.suggestedCategory}</span><h3 className="mt-1 text-sm font-semibold">{candidate.name}</h3><p className="mt-1 text-xs text-sub">{candidate.purpose}</p></div><strong className="text-lg text-brand">{candidate.usageCount} Missions</strong></div><details className="mt-3 text-xs text-sub"><summary className="cursor-pointer">詳細</summary><div className="mt-3 space-y-2"><p>Reason: {candidate.reason}</p><p>Source Missions: {candidate.sourceMissionIds.join(", ")}</p><p>Knowledge: {candidate.sourceKnowledgeIds.join(", ")}</p><p>Steps: {candidate.repeatedSteps.join(", ")}</p><p>Suggested Agents: {candidate.suggestedAgents.join(", ")}</p><p>Input: {candidate.inputDescription}</p><p>Output: {candidate.outputDescription}</p><p>Existing Similar Skills: {candidate.existingSimilarSkillIds.join(", ") || "なし"}</p></div></details>{candidate.status === "PROPOSED" ? <div className="mt-4 grid grid-cols-3 gap-2"><button onClick={()=>void decide(candidate,"REJECTED")} className="min-h-11 rounded-xl border border-loss/40 text-xs">却下</button><button onClick={()=>void decide(candidate,"HOLD")} className="min-h-11 rounded-xl border border-hairline text-xs">保留</button><button onClick={()=>void decide(candidate,"APPROVED")} className="min-h-11 rounded-xl bg-brand px-2 text-xs font-semibold text-black">Skill化を承認</button></div> : <p className="mt-3 text-[10px] text-sub">この判断からCode生成・Issue作成・Registry変更は行われません。</p>}</li>)}</ul>}</section>

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
