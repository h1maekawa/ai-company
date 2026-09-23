"use client";

import Link from "next/link";
import type { DepartmentReadModel } from "@/app/lib/mobile-ceo/departments";
import { CREATOR_KPI_DEFINITIONS } from "@/app/lib/mobile-ceo/controlCenter";
import { DepartmentAttention, useDepartmentControl } from "./DepartmentAttention";
import { DepartmentKpiPanel } from "./DepartmentKpiPanel";
import { DepartmentResearchSummary, type DepartmentResearchPayload } from "./DepartmentResearchSummary";
import { EmployeeWorkspace } from "./EmployeeWorkspace";
import { Section } from "./MobilePrimitives";

const CREATOR_OPERATION_LINKS = [
  {
    href: "/note",
    label: "コンテンツスタジオ",
    description: "今日の状況、投稿作成、確認、成果を見る",
  },
  {
    href: "/note?view=review",
    label: "投稿を確認",
    description: "X・noteの下書きを確認・修正・予約する",
  },
  {
    href: "/content",
    label: "詳細分析",
    description: "自動運用、投稿実績、Revenue、学びを見る",
  },
  {
    href: "/note/settings",
    label: "運用設定",
    description: "AUTOPILOT / REVIEW、Buffer、Research、ブランドを設定",
  },
] as const;

export function CreatorQuickNavigation() {
  return (
    <Section title="Creatorメニュー">
      <nav aria-label="Creatorの主要画面" className="grid gap-3 sm:grid-cols-2">
        {CREATOR_OPERATION_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-violet-500 hover:bg-slate-800"
          >
            <span className="block text-sm font-semibold text-violet-300">{item.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">{item.description}</span>
          </Link>
        ))}
      </nav>
    </Section>
  );
}

/**
 * Creator Control Center。優先順位は CEO確認 → AI社員 → KPI → Research Summary。
 * Research本文・事業機会・Chat・Directiveは呼び出し側の「その他」に置く。
 */
export function CreatorDepartmentControl({ model, research }: { model: DepartmentReadModel; research: DepartmentResearchPayload | null }) {
  const { data: control, reload } = useDepartmentControl("creator");
  const metrics = [model.northStar, ...model.outcomes, ...model.operations];
  const rows = CREATOR_KPI_DEFINITIONS.map((definition) => ({ metric: definition.metric, label: definition.label, actual: definition.sourceMetric ? metrics.find((metric) => metric.metric === definition.sourceMetric) ?? null : null }));
  return (
    <>
      <CreatorQuickNavigation />
      <DepartmentAttention id="creator" cards={model.attention ?? []} control={control} onChanged={() => void reload()} />
      <EmployeeWorkspace departmentId="creator" />
      <DepartmentKpiPanel id="creator" rows={rows} goals={control ? control.kpiGoals : null} onChanged={() => void reload()} />
      <DepartmentResearchSummary research={research} href="/content/research" />
    </>
  );
}
