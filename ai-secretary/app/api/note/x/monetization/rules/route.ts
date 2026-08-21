import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, savePerformance } from "@/app/lib/note/research/store";
import type { MonetizationRule } from "@/app/lib/note/research/types";

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { rules?: MonetizationRule[] };
  if (!Array.isArray(body.rules)) return NextResponse.json({ error: "rulesが必要です" }, { status: 400 });
  const file = await loadPerformance();
  file.monetizationRules = body.rules.filter((rule) =>
    rule.program === "revenue-sharing" || rule.program === "subscriptions"
  );
  await savePerformance(file);
  return NextResponse.json({ rules: file.monetizationRules });
}
