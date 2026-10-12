import { NextRequest, NextResponse } from "next/server";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { activateModelVersion } from "@/app/lib/content/creator-thinking/modelVersioning";
import { loadModelVersions, saveModelVersions } from "@/app/lib/content/creator-thinking/modelVersioningStore";

/**
 * DRAFT版をACTIVEへ昇格する唯一の入口（section12: Human Review必須、同時ACTIVEは1つだけ）。
 */
export async function POST(req: NextRequest, props: { params: Promise<{ version: string }> }) {
  const params = await props.params;
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const approvedBy = typeof body.approvedBy === "string" ? body.approvedBy.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!approvedBy) return NextResponse.json({ error: "APPROVER_REQUIRED" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });

  const { versions, history } = await loadModelVersions();
  try {
    const result = activateModelVersion(versions, decodeURIComponent(params.version), approvedBy, reason);
    await saveModelVersions({ versions: result.versions, history: [...history, result.history] });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ACTIVATION_FAILED" }, { status: 409 });
  }
}
