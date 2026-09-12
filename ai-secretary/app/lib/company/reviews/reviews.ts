/**
 * Daily / Weekly / Monthly Review — Phase 4 §22〜§25
 *
 * §22 の要点: Business Logic と Scheduler を分離する。
 * この3関数がロジック本体で、cron / GitHub Action / 手動 の
 * どこから呼ばれても同じ結果になる。Schedulerは薄いAdapterに徹する。
 */

import { loadCompanyEvents } from "../eventStore";
import { computeMetrics } from "../metrics";
import { buildOrganizationSnapshot } from "../organization";
import { analyzePatterns } from "../evolution/patternAnalyzer";
import { analyzeBottlenecks } from "../evolution/bottleneckAnalyzer";
import { loadProposals } from "../evolution/store";
import { computeCompanyHealth, computeDepartmentHealth, type CompanyHealth, type DepartmentHealth, type SecurityIssue } from "../health";
import { computeFireProgress, isAvailable, type FireResult, type PersonalCompanyMetrics } from "../personalMetrics";
import { computeRevenueLevel, PERSONAL_COMPANY, type LevelResult } from "../personalCompany";
import { evaluateAchievements, type Achievement } from "../achievements";
import { firstRevenueMission, type PersonalMission } from "../missions";
import { collectPersonalMetrics } from "./metricsSource";
import type { RevenueAttribution } from "../revenue";

export type ReviewOptions = {
  revenue?: RevenueAttribution[];
  /** FIRE計算の設定。未設定なら NOT_CONFIGURED になる */
  fire?: { annualLivingCostYen?: number; targetAssetYen?: number; annualPassiveIncomeYen?: number };
  securityIssues?: SecurityIssue[];
  unlockedAchievements?: Achievement[];
  now?: Date;
};

export type ReviewBase = {
  period: "daily" | "weekly" | "monthly";
  date: string;
  metrics: PersonalCompanyMetrics;
  companyHealth: CompanyHealth;
  fire: FireResult;
  level: LevelResult;
  achievements: Achievement[];
  generatedAt: string;
};

function tokyoDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 3つのレビューで共通する土台を作る */
async function buildBase(
  period: ReviewBase["period"],
  windowDays: number,
  options: ReviewOptions
): Promise<ReviewBase> {
  const now = options.now ?? new Date();
  const metrics = await collectPersonalMetrics({ revenue: options.revenue, windowDays, now });

  const fire = computeFireProgress({
    annualLivingCostYen: options.fire?.annualLivingCostYen ?? null,
    targetAssetYen: options.fire?.targetAssetYen ?? null,
    currentNetWorthYen: isAvailable(metrics.financial.netWorthYen)
      ? metrics.financial.netWorthYen.value
      : null,
    annualPassiveIncomeYen: options.fire?.annualPassiveIncomeYen ?? null,
  });
  metrics.freedom.fireProgress = fire.progress;
  metrics.freedom.passiveIncomeCoverageRate = fire.passiveCoverageRate;

  const aiRevenue = isAvailable(metrics.financial.aiGeneratedRevenueYen)
    ? metrics.financial.aiGeneratedRevenueYen.value
    : null;

  return {
    period,
    date: tokyoDate(now),
    metrics,
    companyHealth: computeCompanyHealth({
      metrics,
      securityIssues: options.securityIssues,
      now,
    }),
    fire,
    level: computeRevenueLevel({
      monthlyAiRevenueYen: aiRevenue,
      livingCostCoverageRate: isAvailable(fire.passiveCoverageRate)
        ? fire.passiveCoverageRate.value
        : null,
    }),
    achievements: evaluateAchievements({
      aiGeneratedRevenueYen: aiRevenue,
      unlocked: options.unlockedAchievements,
      now,
    }),
    generatedAt: now.toISOString(),
  };
}

/* ─── Daily（§23） ──────────────────────────────── */

export type DailyReview = ReviewBase & {
  tasks: { total: number; success: number; failure: number };
  ceoInterventions: number;
  organizationStatus: "OK" | "INSUFFICIENT_DATA";
  newProposals: number;
  mission: PersonalMission;
  firstRevenueProgress: { currentYen: number | null; targetYen: number };
};

export async function runDailyPersonalCompanyReview(
  options: ReviewOptions = {}
): Promise<DailyReview> {
  const now = options.now ?? new Date();
  const base = await buildBase("daily", 1, options);

  const events = await loadCompanyEvents().catch(() => []);
  const daily = computeMetrics(events, 1, now);
  const analysis = analyzePatterns(events, { now });
  const proposals = await loadProposals().catch(() => []);

  const aiRevenue = isAvailable(base.metrics.financial.aiGeneratedRevenueYen)
    ? base.metrics.financial.aiGeneratedRevenueYen.value
    : null;

  return {
    ...base,
    tasks: { total: daily.totalEvents, success: daily.success, failure: daily.failure },
    ceoInterventions: Math.round((daily.ceoInterventionRate / 100) * daily.totalEvents),
    organizationStatus: analysis.status,
    newProposals: proposals.filter(
      (p) => p.status === "PROPOSED" || p.status === "HIGH_PRIORITY"
    ).length,
    mission: firstRevenueMission({ aiGeneratedRevenueYen: aiRevenue, now }),
    firstRevenueProgress: {
      currentYen: aiRevenue,
      targetYen: PERSONAL_COMPANY.firstRevenueTargetYen,
    },
  };
}

