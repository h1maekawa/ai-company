// Edge + Node compatible session helpers built on Web Crypto (crypto.subtle),
// so the same code runs in middleware.ts (Edge runtime) and route handlers (Node runtime).

export const SESSION_COOKIE = "ai_secretary_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

export async function createSessionToken(secret: string): Promise<string> {
  const payload = String(Date.now() + SESSION_TTL_MS);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  try {
    const key = await hmacKey(secret);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

// Constant-time password check: reuses HMAC-verify (which is constant-time
// internally) instead of comparing strings directly.
export async function verifyPassword(
  guess: string,
  correct: string,
  secret: string
): Promise<boolean> {
  const key = await hmacKey(secret);
  const correctSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(correct));
  return crypto.subtle.verify(
    "HMAC",
    key,
    correctSig,
    new TextEncoder().encode(guess)
  );
}
