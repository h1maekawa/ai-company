import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, revokeSessionToken } from "@/app/lib/auth/session";

export async function POST(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  try {
    if (secret) await revokeSessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret);
  } catch {
    return NextResponse.json({ error: "ログアウトを完了できません" }, { status: 503 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
