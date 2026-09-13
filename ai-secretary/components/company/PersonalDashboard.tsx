"use client";

/**
 * Personal AI Company ダッシュボード — Phase 4 §30
 *
 * 表示の原則: 「0円」と「未設定」を混同しない。
 * 未設定を0と表示すると、まだ測っていないだけのものが
 * 「実績ゼロ」として読まれ、判断を誤らせる。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Metric } from "@/app/lib/company/personalMetrics";
import { Skeleton } from "@/components/ui/primitives";

type Dashboard = {
  company: { name: string; mission: string };
  level: { label: string; description: string; progressToNext: number | null };
  primaryGoal: { title: string; currentYen: number | null; targetYen: number };
  metrics: {
    financial: Record<string, Metric>;
    freedom: Record<string, Metric>;
    productivity: Record<string, Metric>;
    organization: Record<string, Metric>;
  };
  fire: { status: string; progress: Metric };
  companyHealth: { score: number; coveragePct: number; status: string; risks: string[] };
  today: { tasks: { total: number; success: number; failure: number }; ceoInterventions: number };
  mission: { title: string; description: string; status: string };
  proposals: { visible: number; byType: Record<string, number> };
  achievements: { id: string; title: string; unlocked: boolean; progress?: number; target?: number }[];
  error?: string;
};

/** 未設定は「—」ではなく明示的に「未設定」と出す */
function yen(metric: Metric | undefined): string {
  if (!metric) return "未設定";
  if (metric.availability !== "AVAILABLE" || metric.value === null) return "未設定";
  return `¥${Math.round(metric.value).toLocaleString("ja-JP")}`;
}

function percent(metric: Metric | undefined, scale = 1): string {
  if (!metric || metric.availability !== "AVAILABLE" || metric.value === null) return "未設定";
  return `${Math.round(metric.value * scale * 10) / 10}%`;
}

const HEALTH_STYLE: Record<string, string> = {
  HEALTHY: "border-gain/30 bg-gain/10 text-gain",
  WATCH: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  AT_RISK: "border-loss/30 bg-loss/10 text-loss",
};

export function PersonalDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/company/dashboard")
      .then((r) => r.json())
      .then((json: Dashboard) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("ダッシュボードの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error || !data) {
    return (
      <section className="rounded-2xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">
        {error || "データを取得できませんでした"}
      </section>
    );
  }

  const goal = data.primaryGoal;
  const first = data.achievements.find((a) => a.id === "first-revenue");

  return (
    <div className="space-y-4">
      {/* ─── ヘッダー ─── */}
      <header className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">
              PERSONAL AI COMPANY
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">{data.company.name}</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-sub">
              {data.company.mission}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-sm font-bold text-brand">
              {data.level.label}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                HEALTH_STYLE[data.companyHealth.status] ?? HEALTH_STYLE.WATCH
              }`}
            >
              Health {data.companyHealth.score}
            </span>
            <span className="text-[10px] text-sub">
              データ充足 {data.companyHealth.coveragePct}%
            </span>
          </div>
        </div>

        {data.companyHealth.risks.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.companyHealth.risks.map((risk) => (
              <li key={risk} className="rounded-lg bg-loss/10 px-3 py-2 text-[11px] text-loss">
                {risk}
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* ─── 最重要目標 ─── */}
      <section className="rounded-2xl border border-brand/25 bg-brand/[0.06] p-5">
        <p className="text-xs text-sub">いまの目標</p>
        <p className="mt-1 text-lg font-bold text-white">{goal.title}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-brand">
          {goal.currentYen === null ? "未計測" : `¥${goal.currentYen.toLocaleString("ja-JP")}`}
          <span className="ml-1 text-sm font-normal text-sub">
            / ¥{goal.targetYen.toLocaleString("ja-JP")}
          </span>
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-sub">{data.mission.description}</p>
        {first?.unlocked && (
          <p className="mt-2 inline-block rounded-full border border-gain/30 bg-gain/10 px-2.5 py-0.5 text-[11px] font-medium text-gain">
            達成済み
          </p>
        )}
      </section>

      {/* ─── お金の指標 ─── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="AI経由の収益" value={yen(data.metrics.financial.aiGeneratedRevenueYen)} />
        <Stat label="月間収入" value={yen(data.metrics.financial.monthlyIncomeYen)} />
        <Stat label="純資産" value={yen(data.metrics.financial.netWorthYen)} />
        <Stat label="投資資産" value={yen(data.metrics.financial.investmentAssetsYen)} />
        <Stat label="貯蓄率" value={percent(data.metrics.financial.savingsRate, 100)} />
        <Stat label="不労所得" value={yen(data.metrics.financial.passiveIncomeYen)} />
        <Stat
          label="FIRE進捗"
          value={
            data.fire.status === "NOT_CONFIGURED"
              ? "未設定"
              : percent(data.fire.progress, 100)
          }
        />
        <Stat label="自動化率" value={percent(data.metrics.productivity.automationRate)} />
      </section>

      {/* ─── 今日 / 提案 ─── */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-ink-card p-5">
          <p className="text-sm font-semibold text-white">今日のタスク</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            {data.today.tasks.success}
            <span className="text-sm font-normal text-sub"> / {data.today.tasks.total}</span>
          </p>
          <p className="mt-1 text-[11px] text-sub">
            失敗 {data.today.tasks.failure}件・CEOの手直し {data.today.ceoInterventions}件
          </p>
        </div>

        <div className="rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-white">組織の提案</p>
            <Link href="/company/organization" className="text-[11px] text-brand hover:underline">
              詳しく見る
            </Link>
          </div>
          {data.proposals.visible === 0 ? (
            <p className="mt-2 text-[11px] text-sub">
              いまCEOへ上げる提案はありません。データが溜まると出始めます。
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-[11px] text-sub">
              {Object.entries(data.proposals.byType).map(([type, count]) => (
                <li key={type}>
                  {type}: {count}件
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const unset = value === "未設定" || value === "未計測";
  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-4">
      <p className="text-[11px] text-sub">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          unset ? "text-sub" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
