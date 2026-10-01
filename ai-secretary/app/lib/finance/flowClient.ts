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

export type TransactionReviewItem = {
  id: string; date: string; amount: number; memo: string | null;
  payment_method: string; card_issuer: string | null; auto_category: string | null;
  review_reason: string | null;
};
export type TransactionReviews = {
  month: string;
  items: TransactionReviewItem[];
  categories: Array<{ name: string; icon: string }>;
};

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
const MAX_STALE_MS = 6 * 60 * 60_000;
const inFlight = new Map<string, Promise<Snapshot<unknown>>>();

export function parseFlowDebtSummary(value: unknown): FlowDebtSummary {
  const fail = (): never => { throw new Error("Flow+の応答形式が不正です"); };
  const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const number = (v: unknown): number => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fail();
  const string = (v: unknown): string => typeof v === "string" && v.trim() ? v : fail();
  const date = (v: unknown): string => {
    const s = string(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail();
    return s;
  };
  const data = object(value);
  if (!Array.isArray(data.items)) return fail();
  const ids = new Set<string>();
  const items: FlowDebtItem[] = data.items.map((raw) => {
    const row = object(raw);
    const id = string(row.id);
    if (ids.has(id)) fail();
    ids.add(id);
    if (row.direction !== "borrowed" && row.direction !== "lent") return fail();
    if (typeof row.is_settled !== "boolean" || !(row.memo === null || typeof row.memo === "string")) return fail();
    return { id, direction: row.direction, counterparty: string(row.counterparty), amount: number(row.amount), date: date(row.date), due_date: row.due_date === null ? null : date(row.due_date), memo: row.memo, is_settled: row.is_settled };
  });
  const rawTotals = object(data.totals);
  const totals = { borrowed: number(rawTotals.borrowed), lent: number(rawTotals.lent) };
  for (const direction of ["borrowed", "lent"] as const) {
    const sum = items.filter((item) => item.direction === direction).reduce((total, item) => total + item.amount, 0);
    if (!Number.isFinite(sum) || Math.abs(sum - totals[direction]) > 0.000001) fail();
  }
  return { items, totals };
}

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

async function fetchFlow<T>(key: string, pathname: string, params: URLSearchParams, maxAgeMs: number, parse?: (value: unknown) => T): Promise<Snapshot<T>> {
  key = `${process.env.FLOW_FINANCE_BASE_URL}:${process.env.FLOW_FINANCE_INTEGRATION_TOKEN}:${key}`;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<Snapshot<T>>;
  const task = fetchFlowOnce(key, pathname, params, maxAgeMs, parse);
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}

async function fetchFlowOnce<T>(key: string, pathname: string, params: URLSearchParams, maxAgeMs: number, parse?: (value: unknown) => T): Promise<Snapshot<T>> {
  const previous = cache.get(key) as { data: T; fetchedAt: string } | undefined;
  const safePrevious = previous && Date.now() - Date.parse(previous.fetchedAt) <= MAX_STALE_MS ? previous : undefined;
  if (!flowConfigured()) return { data: null, fetchedAt: previous?.fetchedAt ?? null, stale: true, error: "Flow+連携は未設定です", configured: false };
  if (previous && Date.now() - Date.parse(previous.fetchedAt) < maxAgeMs) return { data: previous.data, fetchedAt: previous.fetchedAt, stale: false, error: null, configured: true };
  try {
    const url = new URL(pathname, flowBaseUrl());
    url.search = params.toString();
    const response = await fetch(url, {
      headers: { "x-import-secret": process.env.FLOW_FINANCE_INTEGRATION_TOKEN! },
      redirect: "error",
      cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401 || response.status === 403) {
      cache.delete(key);
      return { data: null, fetchedAt: null, stale: true, error: "Flow+の認証または権限を確認してください", configured: true };
    }
    if (!response.ok) throw new Error(`FLOW_HTTP_${response.status}`);
    const raw: unknown = await response.json();
    const data = parse ? parse(raw) : raw as T;
    const fetchedAt = new Date().toISOString();
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, fetchedAt });
    return { data, fetchedAt, stale: false, error: null, configured: true };
  } catch (error) {
    return { data: safePrevious?.data ?? null, fetchedAt: previous?.fetchedAt ?? null, stale: true, error: error instanceof Error && error.message === "Flow+の応答形式が不正です" ? error.message : "Flow+から最新値を取得できません", configured: true };
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
export function flowTransactionReviews(month: string, limit = 20): Promise<Snapshot<TransactionReviews>> {
  if (!validMonth(month) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("INVALID_QUERY");
  return fetchFlow(`reviews:${month}:${limit}`, "/api/integrations/transaction-reviews", new URLSearchParams({ month, limit: String(limit) }), 5_000);
}
export async function categorizeFlowTransaction(id: string, category: string): Promise<{ transaction: { id: string; date: string; amount: number; category: string } }> {
  if (!id.trim() || !category.trim()) throw new Error("INVALID_CATEGORY_UPDATE");
  if (!flowConfigured()) throw new Error("FLOW_NOT_CONFIGURED");
  const response = await fetch(new URL("/api/integrations/transaction-reviews", flowBaseUrl()), {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-import-secret": process.env.FLOW_FINANCE_INTEGRATION_TOKEN! },
    body: JSON.stringify({ id, category }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("FLOW_CATEGORY_FORBIDDEN");
  if (!response.ok) throw new Error(`FLOW_HTTP_${response.status}`);
  for (const key of cache.keys()) if (key.includes(":summary:") || key.includes(":reviews:")) cache.delete(key);
  return response.json();
}
export function flowDebts(): Promise<Snapshot<FlowDebtSummary>> {
  return fetchFlow("debts:unsettled", "/api/integrations/debts", new URLSearchParams(), 10_000, parseFlowDebtSummary);
}
