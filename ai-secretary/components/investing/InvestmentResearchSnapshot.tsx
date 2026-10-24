"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";
import type { IntelligenceToday, InvestmentEvidence } from "@/app/lib/investing/intelligence/types";
import type { InvestmentResearchArtifact } from "@/app/lib/investing/intelligence/research/types";

type SnapshotResponse = {
  today: IntelligenceToday | null;
  store?: {
    status: "AVAILABLE" | "NOT_FOUND" | "UNAVAILABLE";
    storage: string;
    path: string;
    lastSuccessfulAt: string | null;
    ageSeconds: number | null;
    freshness: "FRESH" | "STALE" | "UNKNOWN";
    reason?: string;
  };
};

function fmt(value: string | null | undefined) {
  if (!value) return "未取得";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未取得" : date.toLocaleString("ja-JP");
}

function EvidenceLine({ refs, evidence }: { refs: readonly string[]; evidence: Map<string, InvestmentEvidence> }) {
  if (!refs.length) return <p className="mt-2 text-xs text-sub">根拠: 未取得</p>;
  return <ul className="mt-2 space-y-1 text-xs text-sub">
    {refs.map((ref) => {
      const item = evidence.get(ref);
      return <li key={ref}>
        根拠: {item?.sourceUrl && /^https?:\/\//.test(item.sourceUrl)
          ? <a className="text-brand" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName}</a>
          : item?.sourceName ?? ref}
        {` · 取得 ${fmt(item?.fetchedAt)} · 鮮度 ${item?.freshness ?? "未確認"}`}
        {item?.fact ? ` · ${item.fact}` : ""}
      </li>;
    })}
  </ul>;
}

function ArtifactCard({ artifact, evidence }: { artifact: InvestmentResearchArtifact; evidence: Map<string, InvestmentEvidence> }) {
  const claims = [
    ...artifact.facts.map((item) => ["事実", item.statement, item.evidenceIds] as const),
    ...artifact.interpretations.map((item) => ["解釈", item.statement, item.evidenceIds] as const),
    ...artifact.hypotheses.map((item) => ["仮説", item.statement, [...item.confirmingEvidenceIds, ...item.contraryEvidenceIds]] as const),
    ...artifact.unknowns.map((item) => ["未確認", item.statement, []] as const),
  ];
  return <article className="border-t border-hairline/60 px-5 py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-white">{artifact.subject}</h3>
      <span className="text-[11px] text-sub">{artifact.subjectType} · 信頼度 {artifact.confidence ?? "未評価"} · 生成 {fmt(artifact.generatedAt)}</span>
    </div>
    {claims.length ? <ul className="mt-3 space-y-3">{claims.map(([kind, statement, refs], index) => <li key={`${artifact.id}-${index}`}>
      <p className="text-xs leading-relaxed"><span className="mr-2 text-sub">{kind}</span>{statement}</p>
      <EvidenceLine refs={refs} evidence={evidence} />
    </li>)}</ul> : <p className="mt-2 text-xs text-sub">構造化された根拠はありません。</p>}
  </article>;
}

export function InvestmentResearchSnapshot() {
  const [response, setResponse] = useState<SnapshotResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/investing/intelligence/today", { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("READ_FAILED"); return res.json() as Promise<SnapshotResponse>; })
      .then((value) => { if (active) { setResponse(value); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const loading = !response && !failed;
  const today = response?.today;
  const store = response?.store;
  const evidence = new Map<string, InvestmentEvidence>([
    ...(today?.marketEvidence ?? []), ...(today?.news ?? []),
  ].map((item) => [item.id, item]));
  const artifacts = today?.research?.artifacts ?? [];

  return <Card padded={false}>
    <div className="px-5 pt-5"><CardHeader title="保存済み Investment Research" hint="IntelligenceToday.research · 読み取り専用" /></div>
    {loading ? <div className="px-5 pb-5"><Skeleton className="h-24" /></div> : failed || store?.status === "UNAVAILABLE" ? (
      <div className="px-5 pb-5"><p className="text-sm text-amber-300">保存データを読み込めませんでした。</p><p className="mt-1 text-xs text-sub">空データとして扱わず、Vaultの読取状態を確認してください。{store?.reason ? ` (${store.reason})` : ""}</p></div>
    ) : store?.status === "NOT_FOUND" ? (
      <div className="px-5 pb-5"><EmptyState title="保存データがありません" description={`${store.storage}: ${store.path}`} /></div>
    ) : !today ? (
      <div className="px-5 pb-5"><p className="text-sm text-sub">保存状態を確認できませんでした。</p></div>
    ) : !today.research ? (
      <div className="px-5 pb-5"><p className="text-sm text-sub">IntelligenceTodayは保存済みですが、Research結果はありません（未生成または旧形式のデータです）。</p><p className="mt-1 text-xs text-sub">最終成功 {fmt(store?.lastSuccessfulAt)} · {store?.storage} · 鮮度 {store?.freshness}</p></div>
    ) : (
      <>
        <div className="px-5 pb-3 text-xs text-sub">保存先 {store?.storage} · 最終成功 {fmt(store?.lastSuccessfulAt)} · データ鮮度 {store?.freshness} · Research生成 {fmt(today.research.generatedAt)}</div>
        {artifacts.length === 0 ? <div className="px-5 pb-5"><p className="text-sm text-sub">Research bundleはありますが、表示可能な根拠付きArtifactがありません。</p></div> : artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} evidence={evidence} />)}
      </>
    )}
  </Card>;
}
