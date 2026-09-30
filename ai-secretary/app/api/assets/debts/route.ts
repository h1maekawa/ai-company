import { NextRequest, NextResponse } from "next/server";
import { flowDebts } from "@/app/lib/finance/flowClient";
import { requireFinanceSession } from "@/app/lib/finance/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireFinanceSession(request);
  if (denied) return denied;

  try {
    return NextResponse.json(await flowDebts(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({
      data: null,
      fetchedAt: null,
      stale: true,
      error: "Flow+から最新値を取得できません",
      configured: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
