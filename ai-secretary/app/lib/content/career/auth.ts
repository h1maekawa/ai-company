import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

/** Career sources contain private transcripts. Require the normal app session on every route. */
export async function careerRequestAllowed(request: NextRequest, mutation = false): Promise<boolean> {
  if (mutation && !isSameOriginMutation(request)) return false;
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(secret && token && await verifySessionToken(token, secret));
}
