import "server-only";

export type FinanceSummary = {
  month: string;
  income: { planned: number | null; actual: number | null };
  expenses: { fixed: number | null; variable: number | null; total?: number | null };
  cashflow: { free_to_spend: number | null; daily_allowance: number | null };
  capacity: { saving: number | null; asset_building: number | null; free_cash: number | null };
  assets: { cash: number | null; investment: number | null; other: number | null; total: number | null };
  review: { unreviewed_transactions: number; unassigned_card_usage: number; negative_balance_risk: boolean };
  confidence: string;
  calculated_at?: string | null;
};

export type CardActivityItem = {
  id: string; date: string; merchant: string; amount: number;
  card: string; category: string | null; review_status: string;
  source?: string | null;
};
export type CardActivity = { items: CardActivityItem[]; next_cursor?: string | null };

export type FlowDebtItem = {
  id: string;
  direction: "borrowed" | "lent";
  counterparty: string;
  amount: number;
  date: string;
  due_date: string | null;
  memo: string | null;
  is_settled: boolean;
};
export type FlowDebtSummary = {
  items: FlowDebtItem[];
  totals: { borrowed: number; lent: number };
};

type Snapshot<T> = { data: T | null; fetchedAt: string | null; stale: boolean; error: string | null; configured: boolean };
const cache = new Map<string, { data: unknown; fetchedAt: string }>();
const MAX_CACHE_ENTRIES = 24;

export function flowConfigured(): boolean {
  return Boolean(process.env.FLOW_FINANCE_BASE_URL && process.env.FLOW_FINANCE_INTEGRATION_TOKEN);
}

function flowBaseUrl(): URL {
  const raw = process.env.FLOW_FINANCE_BASE_URL;
  if (!raw) throw new Error("FLOW_NOT_CONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("FLOW_URL_INVALID");
  if (url.username || url.password) throw new Error("FLOW_URL_INVALID");
  return url;
}

async function fetchFlow<T>(key: string, pathname: string, params: URLSearchParams, maxAgeMs: number): Promise<Snapshot<T>> {
  const previous = cache.get(key) as { data: T; fetchedAt: string } | undefined;
  if (!flowConfigured()) return { data: previous?.data ?? null, fetchedAt: previous?.fetchedAt ?? null, stale: true, error: "Flow+連携は未設定です", configured: false };
  if (previous && Date.now() - Date.parse(previous.fetchedAt) < maxAgeMs) return { data: previous.data, fetchedAt: previous.fetchedAt, stale: false, error: null, configured: true };
  try {
    const url = new URL(pathname, flowBaseUrl());
    url.search = params.toString();
    const response = await fetch(url, {
      headers: { "x-import-secret": process.env.FLOW_FINANCE_INTEGRATION_TOKEN! },
      cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`FLOW_HTTP_${response.status}`);
    const data = await response.json() as T;
    const fetchedAt = new Date().toISOString();
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, fetchedAt });
    return { data, fetchedAt, stale: false, error: null, configured: true };
  } catch {
    return { data: previous?.data ?? null, fetchedAt: previous?.fetchedAt ?? null, stale: true, error: "Flow+から最新値を取得できません", configured: true };
  }
}

const validMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
export function flowFinanceSummary(month: string): Promise<Snapshot<FinanceSummary>> {
  if (!validMonth(month)) throw new Error("INVALID_MONTH");
  return fetchFlow(`summary:${month}`, "/api/integrations/finance-summary", new URLSearchParams({ month }), 60_000);
}
export function flowCardActivity(month: string, limit: number, cursor?: string): Promise<Snapshot<CardActivity>> {
  if (!validMonth(month) || !Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor && cursor.length > 200)) throw new Error("INVALID_QUERY");
  const params = new URLSearchParams({ month, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return fetchFlow(`cards:${params}`, "/api/integrations/card-activity", params, 10_000);
}
export function flowDebts(): Promise<Snapshot<FlowDebtSummary>> {
  return fetchFlow("debts:unsettled", "/api/integrations/debts", new URLSearchParams(), 10_000);
}
