import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/fund/marketData/provider";
import { withLock } from "@/app/lib/note/publishing/queue";
import { deriveMarketRegime } from "./engine";
import { notifyInvestmentOpportunities } from "./notifications";
import { fetchEconomicNews } from "./providers/economicNews";
import { loadMacroSnapshot } from "./providers/macro";
import { loadSectorSnapshots } from "./providers/sector";
import { investmentIntelligenceEnabled, runDailyInvestmentResearch } from "./research";
import { loadIntelligenceToday, saveIntelligenceToday } from "./store";
import type { IntelligenceToday } from "./types";

export function isAuthorizedInvestmentCron(request: Request): boolean { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }
function emptyToday(now: Date): IntelligenceToday { return { asOf: now.toISOString(), runId: `investment-${now.toISOString()}`, marketRegime: "DATA_INCOMPLETE", marketEvidence: [], sectorStrength: [], themeStrength: [], opportunities: [], portfolioAlerts: [], economicEvents: [], news: [], macro: { available: false, metrics: [], regime: "DATA_INCOMPLETE", coverage: 0, evidenceRefs: [] }, economicNews: [], sectors: [], providerStatus: [], summary: "段階的な日次調査を実行中です。" }; }
export async function runInvestmentCron(request: Request, stage: "macro-news" | "market-sector" | "opportunity-scan" | "notify") {
  if (!isAuthorizedInvestmentCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!investmentIntelligenceEnabled()) return NextResponse.json({ ok: true, skipped: "feature-disabled", stage });
  const runId = `${stage}:${new Date().toISOString().slice(0, 10)}`;
  const result = await withLock(`investment-intelligence:${runId}`, async () => {
    if (stage === "notify") { const today = await loadIntelligenceToday(); if (!today) return { skipped: "no-artifact" }; const deliveries = await notifyInvestmentOpportunities(today); today.notificationDeliveries = deliveries; await saveIntelligenceToday(today); return { deliveries: deliveries.length }; }
    if (stage === "macro-news") { const now = new Date(); const [macro, news] = await Promise.all([loadMacroSnapshot(now), fetchEconomicNews()]); const today = await loadIntelligenceToday() ?? emptyToday(now); Object.assign(today, { asOf: now.toISOString(), runId, macro: macro.macro, economicNews: news.items, providerStatus: [...macro.statuses, { provider: "SerpAPI" as const, status: news.status, checkedAt: now.toISOString() }] }); await saveIntelligenceToday(today); return { macroMetrics: macro.macro.metrics.length, news: news.items.length }; }
    if (stage === "market-sector") { const now = new Date(); const [bars, sectors] = await Promise.all([getProvider().getDailyBars("SPY", 205), loadSectorSnapshots()]); const today = await loadIntelligenceToday() ?? emptyToday(now); Object.assign(today, { asOf: now.toISOString(), runId, marketRegime: deriveMarketRegime(bars), sectors, sectorStrength: sectors.map((item) => ({ name: item.name, score: item.score, reason: `${item.proxy}: 20日momentum ${item.momentum20d?.toFixed(1) ?? "—"}%` })) }); await saveIntelligenceToday(today); return { sectors: sectors.length, marketRegime: today.marketRegime }; }
    const today = await runDailyInvestmentResearch(); return { asOf: today.asOf, opportunities: today.opportunities.length, providers: today.providerStatus };
  }, { ttlSec: 300 });
  return NextResponse.json(result ? { ok: true, stage, runId, ...result } : { ok: true, stage, runId, skipped: "locked" });
}
