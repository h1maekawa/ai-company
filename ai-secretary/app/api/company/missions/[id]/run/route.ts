import { NextRequest, NextResponse } from "next/server";
import { runMission } from "@/app/lib/company/execution/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin)
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try {
    const result = await runMission(params.id, req.headers.get("idempotency-key") ?? undefined);
    return result.ok
      ? NextResponse.json({ ok: true, ...result.data })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "実行できませんでした",
      },
      { status: 409 },
    );
  }
}
