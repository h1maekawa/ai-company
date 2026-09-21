import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { captureToInbox } from "@/app/lib/knowledge/lifecycle";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const sourcePage = typeof body.sourcePage === "string" && body.sourcePage.startsWith("/") && !body.sourcePage.includes("\n") ? body.sourcePage.slice(0, 200) : "/";
  if (!content) return NextResponse.json({ error: "EMPTY_MEMO" }, { status: 400 });
  const department = sourcePage.match(/^\/ceo\/departments\/(creator|fund|operations|knowledge|planning|engineering)(?:\/|$)/)?.[1];
  const key = req.headers.get("idempotency-key") ?? createHash("sha256").update(`${content}:${sourcePage}`).digest("hex");
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ ok: boolean; id: string }>("quick-memo", key);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("quick-memo", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  const item = await captureToInbox({ content: `${content}\n\nSource page: ${sourcePage}${department ? `\nSource department: ${department}` : ""}`, source: "manual", title: "CEO Quick Memo" });
  const response = { ok: true, id: item.frontmatter.id, status: "captured", sourceDepartment: department ?? null };
  await store.completeIdempotency("quick-memo", key, response);
  return NextResponse.json(response);
}
