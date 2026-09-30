import { NextRequest, NextResponse } from "next/server";
import { flowCardActivity } from "@/app/lib/finance/flowClient";
import { requireFinanceSession } from "@/app/lib/finance/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireFinanceSession(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const month = params.get("month") ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
  const limit = Number(params.get("limit") ?? "20");
  try {
    return NextResponse.json(await flowCardActivity(month, limit, params.get("cursor") ?? undefined), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "明細の指定が不正です" }, { status: 400 }); }
}
