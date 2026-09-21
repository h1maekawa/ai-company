import { NextRequest, NextResponse } from "next/server";
import { createContentCandidate } from "@/app/lib/content/core/types";
import { loadContentCore, saveContentCore } from "@/app/lib/content/core/store";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const { candidates } = await loadContentCore();
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[api/content/candidates] GET失敗:", error);
    return NextResponse.json({ error: "候補の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST { action: "create", ...fields }                新規候補（常にsuggested）
 * PATCH { id, status: "approved"|"rejected"|"converted" }  本人操作でのみ状態遷移
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  try {
    const body = await req.json();
    const key = req.headers.get("idempotency-key") ?? createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const store = getExecutionStore();
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("content-candidate", key);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("content-candidate", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    const candidate = createContentCandidate({
      title: body.title ?? "",
      summary: body.summary ?? "",
      sourceType: body.sourceType ?? "manual",
      sourceIds: body.sourceIds ?? [],
      whyInteresting: body.whyInteresting ?? "",
      suggestedAngle: body.suggestedAngle,
      suggestedCategory: body.suggestedCategory,
      evidence: body.evidence ?? [],
    });
    const file = await loadContentCore();
    const next = await saveContentCore({ ...file, candidates: [candidate, ...file.candidates] });
    const response = { candidate, candidates: next.candidates };
    await store.completeIdempotency("content-candidate", key, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/content/candidates] POST失敗:", error);
    return NextResponse.json({ error: "候補の作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    const status = body.status;
    if (!id || !["approved", "rejected", "converted"].includes(status)) {
      return NextResponse.json({ error: "id と有効な status が必要です" }, { status: 400 });
    }
    const file = await loadContentCore();
    const candidates = file.candidates.map((c) => (c.id === id ? { ...c, status } : c));
    const next = await saveContentCore({ ...file, candidates });
    return NextResponse.json({ candidates: next.candidates });
  } catch (error) {
    console.error("[api/content/candidates] PATCH失敗:", error);
    return NextResponse.json({ error: "候補の更新に失敗しました" }, { status: 500 });
  }
}
