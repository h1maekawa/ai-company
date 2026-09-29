import { NextResponse } from "next/server";
import { loadIntelligenceToday, appendInvestmentDecision } from "@/app/lib/investing/intelligence/store";
import type { InvestmentDecisionRecord } from "@/app/lib/investing/intelligence/types";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json() as { decision?: string; reason?: string; scenario?: string };
  if (!body.decision || !["GO", "WAIT", "PASS"].includes(body.decision)) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  const today = await loadIntelligenceToday();
  const opportunity = today?.opportunities.find((item) => item.id === params.id);
  if (!opportunity || !today) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  const record: InvestmentDecisionRecord = {
    id: `decision_${params.id}_${Date.now()}`, opportunityId: params.id,
    decision: body.decision as InvestmentDecisionRecord["decision"], reason: String(body.reason ?? "").slice(0, 500),
    priceAtDecision: opportunity.evidence.find((item) => item.metric === "ohlcv")?.value as number ?? null,
    marketRegime: today.marketRegime, opportunityScore: opportunity.score,
    scenario: (["BULL", "BASE", "BEAR"].includes(body.scenario ?? "") ? body.scenario : "BASE") as InvestmentDecisionRecord["scenario"],
    timestamp: new Date().toISOString(),
  };
  await appendInvestmentDecision(record);
  return NextResponse.json({ record }, { status: 201 });
}
