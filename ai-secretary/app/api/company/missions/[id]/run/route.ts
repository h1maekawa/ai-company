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
    const result = await runMission(params.id);
    return result.ok
      ? NextResponse.json({ ok: true, ...result.data })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "EXECUTION_BUSY"
            ? "別の実行が進行中です。終了後に再開してください"
            : error instanceof Error &&
                error.message === "LOCAL_RUNNER_STORAGE_REQUIRED"
              ? "この環境では内部実行を利用できません。ローカル保存環境が必要です"
              : "実行できませんでした",
      },
      { status: 409 },
    );
  }
}
