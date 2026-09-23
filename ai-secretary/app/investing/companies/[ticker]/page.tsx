"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { InvestingShell } from "@/components/investing/Shell";
import { Badge, Card, CardHeader, Skeleton } from "@/components/investing/ui";
import type { WatchTheme } from "@/app/lib/investing/watchlist";
import { formatJpy, formatPct } from "@/app/lib/investing/types";
import { latestRecommendations, useJson, usePortfolio, type FundRecommendationView } from "../../usePortfolio";

const HORIZONS = [["short", "Short"], ["medium", "Medium"], ["long", "Long"]] as const;
type Horizon = (typeof HORIZONS)[number][0];

function Block({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} hint={`Source: ${source}`} />
      <div className="text-sm leading-relaxed text-slate-200">{children}</div>
    </Card>
  );
}

function Unknown({ reason }: { reason: string }) {
  return <p className="text-sub">未取得 <span className="block text-[11px]">{reason}</span></p>;
}

function Bullets({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1 pl-5">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

const SKILL_MISSING = "Investment Skill（company-analysis / valuation-analysis 等）が未登録のため出力がありません。AIで補完していません。";

/**
 * 会社分析の canonical route。Investment Skillsの出力先。
 * Skill出力が無い項目はAIで生成せず「未取得」。売買ボタンは置かない。
 */
export default function CompanyDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker ?? "").toUpperCase();
  const [horizon, setHorizon] = useState<Horizon>("medium");
  const portfolio = usePortfolio();
  const watchlist = useJson<{ themes: WatchTheme[] }>("/api/investing/watchlist");
  const recommendations = useJson<{ recommendations: FundRecommendationView[] }>("/api/fund/recommendations");

  const position = portfolio.data?.positions.find((item) => item.code.toUpperCase() === ticker) ?? null;
  const watched = watchlist.data?.themes.flatMap((theme) => theme.items.map((item) => ({ ...item, theme: theme.theme }))).find((item) => item.ticker.toUpperCase() === ticker) ?? null;
  const recs = latestRecommendations(recommendations.data?.recommendations).filter((item) => item.ticker.toUpperCase() === ticker);
  const rec = recs.find((item) => item.horizon === horizon) ?? null;
  const name = position?.name ?? watched?.name ?? ticker;
  const loading = portfolio.loading || recommendations.loading;
  const unknowns = [
    ...(rec?.missingData ?? []),
    "Financials", "Earnings", "Valuation",
    ...(position?.thesis ? [] : ["Investment Thesis"]),
  ];

  return (
    <InvestingShell title={name}>
      <Link href="/investing/companies" className="mb-3 inline-flex min-h-11 items-center gap-1 text-xs text-sub hover:text-white"><ChevronLeft className="h-4 w-4" />Companies</Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold text-white">{name}</h2>
        <Badge>{ticker}</Badge>
        {position ? <Badge tone="brand">保有</Badge> : null}
        {watched ? <Badge>{watched.theme}</Badge> : null}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist" aria-label="投資期間">
        {HORIZONS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={horizon === id} onClick={() => setHorizon(id)} className={`min-h-11 rounded-xl text-sm ${horizon === id ? "bg-brand font-semibold text-white" : "bg-white/[0.04] text-sub"}`}>{label}</button>)}
      </div>

      {loading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Block title="Investment Thesis" source="positions.md（本人の投資メモ）">
            {position?.thesis ? <><p className="whitespace-pre-wrap">{position.thesis}</p>{position.conviction ? <p className="mt-2 text-xs text-sub">確信度: {position.conviction}</p> : null}</> : <Unknown reason="この銘柄の投資仮説は記録されていません" />}
          </Block>

          <Block title="Company Analysis" source={rec ? `Policy Engine v${rec.policyVersion} · ${rec.evaluatedAt.slice(0, 10)}` : "Policy Engine"}>
            {rec ? (
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="text-[11px] text-sub">判定</dt><dd className="font-semibold">{rec.decision}</dd></div>
                <div><dt className="text-[11px] text-sub">Score / Confidence</dt><dd>{rec.score} / {rec.confidence}</dd></div>
                <div><dt className="text-[11px] text-sub">Data as of</dt><dd>{rec.dataAsOf === "unknown" ? "未取得" : rec.dataAsOf.slice(0, 10)}</dd></div>
                <div><dt className="text-[11px] text-sub">Next Review</dt><dd>{rec.nextReviewAt ? rec.nextReviewAt.slice(0, 10) : "未取得"}</dd></div>
              </dl>
            ) : <Unknown reason={`${horizon}期間のPolicy Engine評価がありません`} />}
            <p className="mt-2 text-[11px] text-sub">判定は分析上のラベルです。証券注文には接続されていません。</p>
          </Block>

          <Block title="Financials" source="Investment Skill"><Unknown reason={SKILL_MISSING} /></Block>
          <Block title="Earnings" source="Investment Skill"><Unknown reason={SKILL_MISSING} /></Block>
          <Block title="Valuation" source="Investment Skill"><Unknown reason={SKILL_MISSING} /></Block>

          <Block title="Risk" source="positions.md / Policy Engine">
            {position?.risk || rec?.invalidation || rec?.warnings.length || rec?.counterarguments.length ? (
              <div className="space-y-2">
                {position?.risk ? <p><span className="text-xs text-sub">本人メモ: </span>{position.risk}</p> : null}
                {rec?.invalidation ? <p><span className="text-xs text-sub">Thesis Break条件: </span>{rec.invalidation}</p> : null}
                {rec?.warnings.length ? <Bullets items={rec.warnings} /> : null}
                {rec?.counterarguments.length ? <><p className="text-xs text-sub">反論（AI提案・未確認）</p><Bullets items={rec.counterarguments} /></> : null}
              </div>
            ) : <Unknown reason="Risk情報は記録されていません" />}
          </Block>

          <Block title="Evidence" source={rec ? "Policy Engine reasons" : "—"}>
            {rec?.reasons.length ? <Bullets items={rec.reasons} /> : <Unknown reason="根拠の記録がありません" />}
          </Block>

          <Block title="Unknowns" source="未取得項目の一覧">
            <Bullets items={[...new Set(unknowns)]} />
          </Block>
        </div>
      )}

      {position ? (
        <Card className="mt-4">
          <CardHeader title="保有状況" hint="Portfolio" />
          <p className="text-sm text-slate-200">評価額 {formatJpy(position.marketValueJpy)} · 含み損益 {formatJpy(position.pnlJpy, { sign: true })}（{formatPct(position.pnlPct, { sign: true })}）</p>
        </Card>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/investing/policy" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-xs font-semibold text-white">分析を実行（投資判断エンジン）</Link>
        {position ? <Link href={`/investing/holdings/${encodeURIComponent(position.code)}`} className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-4 text-xs text-sub hover:text-white">既存の銘柄詳細を開く</Link> : null}
      </div>
    </InvestingShell>
  );
}
