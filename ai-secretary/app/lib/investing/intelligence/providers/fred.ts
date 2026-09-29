import type { IntelligenceFreshness, MacroMetric } from "../types";

type FredObservation = { date?: string; value?: string };
type FredResponse = { observations?: FredObservation[] };
const SERIES = [
  ["FEDFUNDS", "Federal Funds Rate", "%"], ["DGS10", "US 10Y Treasury", "%"],
  ["DGS2", "US 2Y Treasury", "%"], ["CPIAUCSL", "CPI", "index"],
  ["UNRATE", "Unemployment Rate", "%"], ["GDP", "GDP", "USD billions"],
] as const;

export function parseFredResponse(id: string, label: string, unit: string, payload: FredResponse, fetchedAt: string): MacroMetric {
  const valid = (payload.observations ?? []).filter((item) => item.date && item.value && item.value !== "." && Number.isFinite(Number(item.value))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const current = valid.at(-1); const previous = valid.at(-2);
  const value = current ? Number(current.value) : null; const previousValue = previous ? Number(previous.value) : null;
  const direction = value === null || previousValue === null ? "unknown" : value > previousValue ? "up" : value < previousValue ? "down" : "flat";
  const freshness: IntelligenceFreshness = current?.date ? (new Date(fetchedAt).getTime() - new Date(`${current.date}T00:00:00Z`).getTime() <= 45 * 86_400_000 ? "daily" : "stale") : "unknown";
  return { id, label, value, unit, previousValue, direction, observedAt: current?.date ?? null, fetchedAt, source: "FRED", sourceUrl: `https://fred.stlouisfed.org/series/${id}`, freshness };
}

export async function fetchFredMacro(fetcher: typeof fetch = fetch): Promise<{ available: boolean; metrics: MacroMetric[]; status: "OK" | "NOT_CONFIGURED" | "ERROR" }> {
  const key = process.env.FRED_API_KEY;
  if (!key) return { available: false, metrics: [], status: "NOT_CONFIGURED" };
  const fetchedAt = new Date().toISOString();
  try {
    const metrics = await Promise.all(SERIES.map(async ([id, label, unit]) => {
      const url = new URL("https://api.stlouisfed.org/fred/series/observations");
      url.searchParams.set("series_id", id); url.searchParams.set("api_key", key); url.searchParams.set("file_type", "json"); url.searchParams.set("sort_order", "desc"); url.searchParams.set("limit", "2");
      const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`FRED_${response.status}`);
      return parseFredResponse(id, label, unit, await response.json() as FredResponse, fetchedAt);
    }));
    return { available: metrics.some((item) => item.value !== null), metrics, status: "OK" };
  } catch { return { available: false, metrics: [], status: "ERROR" }; }
}
