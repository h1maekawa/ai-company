"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

/**
 * /company/organization — 組織の提案を閲覧する（Phase 4 §35）
 *
 * Phase 4 では閲覧まで。承認・自動実装は行わない。
 */
export default function OrganizationPage() {
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);

  useEffect(() => {
    fetch("/api/company/proposals")
      .then((r) => r.json())
      .then((json: { visible?: ProposalView[] }) => setProposals(json.visible ?? []))
      .catch(() => setProposals([]));
  }, []);

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-3 py-6 sm:px-6">
      <header>
        <Link href="/company" className="text-[11px] text-sub hover:text-white">
          ← ダッシュボードへ
        </Link>
        <h1 className="mt-2 text-lg font-bold text-white">組織の提案</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-sub">
          日々の記録から見つかった組織変更の候補です。
          Phase 4 時点では閲覧のみで、自動実装は行いません。
        </p>
      </header>

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
