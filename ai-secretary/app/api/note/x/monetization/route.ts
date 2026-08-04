import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, savePerformance } from "@/app/lib/note/research/store";
import { monetizationProjection } from "@/app/lib/note/research/performance";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const file = await loadPerformance();
  return NextResponse.json({
    progress: file.revenueProgress,
    projection: monetizationProjection(file.revenueProgress),
    rules: file.monetizationRules,
    disclaimer: "条件を満たしても参加承認や収益額を保証するものではありません。",
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const file = await loadPerformance();
  file.revenueProgress = {
    ...file.revenueProgress,
    ...body,
    requiredOrganicImpressions: file.revenueProgress.requiredOrganicImpressions,
    requiredVerifiedFollowers: file.revenueProgress.requiredVerifiedFollowers,
    lastCheckedAt: new Date().toISOString(),
  };
  await savePerformance(file);
  return NextResponse.json({ progress: file.revenueProgress });
}
