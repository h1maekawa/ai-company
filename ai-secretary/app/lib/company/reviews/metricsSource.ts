/**
 * KPIの材料集め — Phase 4 §10 / §39
 *
 * §39 の要点: 銀行明細のような生データを Event / Pattern へそのまま保存しない。
 * ここでは集計済みの数値だけを取り出し、明細は一切持ち出さない。
 */

import { loadCompanyEvents } from "../eventStore";
import { computeMetrics } from "../metrics";
import { loadPortfolio } from "../../investing/portfolio";
import { computeSavingsRate, emptyPersonalMetrics, available, unavailable, type PersonalCompanyMetrics } from "../personalMetrics";
import { summarizeRevenue, type RevenueAttribution } from "../revenue";
import { effectiveEntries, loadRevenueEntries } from "../revenueStore";
import { loadFinancialSettings, manualProvider } from "../financialSettings";

/** Metric が値を持っているか（0は値として扱う） */
function isAvailableValue(metric: { availability: string; value: number | null }): boolean {
  return metric.availability === "AVAILABLE" && metric.value !== null;
}

export type MetricsSourceOptions = {
  /** 収益の記録。まだ収益が無ければ空配列 */
  revenue?: RevenueAttribution[];
  windowDays?: number;
  now?: Date;
};

/**
 * 取れるものだけを集めてKPIを埋める。
 * 取れないものは NOT_CONNECTED / NO_DATA のまま残す（0で埋めない）。
 */
export async function collectPersonalMetrics(
  options: MetricsSourceOptions = {}
): Promise<PersonalCompanyMetrics> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const metrics = emptyPersonalMetrics();

  /* ─── 組織・生産性（イベントから） ─── */
  const events = await loadCompanyEvents().catch(() => []);
  if (events.length > 0) {
    const org = computeMetrics(events, windowDays, now);
    metrics.productivity.ceoInterventionRate = available(org.ceoInterventionRate);
    metrics.productivity.automationRate = available(org.automationRate);
    metrics.organization.failureRate = available(org.failureRate);
    metrics.organization.taskSuccessRate = available(
      Math.round((org.totalEvents > 0 ? (org.success / org.totalEvents) * 100 : 0) * 10) / 10
    );
    metrics.organization.averageLatencyMs =
      org.avgLatencyMs === null
        ? unavailable("NO_DATA", "処理時間が記録されていません")
        : available(org.avgLatencyMs);
    metrics.organization.aiCostUsd =
      org.totalCostUsd === null
        ? unavailable("NO_DATA", "コストが記録されていません")
        : available(org.totalCostUsd);
  }

  /* ─── 資産（ポートフォリオから） ─── */
  try {
    const portfolio = await loadPortfolio();
    if (portfolio.summary.totalValueJpy !== null) {
      metrics.financial.investmentAssetsYen = available(
        Math.round(portfolio.summary.totalValueJpy)
      );
    }
    if (portfolio.summary.cashJpy !== null) {
      metrics.financial.cashBalanceYen = available(Math.round(portfolio.summary.cashJpy));
    }
    // 純資産は「投資資産 + 現金」までしか分からない。負債は未接続
    if (portfolio.summary.totalValueJpy !== null && portfolio.summary.cashJpy !== null) {
      metrics.financial.netWorthYen = available(
        Math.round(portfolio.summary.totalValueJpy + portfolio.summary.cashJpy)
      );
    } else {
      metrics.financial.netWorthYen = unavailable("NO_DATA", "投資資産または現金が未取得（負債も未接続）");
    }
  } catch {
    // ポートフォリオが読めなくてもレビュー全体は続ける
  }

  /* ─── 手動入力の財務値（家計簿が繋がるまでの経路・§42） ─── */
  const settings = await loadFinancialSettings().catch(() => null);
  if (settings) {
    const provider = manualProvider(settings);
    const [income, expense, cash] = await Promise.all([
      provider.getMonthlyIncome(),
      provider.getMonthlyExpense(),
      provider.getCashBalance(),
    ]);
    if (income !== null) metrics.financial.monthlyIncomeYen = available(income);
    if (expense !== null) metrics.financial.monthlyExpenseYen = available(expense);
    // 現金は投資側から取れていなければ手動値で埋める
    if (cash !== null && !isAvailableValue(metrics.financial.cashBalanceYen)) {
      metrics.financial.cashBalanceYen = available(cash);
    }
  }

  /* ─── 収益（収益台帳から・Phase 5） ─── */
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const ledger = options.revenue ?? effectiveEntries(await loadRevenueEntries().catch(() => []));
  const hasLedger = ledger.length > 0 || options.revenue !== undefined;
  const revenue = summarizeRevenue(ledger, { since });

  metrics.financial.aiGeneratedRevenueYen = hasLedger
    ? available(revenue.aiGeneratedYen)
    : unavailable("NO_DATA", "収益の記録がまだありません");
  metrics.financial.sideIncomeYen = hasLedger
    ? available(revenue.aiGeneratedYen + revenue.otherBusinessYen)
    : unavailable("NO_DATA", "収益の記録がまだありません");

  metrics.financial.savingsRate = computeSavingsRate(
    metrics.financial.monthlyIncomeYen.value,
    metrics.financial.monthlyExpenseYen.value
  );

  return metrics;
}
