import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "../auth/session";

export async function requireFinanceSession(request: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "認証を利用できません" }, { status: 503 });
  try {
    if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret)) return null;
  } catch { return NextResponse.json({ error: "認証を一時的に利用できません" }, { status: 503 }); }
  return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
}
