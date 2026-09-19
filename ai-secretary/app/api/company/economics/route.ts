import { NextRequest, NextResponse } from "next/server";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { loadBusinessCostEntries } from "@/app/lib/company/businessCostStore";
import {
  projectEconomicOutcome,
  type EconomicScope,
} from "@/app/lib/company/economics";

export const dynamic = "force-dynamic";

function scopeFromRequest(req: NextRequest): EconomicScope {
  const params = req.nextUrl.searchParams;
  for (const [key, type] of [
    ["missionId", "mission"],
    ["opportunityId", "opportunity"],
    ["contentId", "content"],
    ["businessId", "business"],
  ] as const) {
    const id = params.get(key);
    if (id) return { type, id };
  }
  return { type: "all" };
}

/** GET /api/company/economics — Ledgerから都度計算するCreator Economic read model。 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const [revenueEntries, costEntries] = await Promise.all([
      loadRevenueEntries(),
      loadBusinessCostEntries(),
    ]);
    const outcome = projectEconomicOutcome({
      revenueEntries,
      costEntries,
      scope: scopeFromRequest(req),
      revenueKnown: req.nextUrl.searchParams.get("revenueKnown") === "true",
      costKnown: req.nextUrl.searchParams.get("costKnown") === "true",
    });
    return NextResponse.json({ outcome });
  } catch (error) {
    console.error("[api/company/economics] GET失敗:", error);
    return NextResponse.json({ error: "Economic Outcomeの取得に失敗しました" }, { status: 500 });
  }
}
