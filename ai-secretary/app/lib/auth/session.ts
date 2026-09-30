// Session helpers built on Web Crypto for proxy.ts and route handlers.

export const SESSION_COOKIE = "ai_secretary_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
import { isSessionRevoked, revokeSession } from "./security-store";

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
  const version = process.env.SESSION_VERSION || "1";
  const id = crypto.randomUUID();
  const payload = `${Date.now() + SESSION_TTL_MS}:${version}:${id}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra) return false;

  const [expiry, version, id] = payload.split(":");
  const exp = Number(expiry);
  if (!Number.isSafeInteger(exp) || Date.now() > exp || exp > Date.now() + SESSION_TTL_MS || version !== (process.env.SESSION_VERSION || "1") || !/^[0-9a-f-]{36}$/.test(id || "")) return false;

  let signatureValid = false;
  try {
    const key = await hmacKey(secret);
    signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
  return signatureValid && !(await isSessionRevoked(id));
}

export async function revokeSessionToken(token: string | undefined, secret: string): Promise<void> {
  if (!token || !(await verifySessionToken(token, secret))) return;
  const [expiry, , id] = token.split(".")[0].split(":");
  await revokeSession(id, Math.max(1, Math.ceil((Number(expiry) - Date.now()) / 1000)));
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
