/**
 * Slackリクエストの署名検証。
 *
 * これが無いと誰でも投稿コマンドを叩けてしまうため、必ず通す。
 * Edge/Nodeどちらでも動くよう Web Crypto を使う。
 */

const VERSION = "v0";
/** 5分より古いリクエストはリプレイ攻撃とみなす */
const MAX_SKEW_SECONDS = 60 * 5;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 生のリクエストボディと Slack のヘッダから署名を検証する。
 * ボディは必ず「パース前の文字列」を渡すこと。
 */
export async function verifySlackRequest(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): Promise<VerifyResult> {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: "SLACK_SIGNING_SECRET が未設定です" };
  if (!timestamp || !signature) return { ok: false, reason: "署名ヘッダがありません" };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "リクエストが古すぎます" };
  }

  const expected = `${VERSION}=${await hmacHex(secret, `${VERSION}:${timestamp}:${rawBody}`)}`;
  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, reason: "署名が一致しません" };
  }
  return { ok: true };
}

/** Slackへ返す軽い応答 */
export function slackText(text: string): Response {
  return new Response(JSON.stringify({ response_type: "ephemeral", text }), {
    headers: { "Content-Type": "application/json" },
  });
}
