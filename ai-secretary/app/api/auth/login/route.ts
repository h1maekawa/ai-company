import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, verifyPassword } from "@/app/lib/auth/session";

export async function POST(req: NextRequest) {
  const authPassword = process.env.AUTH_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!authPassword || !sessionSecret) {
    console.error("AUTH_PASSWORD / SESSION_SECRET が未設定です。.env.local または Vercel の環境変数を確認してください。");
    return NextResponse.json(
      { error: "サーバー設定エラー: AUTH_PASSWORD / SESSION_SECRET が未設定です" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  const guess = body?.password ?? "";

  const ok = await verifyPassword(guess, authPassword, sessionSecret);
  if (!ok) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const token = await createSessionToken(sessionSecret);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
