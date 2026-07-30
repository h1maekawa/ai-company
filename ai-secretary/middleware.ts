import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|apple-touch-icon).*)",
  ],
};

/**
 * ブラウザのセッションCookieを持たない呼び出し元。
 * これらは各ルート側で固有の認証を行う:
 *   Slack   → リクエスト署名（SLACK_SIGNING_SECRET）
 *   cron    → CRON_SECRET
 *   runner  → LOCAL_RUNNER_TOKEN
 * ここを素通しにしてもルート側で必ず検証するため、認証は外れない。
 */
const MACHINE_ROUTES = [
  "/api/integrations/slack/",
  "/api/cron/",
  "/api/local-runner/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  if (MACHINE_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = secret ? await verifySessionToken(token, secret) : false;

  if (valid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}
