import { NextRequest, NextResponse } from "next/server";
import { careerId } from "@/app/lib/content/career/ids";
import { checkCareerPrivacy } from "@/app/lib/content/career/privacy";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";

export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await careerRequestAllowed(request, true))) return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const state = loadCareerState();
    const item = state.knowledgeItems.find((candidate) => candidate.id === id && candidate.divisionId === "career");
    if (!item) return NextResponse.json({ error: "CAREER_KNOWLEDGE_NOT_FOUND" }, { status: 404 });
    if (typeof body.bodyPrivate !== "string" || body.bodyPrivate.length < 20 || body.bodyPrivate.length > 30_000) return NextResponse.json({ error: "INVALID_KNOWLEDGE_BODY" }, { status: 400 });
    item.bodyPrivate = body.bodyPrivate;
    item.summary = body.bodyPrivate.split(/[。！？\n]/u)[0].slice(0, 120);
    item.privacyRisk = checkCareerPrivacy(body.bodyPrivate).risk;
    item.verificationStatus = "human_verified";
    item.updatedAt = new Date().toISOString();
    state.audit.unshift({ id: careerId("career_audit"), divisionId: "career", action: "knowledge_reviewed", at: item.updatedAt, details: { knowledgeItemId: item.id, privacyRisk: item.privacyRisk } });
    saveCareerState(state);
    return NextResponse.json({ item, findings: checkCareerPrivacy(item.bodyPrivate).findings });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CAREER_KNOWLEDGE_UPDATE_FAILED" }, { status: 400 }); }
}
