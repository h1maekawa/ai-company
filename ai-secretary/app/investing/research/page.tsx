"use client";

import Link from "next/link";
import { Microscope } from "lucide-react";
import { InvestingShell } from "@/components/investing/Shell";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";
import type { EmployeeReadModel } from "@/components/mobile-ceo/EmployeeWorkspace";
import type { WatchTheme } from "@/app/lib/investing/watchlist";
import { displayStatus, formatRelativeTime } from "@/app/lib/mobile-ceo/controlCenter";
import { latestRecommendations, useJson, type FundRecommendationView } from "../usePortfolio";

type ResearchItem = { id: string; topic: string; title: string; summary: string; sourceName?: string; sourceUrl?: string; fetchedAt: string; freshnessStatus: string; reliability: string };
type ResearchResponse = { items: ResearchItem[] | null; health: Array<{ status: string; lastSuccessfulRun: string | null }> | null };
const STATUS: Record<string, string> = { IDLE: "待機中", THINKING: "作業中", RESEARCHING: "調査中", EXECUTING: "作業中", REVIEWING: "レビュー中", WAITING_APPROVAL: "CEO確認待ち", COMPLETE: "完了", ERROR: "問題あり" };

function Unknown({ reason }: { reason: string }) {
  return <p className="text-sm text-sub">未取得 <span className="block text-[11px]">{reason}</span></p>;
}

/**
 * Investment Researcher の Workspace。
 * 何が伸びる → 何が足りなくなる → ボトルネック → 恩恵を受ける企業、の順に見せる。
 * 実データが無いものは hardcode せず「未取得」と表示する。
 */
export default function InvestmentResearchPage() {
  const employees = useJson<{ employees: Array<EmployeeReadModel & { research?: { lastRun: string; freshItems: number; health: string } }> }>("/api/company/departments/fund/employees");
  const research = useJson<ResearchResponse>("/api/company/research?departmentId=fund");
  const policy = useJson<{ policy: { themes: Record<string, string[]>; policyVersion: number } }>("/api/fund/policy");
  const watchlist = useJson<{ themes: WatchTheme[]; updatedAt: string | null }>("/api/investing/watchlist");
  const recommendations = useJson<{ recommendations: FundRecommendationView[] }>("/api/fund/recommendations");

  const researcher = employees.data?.employees.find((employee) => employee.id === "fund-research");
  const candidates = latestRecommendations(recommendations.data?.recommendations).slice(0, 12);
  const items = (research.data?.items ?? []).slice().reverse();
  const policyThemes = Object.entries(policy.data?.policy.themes ?? {});

  return (
    <InvestingShell title="Research">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Researcher Status" hint="Investment Researcher（fund-research）" />
          {employees.loading ? <Skeleton className="h-16" /> : !researcher ? <Unknown reason="AI社員の状態を取得できませんでした" /> : (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] text-sub">状態</dt><dd className="mt-1 font-semibold">{STATUS[researcher.status] ?? displayStatus(researcher.status)}</dd></div>
              <div><dt className="text-[11px] text-sub">現在のMission</dt><dd className="mt-1 truncate">{researcher.currentMissionTitle ?? "なし"}</dd></div>
              <div><dt className="text-[11px] text-sub">最終Research</dt><dd className="mt-1">{formatRelativeTime(research.data?.health?.[0]?.lastSuccessfulRun)}</dd></div>
              <div><dt className="text-[11px] text-sub">Research Health</dt><dd className="mt-1">{displayStatus(research.data?.health?.[0]?.status)}</dd></div>
            </dl>
          )}
          <p className="mt-3 text-[11px] text-sub">Researcherは調査専用です。売買・証券注文・資金移動は行いません。</p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Themes" hint="何が伸びる？" />
            {policy.loading || watchlist.loading ? <Skeleton className="h-24" /> : policyThemes.length === 0 && !watchlist.data?.themes.length ? <Unknown reason="Policyのテーマ定義・ウォッチリストがありません" /> : (
              <ul className="space-y-3 text-sm">
                {policyThemes.map(([theme, tickers]) => (
                  <li key={`policy-${theme}`}>
                    <span className="font-medium text-white">{theme}</span>
                    <span className="ml-2 text-[11px] text-sub">Source: Fund Policy v{policy.data?.policy.policyVersion}</span>
                    <span className="mt-1 flex flex-wrap gap-1">{tickers.map((ticker) => <Link key={ticker} href={`/investing/companies/${encodeURIComponent(ticker)}`}><Badge>{ticker}</Badge></Link>)}</span>
                  </li>
                ))}
                {(watchlist.data?.themes ?? []).map((theme) => (
                  <li key={`watch-${theme.theme}`}>
                    <span className="font-medium text-white">{theme.theme}</span>
                    <span className="ml-2 text-[11px] text-sub">Source: watchlist.md{watchlist.data?.updatedAt ? ` · ${watchlist.data.updatedAt}` : ""}</span>
                    <span className="mt-1 flex flex-wrap gap-1">{theme.items.map((item) => <Link key={item.ticker} href={`/investing/companies/${encodeURIComponent(item.ticker)}`}><Badge>{item.ticker}</Badge></Link>)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Value Chain / Bottlenecks" hint="何が足りなくなる？ ボトルネックは？" />
            <Unknown reason="Value Chain分析のInvestment Skillが未登録のため、構造化データがありません。推測で埋めずに未取得としています。" />
          </Card>
        </div>

        <Card padded={false}>
          <div className="px-5 pt-5"><CardHeader title="Candidate Companies" hint="Policy Engineの評価結果（最新・期間別）" /></div>
          {recommendations.loading ? <div className="px-5 pb-5"><Skeleton className="h-24" /></div> : candidates.length === 0 ? <div className="px-5 pb-5"><Unknown reason="Policy Engineの評価記録がありません" /></div> : (
            <ul className="divide-y divide-hairline/60">
              {candidates.map((item) => (
                <li key={item.id}>
                  <Link href={`/investing/companies/${encodeURIComponent(item.ticker)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-white/[0.03]">
                    <Badge>{item.ticker}</Badge>
                    <span className="text-xs text-sub">{item.horizon}</span>
                    <span className="text-sm text-white">{item.decision}</span>
                    <span className="text-xs text-sub">Score {item.score} · Confidence {item.confidence}</span>
                    <span className="ml-auto text-[11px] text-sub">Data as of {item.dataAsOf === "unknown" ? "未取得" : item.dataAsOf.slice(0, 10)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="px-5 pt-5"><CardHeader title="Latest Research" hint="Source / Fetched At / Freshness / Confidence" /></div>
          {research.loading ? <div className="px-5 pb-5"><Skeleton className="h-24" /></div> : research.data === null ? <div className="px-5 pb-5"><Unknown reason="Research Storeに接続できませんでした" /></div> : items.length === 0 ? (
            <EmptyState icon={<Microscope className="h-7 w-7" />} title="Researchはまだありません" description="Investment Researchが取得した実データのみを表示します。" />
          ) : (
            <ul className="divide-y divide-hairline/60">
              {items.slice(0, 30).map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <details>
                    <summary className="cursor-pointer text-sm text-white">{item.topic}：{item.title}</summary>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.summary}</p>
                  </details>
                  <p className="mt-1 text-[11px] text-sub">
                    Source: {item.sourceUrl && /^https?:\/\//.test(item.sourceUrl) ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand">{item.sourceName ?? "link"}</a> : item.sourceName ?? "未取得"}
                    {" · "}Fetched {formatRelativeTime(item.fetchedAt)} · {item.freshnessStatus} · Confidence {item.reliability}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </InvestingShell>
  );
}
