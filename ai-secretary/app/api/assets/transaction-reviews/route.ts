import { NextRequest, NextResponse } from "next/server";
import { categorizeFlowTransaction, flowTransactionReviews } from "@/app/lib/finance/flowClient";
import { requireFinanceSession } from "@/app/lib/finance/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const currentMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());

export async function GET(request: NextRequest) {
  const denied = await requireFinanceSession(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await flowTransactionReviews(request.nextUrl.searchParams.get("month") ?? currentMonth()), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "確認待ち取引を取得できません" }, { status: 502 }); }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireFinanceSession(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; category?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.category !== "string") return NextResponse.json({ error: "取引とカテゴリを選択してください" }, { status: 400 });
  try {
    return NextResponse.json(await categorizeFlowTransaction(body.id, body.category), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "カテゴリを保存できません" }, { status: 502 }); }
}
