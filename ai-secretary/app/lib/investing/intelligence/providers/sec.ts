import type { FundamentalSnapshot } from "../types";

type CompanyFacts = { facts?: { "us-gaap"?: Record<string, { units?: Record<string, Array<{ val?: number; end?: string; filed?: string; form?: string; fy?: number; fp?: string }>> }> } };
const EMPTY = (ticker: string): FundamentalSnapshot => ({ ticker, revenue: null, revenueGrowth: null, eps: null, epsGrowth: null, operatingIncome: null, operatingMargin: null, operatingCashFlow: null, capex: null, fcf: null, equity: null, roic: null, per: null, pbr: null, sourceUrl: null, observedAt: null, filedAt: null, freshness: "unknown" });
const latestAnnual = (payload: CompanyFacts, names: string[]) => { for (const name of names) { const units = payload.facts?.["us-gaap"]?.[name]?.units ?? {}; const rows = Object.values(units).flat().filter((row) => row.form === "10-K" && Number.isFinite(row.val)); if (rows.length) return rows.sort((a, b) => String(a.end).localeCompare(String(b.end))).slice(-2); } return []; };

export function parseSecCompanyFacts(ticker: string, payload: CompanyFacts, sourceUrl: string, now = new Date()): FundamentalSnapshot {
  const revenueRows = latestAnnual(payload, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"]); const revenue = revenueRows.at(-1)?.val ?? null; const prevRevenue = revenueRows.at(-2)?.val ?? null;
  const opRows = latestAnnual(payload, ["OperatingIncomeLoss"]); const cashRows = latestAnnual(payload, ["NetCashProvidedByUsedInOperatingActivities"]); const capexRows = latestAnnual(payload, ["PaymentsToAcquirePropertyPlantAndEquipment"]); const equityRows = latestAnnual(payload, ["StockholdersEquity"]); const epsRows = latestAnnual(payload, ["EarningsPerShareDiluted"]);
  const operatingIncome = opRows.at(-1)?.val ?? null; const operatingCashFlow = cashRows.at(-1)?.val ?? null; const capex = capexRows.at(-1)?.val ?? null; const eps = epsRows.at(-1)?.val ?? null; const prevEps = epsRows.at(-2)?.val ?? null;
  const filedAt = revenueRows.at(-1)?.filed ?? null; const filedMs = filedAt ? new Date(`${filedAt}T23:59:59Z`).getTime() : Number.NaN; const freshness = !filedAt || !Number.isFinite(filedMs) ? "unknown" : now.getTime() - filedMs <= 400 * 86_400_000 ? "delayed" : "stale";
  return { ticker, revenue, revenueGrowth: revenue !== null && prevRevenue ? (revenue / prevRevenue - 1) * 100 : null, eps, epsGrowth: eps !== null && prevEps ? (eps / prevEps - 1) * 100 : null, operatingIncome, operatingMargin: revenue && operatingIncome !== null ? operatingIncome / revenue * 100 : null, operatingCashFlow, capex, fcf: operatingCashFlow !== null && capex !== null ? operatingCashFlow - capex : null, equity: equityRows.at(-1)?.val ?? null, roic: null, per: null, pbr: null, sourceUrl, observedAt: revenueRows.at(-1)?.end ?? null, filedAt, freshness };
}

export async function fetchSecFundamentals(ticker: string, cik: string | null, fetcher: typeof fetch = fetch): Promise<{ data: FundamentalSnapshot; status: "OK" | "NOT_CONFIGURED" | "SKIPPED" | "ERROR" }> {
  if (!process.env.SEC_USER_AGENT) return { data: EMPTY(ticker), status: "NOT_CONFIGURED" };
  if (!cik) return { data: EMPTY(ticker), status: "SKIPPED" };
  const padded = cik.padStart(10, "0"); const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  try { const response = await fetcher(url, { headers: { "User-Agent": process.env.SEC_USER_AGENT, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error(); return { data: parseSecCompanyFacts(ticker, await response.json() as CompanyFacts, url), status: "OK" }; } catch { return { data: EMPTY(ticker), status: "ERROR" }; }
}

export async function fetchSecTickerMap(fetcher: typeof fetch = fetch): Promise<Map<string, string>> {
  if (!process.env.SEC_USER_AGENT) return new Map();
  try {
    const response = await fetcher("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": process.env.SEC_USER_AGENT, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return new Map();
    const payload = await response.json() as Record<string, { ticker?: string; cik_str?: number }>;
    return new Map(Object.values(payload).filter((item) => item.ticker && item.cik_str).map((item) => [item.ticker!.toUpperCase(), String(item.cik_str)]));
  } catch { return new Map(); }
}
