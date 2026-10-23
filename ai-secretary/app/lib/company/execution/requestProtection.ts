import type { NextRequest } from "next/server";

export function isSameOriginMutation(
  req: NextRequest,
  options: { allowDevelopmentHostMatch?: boolean } = {},
): boolean {
  const origin = req.headers.get("origin");
  if (options.allowDevelopmentHostMatch && process.env.NODE_ENV === "development" && origin) {
    let parsedOrigin: URL;
    try { parsedOrigin = new URL(origin); }
    catch { return false; }
    // Origin headers are serialized origins, never arbitrary URLs or "null".
    if (parsedOrigin.origin !== origin) return false;

    // Next dev can normalize request.nextUrl.host while the browser uses the
    // exact loopback host it opened (localhost or 127.0.0.1). Match Host for
    // that request; do not trust X-Forwarded-Host in an unproxied dev server.
    const host = req.headers.get("host");
    if (host) {
      try {
        const requestOrigin = new URL(`${req.nextUrl.protocol}//${host}`);
        const isAllowedLoopback = requestOrigin.protocol === "http:"
          && requestOrigin.port === "3000"
          && ["localhost", "127.0.0.1"].includes(requestOrigin.hostname);
        if (isAllowedLoopback) return parsedOrigin.origin === requestOrigin.origin;
      } catch {
        return false;
      }
    }
  }

  return Boolean(origin && origin === req.nextUrl.origin);
}
