import type { DailyBar } from "@/app/lib/fund/marketData/calc";
import { changePct, rvol20 } from "@/app/lib/fund/marketData/calc";
import { getProvider } from "@/app/lib/fund/marketData/provider";
import type { SectorSnapshot } from "../types";

export const SECTOR_PROXIES = { Technology: "XLK", Communication: "XLC", ConsumerDiscretionary: "XLY", ConsumerStaples: "XLP", Energy: "XLE", Financials: "XLF", Healthcare: "XLV", Industrials: "XLI", Materials: "XLB", RealEstate: "XLRE", Utilities: "XLU", Semiconductors: "SOXX" } as const;
const momentum = (bars: DailyBar[], days: number) => bars.length > days && bars.at(-(days + 1))!.close > 0 ? ((bars.at(-1)!.close / bars.at(-(days + 1))!.close) - 1) * 100 : null;
const proximity = (bars: DailyBar[]) => { const recent = bars.slice(-20); if (!recent.length) return null; const high = Math.max(...recent.map((bar) => bar.high)); return high > 0 ? bars.at(-1)!.close / high : null; };

export function buildSectorSnapshot(name: string, proxy: string, bars: DailyBar[] | null, spy: DailyBar[] | null): SectorSnapshot {
  if (!bars || bars.length < 21) return { id: `sector_${proxy}`, name, proxy, momentum1d: null, momentum5d: null, momentum20d: null, relativeStrength20d: null, relativeVolume: null, high20Proximity: null, score: null, freshness: "unknown", evidenceRefs: [] };
  const m20 = momentum(bars, 20); const spy20 = spy ? momentum(spy, 20) : null; const rv = rvol20(bars); const rs = m20 !== null && spy20 !== null ? m20 - spy20 : null; const near = proximity(bars);
  const parts = [m20 === null ? null : Math.max(0, Math.min(35, 17.5 + m20)), rs === null ? null : Math.max(0, Math.min(30, 15 + rs)), rv === null ? null : Math.max(0, Math.min(20, rv * 10)), near === null ? null : near * 15];
  const score = parts.every((value) => value !== null) ? Math.round(parts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  return { id: `sector_${proxy}`, name, proxy, momentum1d: changePct(bars), momentum5d: momentum(bars, 5), momentum20d: m20, relativeStrength20d: rs, relativeVolume: rv, high20Proximity: near, score, freshness: "daily", evidenceRefs: [`market:${proxy}:${bars.at(-1)!.date}`] };
}

export async function loadSectorSnapshots(): Promise<SectorSnapshot[]> {
  const provider = getProvider(); const spyPromise = provider.getDailyBars("SPY", 21);
  const [spy, ...bars] = await Promise.all([spyPromise, ...Object.values(SECTOR_PROXIES).map((proxy) => provider.getDailyBars(proxy, 21))]);
  return Object.entries(SECTOR_PROXIES).map(([name, proxy], index) => buildSectorSnapshot(name, proxy, bars[index], spy)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
