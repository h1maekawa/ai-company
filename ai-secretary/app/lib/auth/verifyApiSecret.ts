import { NextRequest, NextResponse } from "next/server";

export function verifyApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;

  if (!secret) {
    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: "サーバー設定エラー: API_SECRET が未設定です" },
        { status: 500 }
      );
    }
    return null; // 開発環境はスルー
  }

  const authHeader = req.headers.get("x-api-secret");
  if (authHeader !== secret) {
    return NextResponse.json(
      { error: "認証エラー: アクセスが拒否されました" },
      { status: 401 }
    );
  }

  return null; // 認証OK
}
