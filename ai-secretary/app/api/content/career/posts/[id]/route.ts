import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { careerHash, careerId } from "@/app/lib/content/career/ids";
import { checkCareerFactuality, checkCareerPrivacy } from "@/app/lib/content/career/privacy";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";

export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await careerRequestAllowed(request, true))) return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret || !token || !(await verifySessionToken(token, secret))) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const state = loadCareerState();
    const index = state.posts.findIndex((post) => post.id === id && post.divisionId === "career");
    if (index < 0) return NextResponse.json({ error: "CAREER_POST_NOT_FOUND" }, { status: 404 });
    const post = state.posts[index];
    if (body.action === "approve" && post.status === "approved") return NextResponse.json({ error: "POST_ALREADY_APPROVED" }, { status: 409 });
    if (body.action === "edit") {
      if (post.status === "queued" || post.status === "published") return NextResponse.json({ error: "POST_IMMUTABLE_AFTER_PUBLISH" }, { status: 409 });
      const wasApproved = post.status === "approved";
      if (post.platform === "x" && typeof body.body === "string") post.body = body.body.slice(0, 20_000);
      if (post.platform === "instagram" && Array.isArray(body.slides) && body.slides.length === 5) post.slides = body.slides.map((slide: { headline?: string; body?: string }, position: number) => ({ position: position + 1, headline: String(slide.headline ?? "").slice(0, 100), body: String(slide.body ?? "").slice(0, 500) }));
      if (post.platform === "instagram" && typeof body.caption === "string") post.caption = body.caption.slice(0, 5_000);
      const content = post.platform === "x" ? post.body : `${post.caption}\n${post.slides.map((slide) => `${slide.headline}\n${slide.body}`).join("\n")}`;
      post.anonymityCheck = checkCareerPrivacy(content).risk;
      post.factualityCheck = checkCareerFactuality(content);
      post.contentHash = careerHash(content);
      if (wasApproved) {
        post.status = "review";
        post.approvedBy = null;
        post.approvedAt = null;
      }
      post.updatedAt = new Date().toISOString();
      state.audit.unshift({ id: careerId("career_audit"), divisionId: "career", action: wasApproved ? "draft_edited_approval_revoked" : "draft_edited", at: post.updatedAt, details: { postId: post.id, wasApproved } });
    } else if (body.action === "approve") {
      const source = state.knowledgeItems.find((item) => item.id === post.knowledgeItemId && item.divisionId === "career");
      if (!source || source.verificationStatus !== "human_verified" || source.privacyRisk !== "clear") return NextResponse.json({ error: "KNOWLEDGE_VERIFICATION_REQUIRED" }, { status: 409 });
      const content = post.platform === "x" ? post.body : `${post.caption}\n${post.slides.map((slide) => `${slide.headline}\n${slide.body}`).join("\n")}`;
      const privacy = checkCareerPrivacy(content);
      if (privacy.risk !== "clear" || checkCareerFactuality(content) !== "clear" || post.sponsorshipFlag) return NextResponse.json({ error: "REVIEW_GATES_FAILED", privacyFindings: privacy.findings }, { status: 409 });
      const sessionId = token.split(".")[0].split(":")[2];
      post.status = "approved"; post.approvedBy = `authenticated-session:${careerHash(sessionId).slice(0, 16)}`; post.approvedAt = new Date().toISOString(); post.updatedAt = post.approvedAt;
      state.audit.unshift({ id: careerId("career_audit"), divisionId: "career", action: "human_approved", at: post.approvedAt, details: { postId: post.id, contentHash: post.contentHash } });
    } else return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
    state.posts[index] = post;
    saveCareerState(state);
    return NextResponse.json({ post });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CAREER_POST_UPDATE_FAILED" }, { status: 400 }); }
}
