import { NextRequest, NextResponse } from "next/server";
import { cancelMission } from "@/app/lib/company/execution/service";

export const dynamic = "force-dynamic";

/** POST /api/company/missions/:id/cancel — 理由を残して中止する（Phase 6 §5） */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await cancelMission({ missionId: params.id, reason: body.reason ?? "" });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, mission: result.data.mission });
  } catch (error) {
    console.error("[api/company/missions/cancel] 失敗:", error);
    return NextResponse.json({ error: "ミッションの中止に失敗しました" }, { status: 500 });
  }
}
