import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runKakeiSync } from "@/app/lib/kakei/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/cron/kakei-sync — 家計簿アプリの月次集計をVaultへキャッシュ */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  if (process.env.KAKEI_SYNC_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "KAKEI_SYNC_ENABLED=false" });
  }
  try {
    const result = await runKakeiSync(2);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
