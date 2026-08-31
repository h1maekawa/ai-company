/**
 * SNS事業部 Weekly CEO Report（要件P1.5）。
 *
 * 既存のGrowth Review履歴 / Performance / Style Signalだけを集計する。
 * 新しいReporting基盤は作らず、既存データの読み取り専用の合成のみ行う。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { contentPerformanceScore, weekKeyTokyo } from "../operations";
import { aggregateStyleSignals } from "../styleSignals";
import type { DailyGrowthReview } from "../growthLoop";
import type { ContentPerformance, PerformanceWeights } from "../research/types";

const PATH = "memory/personal/note/weekly-ceo-report.md";

export type WeeklyCeoReport = {
  weekKey: string;
  generatedAt: string;
  postCount: number;
  totalImpressions?: number;
  risingTopics: string[];
  fallingTopics: string[];
  winningStyle: string[];
  losingStyle: string[];
  investmentPostCount: number;
  investmentAverageScore?: number;
  learnings: string[];
  strategyChanges: string[];
  nextExperiments: string[];
  errors: string[];
  needsHumanReview: string[];
};

export function buildWeeklyCeoReport(input: {
  reviews: DailyGrowthReview[];
  performanceRecords: ContentPerformance[];
  weights: PerformanceWeights;
  performanceSyncError?: string;
  now?: Date;
}): WeeklyCeoReport {
  const now = input.now ?? new Date();
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const weekRecords = input.performanceRecords.filter(
    (r) => new Date(r.publishedAt).getTime() >= weekAgo
  );
  const xWeekRecords = weekRecords.filter((r) => r.platform === "x");
  const totalImpressions = xWeekRecords.some((r) => r.impressions !== undefined)
    ? xWeekRecords.reduce((sum, r) => sum + (r.impressions ?? 0), 0)
    : undefined;

  const latestReview = input.reviews[0];
  const styleGroups = aggregateStyleSignals(weekRecords, input.weights);

  const investmentRecords = xWeekRecords.filter((r) => r.trendClusterId?.startsWith("investment-"));
  const investmentScores = investmentRecords.map((r) => contentPerformanceScore(r, input.weights));

  return {
    weekKey: weekKeyTokyo(now),
    generatedAt: now.toISOString(),
    postCount: xWeekRecords.length,
    totalImpressions,
    risingTopics: (latestReview?.winningTopics ?? []).map((t) => t.topicId).slice(0, 5),
    fallingTopics: (latestReview?.decliningTopics ?? []).map((t) => t.topicId).slice(0, 5),
    winningStyle: styleGroups
      .filter((g) => g.winning)
      .slice(0, 5)
      .map((g) => `${g.dimension}:${g.value}（平均${g.averageScore}点・${g.sampleSize}投稿）`),
    losingStyle: styleGroups
      .filter((g) => !g.winning && g.sampleSize >= 3)
      .slice(-5)
      .map((g) => `${g.dimension}:${g.value}（平均${g.averageScore}点・${g.sampleSize}投稿）`),
    investmentPostCount: investmentRecords.length,
    investmentAverageScore:
      investmentScores.length > 0
        ? Math.round((investmentScores.reduce((a, b) => a + b, 0) / investmentScores.length) * 10) / 10
        : undefined,
    learnings: [...new Set(input.reviews.flatMap((r) => r.insights))].slice(0, 10),
    strategyChanges: input.reviews
      .flatMap((r) => r.appliedChanges.map((c) => `${c.field}: ${c.reason}`))
      .slice(0, 10),
    nextExperiments: latestReview?.experiments ?? [],
    errors: input.performanceSyncError ? [input.performanceSyncError] : [],
    needsHumanReview: [
      ...(latestReview?.noteApprovalPriorities ?? []).map((p) => `note記事「${p.title}」の公開可否確認`),
      ...(latestReview?.skippedChanges ?? []),
    ],
  };
}

export function weeklyCeoReportSlackText(report: WeeklyCeoReport): string {
  const list = (items: string[]) => (items.length > 0 ? items.map((i) => `・${i}`).join("\n") : "・（該当なし）");
  return [
    `📊 SNS事業部 Weekly Report（${report.weekKey}週）`,
    `投稿数: ${report.postCount}件 / 総インプレッション: ${report.totalImpressions ?? "未取得"}`,
    "",
    "【伸びたテーマ】", list(report.risingTopics),
    "【伸びなかったテーマ】", list(report.fallingTopics),
    "【Winning Style】", list(report.winningStyle),
    "【Losing Style】", list(report.losingStyle),
    "",
    `【投資投稿】${report.investmentPostCount}件${report.investmentAverageScore !== undefined ? ` / 平均${report.investmentAverageScore}点` : ""}`,
    "",
    "【今週AIが学んだこと】", list(report.learnings),
    "【今週変更したStrategy】", list(report.strategyChanges),
    "【来週の実験】", list(report.nextExperiments),
    "",
    "【エラー】", list(report.errors),
    "【人間確認が必要なもの】", list(report.needsHumanReview),
  ].join("\n");
}

type ReportFile = { reports: WeeklyCeoReport[] };
const MAX_KEPT = 26;

export async function loadWeeklyCeoReports(): Promise<WeeklyCeoReport[]> {
  try {
    const file = await getVaultFile(PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return [];
    const data = JSON.parse(match[1]) as ReportFile;
    return Array.isArray(data.reports) ? data.reports : [];
  } catch {
    return [];
  }
}

export async function saveWeeklyCeoReport(report: WeeklyCeoReport): Promise<void> {
  const existing = await loadWeeklyCeoReports();
  // 週単位でidempotent。同じ週のretryは最新の集計で置換する
  const reports = [report, ...existing.filter((r) => r.weekKey !== report.weekKey)].slice(0, MAX_KEPT);
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(PATH)).sha;
  } catch {
    // 初回作成
  }
  const human = reports
    .slice(0, 8)
    .map((r) => `## ${r.weekKey}週\n${weeklyCeoReportSlackText(r)}`)
    .join("\n\n---\n\n");
  const markdown = `---
type: note_weekly_ceo_report
updated: ${new Date().toISOString()}
---

# SNS事業部 Weekly CEO Report

${human}

\`\`\`json
${JSON.stringify({ reports }, null, 2)}
\`\`\`
`;
  await saveVaultFile(PATH, markdown, sha);
}
