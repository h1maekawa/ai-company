import { NextRequest, NextResponse } from "next/server";
import { captureToInbox, prepareCandidate } from "@/app/lib/knowledge/lifecycle";
import { organizeCaptureItem } from "@/app/lib/knowledge/organize";
import { isCaptureSource } from "@/app/lib/knowledge/types";
import { createHash } from "node:crypto";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

/**
 * POST /api/knowledge/capture
 * body: { content: string, source?: CaptureSource, title?: string, organize?: boolean }
 *
 * 会話/Grilling/Research/Skill/Workflow からの学び候補を Inbox へ Capture し、
 * 既定で AI整理 → Candidate 化まで行う（organize=false で captured のまま）。
 * 正式Knowledgeへの自動昇格はしない（Human Approval が必要 = /weekly-review）。
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try {
    const body = await req.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "content は必須です。" }, { status: 400 });
    }
    const source = isCaptureSource(body?.source) ? body.source : "manual";
    const title = typeof body?.title === "string" ? body.title : undefined;
    const doOrganize = body?.organize !== false;
    const key = req.headers.get("idempotency-key") ?? createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const store = getExecutionStore();
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("knowledge-capture", key);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("knowledge-capture", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });

    const captured = await captureToInbox({ content, source, title });

    if (!doOrganize) {
      const response = { status: "captured", item: captured };
      await store.completeIdempotency("knowledge-capture", key, response);
      return NextResponse.json(response);
    }

    const organize = await organizeCaptureItem(content);
    const candidate = await prepareCandidate(captured.path, organize);

    const response = { status: "candidate", item: candidate, organize };
    await store.completeIdempotency("knowledge-capture", key, response);
    return NextResponse.json(response);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/capture:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
