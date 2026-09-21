import { NextRequest, NextResponse } from "next/server";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = await loadExecutionState();
  const candidate = state.contentDraftCandidates.find((item) => item.id === params.id);
  return candidate ? NextResponse.json({ candidate }) : NextResponse.json({ error: "Draft Candidateが見つかりません" }, { status: 404 });
}

/** Human light-edit boundary. Lineage, review state, type and status are server-owned. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ candidate: unknown }>("content-draft-candidate-edit", idempotencyKey);
  if (prior) return NextResponse.json(prior);
  const state = await loadExecutionState();
  const candidate = state.contentDraftCandidates.find((item) => item.id === params.id);
  if (!candidate) return NextResponse.json({ error: "Draft Candidateが見つかりません" }, { status: 404 });
  if (candidate.status !== "CANDIDATE") return NextResponse.json({ error: "承認判断後のCandidateは編集できません" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const draftBody = typeof body.body === "string" ? body.body.trim() : candidate.body;
  if (!draftBody) return NextResponse.json({ error: "本文は必須です" }, { status: 400 });
  if (!(await store.claimIdempotency("content-draft-candidate-edit", idempotencyKey))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  const updated = { ...candidate, title: typeof body.title === "string" ? body.title.trim().slice(0, 120) : candidate.title, body: draftBody, updatedAt: new Date().toISOString() };
  await saveExecutionState({ ...state, contentDraftCandidates: state.contentDraftCandidates.map((item) => item.id === updated.id ? updated : item) });
  const response = { candidate: updated };
  await store.completeIdempotency("content-draft-candidate-edit", idempotencyKey, response);
  return NextResponse.json(response);
}
