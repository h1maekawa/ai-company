import { NextRequest, NextResponse } from "next/server";
import { completeMission } from "@/app/lib/company/execution/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/company/missions/:id/complete（Phase 6 §4）
 * 承認待ちのActionが残っている間は完了できない。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const result = await completeMission({ missionId: params.id });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, mission: result.data.mission });
  } catch (error) {
    console.error("[api/company/missions/complete] 失敗:", error);
    return NextResponse.json({ error: "ミッションの完了に失敗しました" }, { status: 500 });
  }
}
