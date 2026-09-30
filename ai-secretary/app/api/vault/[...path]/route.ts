import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getVaultFile, saveVaultFile, VaultApiError, VaultConflictError } from "@/app/lib/vault";
import { isManagedVaultPath } from "@/app/lib/vault/managed-files";
import { resolveRawPath, VAULT_ROOT } from "@/app/lib/runtime/paths";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";
import { readLimitedBody } from "@/app/lib/auth/read-limited-body";

type Context = { params: Promise<{ path: string[] }> };
const MAX_BODY_BYTES = 1024 * 1024;

async function authorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  try { return Boolean(secret && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret))); }
  catch { return false; }
}

function documentPath(segments: unknown): string | null {
  if (!Array.isArray(segments) || segments.length < 2 || segments.some(segment => typeof segment !== "string" || !segment || segment === "." || segment === ".." || segment.startsWith(".") || /[\/\\\0%?#]/.test(segment))) return null;
  const filePath = segments.join("/");
  if (!filePath.startsWith("memory/") || !filePath.endsWith(".md") || filePath.length > 512) return null;
  return filePath;
}

function localPathSafe(filePath: string): boolean {
  if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN) return true;
  if (!VAULT_ROOT) return false;
  const root = fs.realpathSync(VAULT_ROOT);
  const candidate = resolveRawPath(filePath);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return false;
  let current = root;
  for (const segment of filePath.split("/")) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return false;
  }
  return true;
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!(await authorized(request))) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  const filePath = documentPath((await context.params).path);
  if (!filePath) return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  try {
    if (!localPathSafe(filePath)) return NextResponse.json({ error: "Document path is not allowed" }, { status: 403 });
    const { content, sha } = await getVaultFile(filePath);
    if (!content && !sha) return NextResponse.json({ error: "File not found" }, { status: 404 });
    return NextResponse.json({ content, sha });
  } catch {
    return NextResponse.json({ error: "Vault read failed" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!(await authorized(request))) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  const filePath = documentPath((await context.params).path);
  if (!filePath) return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  // Human-managed Knowledge requires the approval grant enforced by /api/knowledge/promote.
  if (filePath.startsWith("memory/knowledge/") || !isManagedVaultPath(filePath)) return NextResponse.json({ error: "Document is protected" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { return NextResponse.json({ error: "Invalid origin" }, { status: 403 }); }
    if (originHost !== request.headers.get("x-forwarded-host") && originHost !== request.nextUrl.host) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  let raw: string | null;
  try { raw = await readLimitedBody(request, MAX_BODY_BYTES); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (raw === null) return NextResponse.json({ error: "Document too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { content, sha } = body as Record<string, unknown>;
  if (typeof content !== "string" || content.length === 0 || (sha !== undefined && typeof sha !== "string")) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    if (!localPathSafe(filePath)) return NextResponse.json({ error: "Document path is not allowed" }, { status: 403 });
    const result = await saveVaultFile(filePath, content, sha as string | undefined);
    return NextResponse.json({ success: true, sha: result.sha });
  } catch (error) {
    if (error instanceof VaultConflictError) return NextResponse.json({ error: "Document changed; reload before saving" }, { status: 409 });
    if (error instanceof VaultApiError && error.status === 422) return NextResponse.json({ error: "Invalid document update" }, { status: 422 });
    return NextResponse.json({ error: "Vault write failed" }, { status: 503 });
  }
}
