import { getProvider } from "@/app/lib/fund/marketData/provider";
import { fetchFredMacro } from "./fred";
import type { MacroSnapshot, ProviderStatus } from "../types";

export async function loadMacroSnapshot(now = new Date()): Promise<{ macro: MacroSnapshot; statuses: ProviderStatus[] }> {
  const [fred, fx] = await Promise.all([fetchFredMacro(), getProvider().getUsdJpy().catch(() => null)]);
  const metrics = [...fred.metrics];
  if (fx) metrics.push({ id: "USDJPY", label: "USD/JPY", value: fx.rate, unit: "JPY", previousValue: null, direction: "unknown", observedAt: fx.asOf, fetchedAt: now.toISOString(), source: "Yahoo Finance", freshness: "delayed" });
  const coverage = metrics.length / 7;
  const usable = metrics.filter((item) => item.value !== null && item.freshness !== "stale");
  const regime = usable.length < 4 ? "DATA_INCOMPLETE" : "NEUTRAL";
  return { macro: { available: usable.length > 0, metrics, regime, coverage, evidenceRefs: usable.map((item) => `macro:${item.id}:${item.observedAt}`) }, statuses: [
    { provider: "FRED", status: fred.status, checkedAt: now.toISOString() },
    { provider: "Yahoo", status: fx ? "OK" : "ERROR", checkedAt: now.toISOString(), detail: "USD/JPY" },
  ] };
}
