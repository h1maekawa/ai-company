import type { KakeiSource, KakeiSummary } from "./types";

/**
 * 家計簿アプリ（household-finance）の集計API。
 * 認証は x-import-secret。GAS取込・investment-capacity と同じ仕組みで、
 * Supabaseの直読みはしない（RLSが auth.uid() 前提のため anon キーでは読めず、
 * service_role キーを持ち出すのは家計簿DB全体への全権を渡すことになる）。
 */
const SUMMARY_PATH = "/api/integrations/monthly-summary";

type SummaryResponse = {
  month: string;
  currency?: string;
  total_spent?: number;
  app_url?: string;
  income?: { planned?: number; actual?: number };
  fixed?: { effective?: number; unpaid?: number };
  variable?: {
    budget?: number;
    spent?: number;
    remaining?: number;
    daily_allowance?: number;
    days_left?: number;
    pace?: number;
  };
  by_category?: Array<{ category?: string; amount?: number; count?: number; average?: number }>;
  needs_review?: {
    count?: number;
    items?: Array<{ id?: string; date?: string; amount?: number; category?: string; memo?: string | null }>;
  };
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function createKakeiSource(): KakeiSource {
  const base = process.env.HOUSEHOLD_API_URL?.replace(/\/$/, "");
  const secret = process.env.HOUSEHOLD_IMPORT_SECRET;
  if (!base || !secret) {
    throw new Error(
      "家計簿アプリ連携が未設定です（HOUSEHOLD_API_URL と HOUSEHOLD_IMPORT_SECRET を設定してください）"
    );
  }

  return {
    async fetchSummary(month: string): Promise<KakeiSummary> {
      const res = await fetch(`${base}${SUMMARY_PATH}?month=${month}`, {
        headers: { "x-import-secret": secret },
        cache: "no-store",
      });
      if (!res.ok) {
        const reason = res.status === 401 ? "認証に失敗しました" : `HTTP ${res.status}`;
        throw new Error(`家計サマリの取得に失敗しました: ${reason}`);
      }
      const json = (await res.json()) as SummaryResponse;
      const variable = json.variable ?? {};

      return {
        month: json.month || month,
        syncedAt: new Date().toISOString(),
        currency: json.currency || "JPY",
        totalSpent: num(json.total_spent),
        income: { planned: num(json.income?.planned), actual: num(json.income?.actual) },
        fixed: { effective: num(json.fixed?.effective), unpaid: num(json.fixed?.unpaid) },
        variable: {
          budget: num(variable.budget),
          spent: num(variable.spent),
          remaining: num(variable.remaining),
          dailyAllowance: num(variable.daily_allowance),
          daysLeft: num(variable.days_left),
          pace: num(variable.pace),
        },
        byCategory: (json.by_category ?? []).map((row) => ({
          category: String(row.category ?? ""),
          amount: num(row.amount),
          count: num(row.count),
          average: num(row.average),
        })),
        needsReview: {
          count: num(json.needs_review?.count),
          items: (json.needs_review?.items ?? []).map((row) => ({
            id: String(row.id ?? ""),
            date: String(row.date ?? "").slice(0, 10),
            amount: num(row.amount),
            category: String(row.category ?? ""),
            memo: row.memo ?? null,
          })),
        },
        appUrl: json.app_url || base,
      };
    },
  };
}
