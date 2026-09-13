import { NextRequest, NextResponse } from "next/server";
import { createManualMission } from "@/app/lib/company/execution/service";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req))
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try {
    const body = (await req.json()) as { title?: unknown; description?: unknown };
    const result = await createManualMission({
      title: body.title,
      description: body.description,
      idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
    });
    return result.ok
      ? NextResponse.json({ ok: true, mission: result.data.mission }, { status: 201 })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
