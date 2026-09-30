import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, verifyPassword } from "@/app/lib/auth/session";
import { recordLoginAttempt } from "@/app/lib/auth/security-store";
import { readLimitedBody } from "@/app/lib/auth/read-limited-body";

const MAX_BODY_BYTES = 4096;
const MAX_PASSWORD_LENGTH = 1024;

export async function POST(req: NextRequest) {
  const authPassword = process.env.AUTH_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!authPassword || !sessionSecret) {
    console.error("AUTH_PASSWORD / SESSION_SECRET が未設定です。.env.local または Vercel の環境変数を確認してください。");
    return NextResponse.json({ error: "認証を利用できません" }, { status: 503 });
  }

  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let attempt: { count: number; retryAfter: number };
  try { attempt = await recordLoginAttempt(identity); }
  catch { return NextResponse.json({ error: "認証を一時的に利用できません" }, { status: 503 }); }
  if (attempt.count > 10) return NextResponse.json(
    { error: "試行回数が上限に達しました" },
    { status: 429, headers: { "Retry-After": String(attempt.retryAfter) } }
  );

  let raw: string | null;
  try { raw = await readLimitedBody(req, MAX_BODY_BYTES); }
  catch { return NextResponse.json({ error: "入力が正しくありません" }, { status: 400 }); }
  if (raw === null) return NextResponse.json({ error: "入力が大きすぎます" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).password !== "string") return NextResponse.json({ error: "入力が正しくありません" }, { status: 400 });
  const guess = (body as { password: string }).password;
  if (guess.length === 0 || guess.length > MAX_PASSWORD_LENGTH) return NextResponse.json({ error: "入力が正しくありません" }, { status: 400 });

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
