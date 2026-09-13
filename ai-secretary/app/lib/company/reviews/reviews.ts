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
import { loadFinancialSettings } from "../financialSettings";
import { effectiveEntries, loadRevenueEntries } from "../revenueStore";
import { summarizeRevenue } from "../revenue";
import { resolveRevenueMode, type RevenueMode } from "../revenueMode";

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
  /** 最初の1円モードか成長モードか（Phase 5 §26 §27） */
  revenueMode: RevenueMode;
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

  // FIRE設定は保存済みの値を既定にし、呼び出し側の指定があれば優先する（Phase 5 §36）
  const saved = await loadFinancialSettings().catch(() => null);

  const fire = computeFireProgress({
    annualLivingCostYen:
      options.fire?.annualLivingCostYen ?? saved?.annualLivingCostYen ?? null,
    targetAssetYen: options.fire?.targetAssetYen ?? saved?.targetAssetAmountYen ?? null,
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
    revenueMode: resolveRevenueMode(aiRevenue),
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
  /** Phase 5 §47 追加分 */
  newRevenueYen: number;
  revenueBySource: Record<string, number>;
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
    ...(await dailyRevenueSummary(now)),
  };
}

/** その日に記録された収益の内訳（Phase 5 §47） */
async function dailyRevenueSummary(now: Date) {
  const entries = effectiveEntries(await loadRevenueEntries().catch(() => []));
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const today = entries.filter(
    (e) => e.occurredAt >= since && e.confirmedByHuman && e.sourceType !== "investment"
  );

  return {
    newRevenueYen: today.reduce((sum, e) => sum + e.amountYen, 0),
    revenueBySource: today.reduce<Record<string, number>>((acc, e) => {
      acc[e.sourceType] = (acc[e.sourceType] ?? 0) + e.amountYen;
      return acc;
    }, {}),
  };
}

/* ─── Weekly（§24） ─────────────────────────────── */

export type WeeklyReview = ReviewBase & {
  departmentHealth: DepartmentHealth[];
  bottleneckFlags: { agentId: string; flags: string[] }[];
  workflowCandidates: number;
  proposals: number;
  nextPriority: string[];
  /** Phase 5 §48 追加分 */
  weeklyAiRevenueYen: number;
  revenueByMission: Record<string, number>;
  bestCategory: string | null;
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

  const ledger = effectiveEntries(await loadRevenueEntries().catch(() => []));
  const weekSince = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekly = summarizeRevenue(ledger, { since: weekSince });
  const weekEntries = ledger.filter(
    (e) => e.occurredAt >= weekSince && e.confirmedByHuman && e.sourceType !== "investment"
  );
  const byCategory = weekEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.sourceType] = (acc[e.sourceType] ?? 0) + e.amountYen;
    return acc;
  }, {});

  return {
    ...base,
    weeklyAiRevenueYen: weekly.aiGeneratedYen,
    revenueByMission: weekEntries.reduce<Record<string, number>>((acc, e) => {
      if (e.missionId) acc[e.missionId] = (acc[e.missionId] ?? 0) + e.amountYen;
      return acc;
    }, {}),
    bestCategory:
      Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
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
  /** Phase 5 §49 追加分 */
  revenueSources: Record<string, number>;
  repeatableRevenueYen: number;
};

export async function runMonthlyPersonalCompanyReview(
  options: ReviewOptions = {}
): Promise<MonthlyReview> {
  const now = options.now ?? new Date();
  const base = await buildBase("monthly", 30, options);
  const proposals = await loadProposals().catch(() => []);

  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const ledger = options.revenue ?? effectiveEntries(await loadRevenueEntries().catch(() => []));
  const revenue = ledger.length > 0 ? summarizeRevenue(ledger, { since }) : null;

  const monthEntries = ledger.filter(
    (e) => e.occurredAt >= since && e.confirmedByHuman && e.sourceType !== "investment"
  );
  const revenueSources = monthEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.sourceType] = (acc[e.sourceType] ?? 0) + e.amountYen;
    return acc;
  }, {});
  // 同じ収益源で2回以上発生しているものを「繰り返せた収益」とみなす
  const counts = monthEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.sourceType] = (acc[e.sourceType] ?? 0) + 1;
    return acc;
  }, {});
  const repeatableRevenueYen = Object.entries(revenueSources)
    .filter(([source]) => (counts[source] ?? 0) >= 2)
    .reduce((sum, [, amount]) => sum + amount, 0);

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
    revenueSources,
    repeatableRevenueYen,
  };
}
