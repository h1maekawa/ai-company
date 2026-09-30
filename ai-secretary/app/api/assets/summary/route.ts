import { NextRequest, NextResponse } from "next/server";
import { flowFinanceSummary } from "@/app/lib/finance/flowClient";
import { requireFinanceSession } from "@/app/lib/finance/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireFinanceSession(request);
  if (denied) return denied;
  const month = request.nextUrl.searchParams.get("month") ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
  try {
    return NextResponse.json(await flowFinanceSummary(month), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "月の指定が不正です" }, { status: 400 }); }
}
