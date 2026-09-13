import { NextRequest, NextResponse } from "next/server";
import { startMission } from "@/app/lib/company/execution/service";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";

/** POST /api/company/missions/:id/start — Money Quest を開始する（Phase 6 §3） */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!isSameOriginMutation(req))
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try {
    const result = await startMission({ missionId: params.id });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, mission: result.data.mission });
  } catch (error) {
    console.error("[api/company/missions/start] 失敗:", error);
    return NextResponse.json({ error: "ミッションの開始に失敗しました" }, { status: 500 });
  }
}