/* ─── Weekly（§24） ─────────────────────────────── */

export type WeeklyReview = ReviewBase & {
  departmentHealth: DepartmentHealth[];
  bottleneckFlags: { agentId: string; flags: string[] }[];
  workflowCandidates: number;
  proposals: number;
  nextPriority: string[];
};

export async function runWeeklyPersonalCompanyReview(
  options: ReviewOptions = {}
): Promise<WeeklyReview> {
  const now = options.now ?? new Date();
  const base = await buildBase("weekly", 7, options);

  const events = await loadCompanyEvents().catch(() => []);
  const organization = buildOrganizationSnapshot(now);
  const bottlenecks = analyzeBottlenecks(events, { organization, now });
  const analysis = analyzePatterns(events, { organization, now });
  const proposals = await loadProposals().catch(() => []);

  const departmentHealth = organization.departments.map((department) => {
    const members = new Set(
      organization.agents.filter((a) => a.departmentId === department.id).map((a) => a.id)
    );
    const loads = bottlenecks.agents.filter((a) => members.has(a.agentId));
    const avg = (pick: (l: (typeof loads)[number]) => number | null): number | null => {
      const values = loads.map(pick).filter((v): v is number => v !== null);
      return values.length > 0
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
        : null;
    };

    return computeDepartmentHealth({
      departmentId: department.id,
      name: department.name,
      taskSuccessRatePct: avg((l) => (l.failureRatePct === null ? null : 100 - l.failureRatePct)),
      failureRatePct: avg((l) => l.failureRatePct),
      averageLatencyMs: avg((l) => l.avgLatencyMs),
      humanCorrectionRatePct: avg((l) => l.correctionRatePct),
      costUsd: avg((l) => l.costUsd),
    });
  });

  const nextPriority: string[] = [];
  if (base.level.level === 0) nextPriority.push("最初の1円を作る導線を1つ通しきる");
  if (base.companyHealth.coveragePct < 50) {
    nextPriority.push("測れていない指標を減らす（収入・支出の記録を繋ぐ）");
  }
  if (bottlenecks.status === "OK" && bottlenecks.agents.some((a) => a.flags.length > 0)) {
    nextPriority.push("詰まっているAI社員の原因を1つ潰す");
  }

  return {
    ...base,
    departmentHealth,
    bottleneckFlags: bottlenecks.agents
      .filter((a) => a.flags.length > 0)
      .map((a) => ({ agentId: a.agentId, flags: a.flags })),
    workflowCandidates: analysis.patterns.filter((p) => p.type === "WORKFLOW_CANDIDATE").length,
    proposals: proposals.length,
    nextPriority,
  };
}

/* ─── Monthly（§25） ────────────────────────────── */

export type MonthlyReview = ReviewBase & {
  netWorthYen: number | null;
  savingsRate: number | null;
  investmentAssetsYen: number | null;
  /** 事業収益と投資損益を分けて出す（§15） */
  revenueBreakdown: {
    aiGeneratedYen: number | null;
    otherBusinessYen: number | null;
    investmentYen: number | null;
  };
  organizationProposals: number;
  strategyNotes: string[];
};

export async function runMonthlyPersonalCompanyReview(
  options: ReviewOptions = {}
): Promise<MonthlyReview> {
  const now = options.now ?? new Date();
  const base = await buildBase("monthly", 30, options);
  const proposals = await loadProposals().catch(() => []);

  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { summarizeRevenue } = await import("../revenue");
  const revenue = options.revenue ? summarizeRevenue(options.revenue, { since }) : null;

  const strategyNotes: string[] = [];
  if (base.fire.status === "NOT_CONFIGURED") {
    strategyNotes.push(
      `FIRE進捗が計算できません（未設定: ${base.fire.missing.join(" / ")}）`
    );
  }
  if (base.level.level === 0) {
    strategyNotes.push("収益レベルはLV0。まず1円を通すことが最優先");
  }
  if (base.companyHealth.status === "AT_RISK") {
    strategyNotes.push(`セキュリティ上の重大問題: ${base.companyHealth.risks.join(" / ")}`);
  }

  const value = (metric: { value: number | null }) => metric.value;

  return {
    ...base,
    netWorthYen: value(base.metrics.financial.netWorthYen),
    savingsRate: value(base.metrics.financial.savingsRate),
    investmentAssetsYen: value(base.metrics.financial.investmentAssetsYen),
    revenueBreakdown: {
      aiGeneratedYen: revenue?.aiGeneratedYen ?? null,
      otherBusinessYen: revenue?.otherBusinessYen ?? null,
      investmentYen: revenue?.investmentYen ?? null,
    },
    organizationProposals: proposals.length,
    strategyNotes,
  };
}
