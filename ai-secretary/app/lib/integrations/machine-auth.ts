/**
 * 機械（cron / ローカルランナー）からのアクセス認証。
 *
 * middleware.ts のセッションCookieはブラウザ前提なので、
 * サーバー間・ローカルランナーからの呼び出しはここで別途認証する。
 * 秘密が未設定なら「拒否」する（開けっ放しにしない）。
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Vercel Cron からの呼び出しを検証する */
export function verifyCronSecret(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "CRON_SECRET が未設定です" };

  const token =
    bearer(req) ?? new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (!token) return { ok: false, reason: "認証情報がありません" };
  return safeEqual(token, secret) ? { ok: true } : { ok: false, reason: "CRON_SECRET が一致しません" };
}

/** ローカルのPlaywrightランナーからの呼び出しを検証する */
export function verifyRunnerToken(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.LOCAL_RUNNER_TOKEN;
  if (!secret) return { ok: false, reason: "LOCAL_RUNNER_TOKEN が未設定です" };

  const token = bearer(req) ?? req.headers.get("x-runner-token");
  if (!token) return { ok: false, reason: "認証情報がありません" };
  return safeEqual(token, secret)
    ? { ok: true }
    : { ok: false, reason: "LOCAL_RUNNER_TOKEN が一致しません" };
}
