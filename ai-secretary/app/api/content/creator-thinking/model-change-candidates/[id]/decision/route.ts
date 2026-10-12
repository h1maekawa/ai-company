import { NextRequest, NextResponse } from "next/server";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import {
  applyModelChangeCandidate,
  decideModelChangeCandidate,
} from "@/app/lib/content/creator-thinking/modelVersioning";
import {
  loadModelChangeCandidates,
  loadModelVersions,
  saveModelChangeCandidates,
  saveModelVersions,
} from "@/app/lib/content/creator-thinking/modelVersioningStore";

/**
 * ModelChangeCandidateのHuman Review（section13/19: Approve / Rejectのみ）。
 * APPROVEDの場合、新しいModel VersionをDRAFTとして追加するだけで、ACTIVEへは昇格しない
 * （ACTIVE化は別途 model-versions/[version]/activate が必要）。
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as "APPROVED" | "REJECTED";
  const approvedBy = typeof body.approvedBy === "string" ? body.approvedBy.trim() : "";
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
  }
  if (!approvedBy) return NextResponse.json({ error: "APPROVER_REQUIRED" }, { status: 400 });

  const changeCandidates = await loadModelChangeCandidates();
  const candidate = changeCandidates.find((item) => item.id === params.id);
  if (!candidate) return NextResponse.json({ error: "MODEL_CHANGE_CANDIDATE_NOT_FOUND" }, { status: 404 });

  try {
    const decided = decideModelChangeCandidate(candidate, decision, approvedBy);
    const nextCandidates = changeCandidates.map((item) => (item.id === decided.id ? decided : item));

    if (decision === "REJECTED") {
      await saveModelChangeCandidates(nextCandidates);
      return NextResponse.json({ changeCandidate: decided });
    }

    const { versions, history } = await loadModelVersions();
    const base = versions.find((model) => model.version === decided.baseVersion);
    if (!base) return NextResponse.json({ error: "BASE_MODEL_VERSION_NOT_FOUND" }, { status: 409 });

    const nextModel = applyModelChangeCandidate(base, decided);
    await saveModelVersions({ versions: [...versions, nextModel], history });
    await saveModelChangeCandidates(
      nextCandidates.map((item) => (item.id === decided.id ? { ...item, status: "APPLIED" } : item))
    );
    return NextResponse.json({ changeCandidate: decided, newDraftVersion: nextModel });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DECISION_FAILED" }, { status: 409 });
  }
}
