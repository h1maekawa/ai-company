"use client";

import Link from "next/link";
import type { DepartmentMetric, DepartmentReadModel } from "@/app/lib/mobile-ceo/departments";
import { displayStatus, formatMetricValue, type AttentionCard } from "@/app/lib/mobile-ceo/controlCenter";
import { DepartmentAttention, useDepartmentControl } from "./DepartmentAttention";
import { DepartmentKpiPanel } from "./DepartmentKpiPanel";
import { DepartmentResearchSummary, type DepartmentResearchPayload } from "./DepartmentResearchSummary";
import { EmployeeWorkspace } from "./EmployeeWorkspace";
import { Section } from "./MobilePrimitives";

/** Investment Departmentの5領域。詳細作業は /investing/* で行う。 */
export const INVESTMENT_MENU = [
  { href: "/investing", label: "Overview", description: "資産・配分・ニュースの全体像" },
  { href: "/investing/research", label: "Research", description: "テーマ・Value Chain・候補企業" },
  { href: "/investing/companies", label: "Companies", description: "保有・監視・候補の企業分析" },
  { href: "/investing/portfolio", label: "Portfolio", description: "保有・損益・資産配分" },
  { href: "/investing/learning", label: "Learning", description: "学び・改善提案・投資原則" },
] as const;

function PortfolioSummary({ value, pl }: { value?: DepartmentMetric; pl?: DepartmentMetric }) {
  const cells: Array<[string, DepartmentMetric | undefined, boolean]> = [["Portfolio", value, false], ["Unrealized P/L", pl, true]];
  return (
    <Section title="現在資産">
      <dl className="grid grid-cols-2 gap-3">
        {cells.map(([label, metric, sign]) => (
          <div key={label} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="mt-1 break-words text-xl font-bold">{formatMetricValue(metric, { sign })}</dd>
            <dd className="mt-1 text-[10px] text-slate-500">{metric ? `${displayStatus(metric.availability)} · ${metric.source}` : "未取得"}</dd>
            {metric?.asOf ? <dd className="text-[10px] text-slate-600">as of {metric.asOf.slice(0, 16).replace("T", " ")}</dd> : null}
          </div>
        ))}
      </dl>
    </Section>
  );
}

/**
 * 株式 / Investment Department の Control Center。
 * 投資アプリそのものではなく、CEOが状態を確認し判断する場所。売買ボタンは置かない。
 */
export function FundDepartmentControl({ model, research }: { model: DepartmentReadModel; research: DepartmentResearchPayload | null }) {
  const { data: control, reload } = useDepartmentControl("fund");
  const metrics = [model.northStar, ...model.outcomes, ...model.operations];
  const find = (key: string) => metrics.find((metric) => metric.metric === key);
  const decisionRequired = find("decision_required")?.value ?? 0;
  const thesisAlerts = find("thesis_alerts")?.value ?? 0;
  const cards: AttentionCard[] = [
    ...(decisionRequired > 0 ? [{ id: "fund-decision-required", type: "ACTION_REQUIRED" as const, title: `人間判断待ちRecommendation ${decisionRequired}件`, href: "/investing/policy" }] : []),
    ...(thesisAlerts > 0 ? [{ id: "fund-thesis-alerts", type: "ACTION_REQUIRED" as const, title: `Thesis Alert ${thesisAlerts}件（WEAKENED / INVALIDATED）`, href: "/investing/learning" }] : []),
    ...model.problems.map((problem, index) => ({ id: `fund-problem-${index}`, type: "WARNING" as const, title: problem, href: "/investing/policy" })),
  ];
  const rows = [["portfolio_value", "Portfolio Value"], ["unrealized_pl", "Unrealized P/L"], ["realized_pl", "Realized P/L"], ["thesis_alerts", "Thesis Alerts"], ["decision_required", "判断待ち"]].map(([metric, label]) => ({ metric, label, actual: find(metric) ?? null }));
  return (
    <>
      <PortfolioSummary value={find("portfolio_value")} pl={find("unrealized_pl")} />
      <Section title="Investmentメニュー">
        <nav aria-label="Investmentの主要画面" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INVESTMENT_MENU.map((item) => (
            <Link key={item.href} href={item.href} className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 p-3 hover:border-violet-500">
              <span className="block text-sm font-semibold text-violet-300">{item.label}</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{item.description}</span>
            </Link>
          ))}
          <Link href="/investing/settings" className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-700 p-3 text-xs text-slate-400">⚙ 投資設定</Link>
        </nav>
      </Section>
      <DepartmentAttention id="fund" cards={cards} control={control} onChanged={() => void reload()} />
      <EmployeeWorkspace departmentId="fund" />
      <DepartmentKpiPanel id="fund" rows={rows} goals={control ? control.kpiGoals : null} onChanged={() => void reload()} />
      <DepartmentResearchSummary research={research} href="/investing/research" />
    </>
  );
}
