import type { NextRequest } from "next/server";

export function isSameOriginMutation(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === req.nextUrl.origin);
}
