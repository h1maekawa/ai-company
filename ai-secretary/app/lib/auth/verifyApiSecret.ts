import { NextRequest, NextResponse } from "next/server";

export function verifyApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;

  if (!secret) {
    const message = [
      "サーバー設定エラー: API_SECRET が未設定です。",
      ".env.local に API_SECRET を設定してください。",
      "設定後に npm run dev を再起動してください。",
      "ローカル検証では NEXT_PUBLIC_API_SECRET も同じ値にしてください。",
    ].join("\n");

    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
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
