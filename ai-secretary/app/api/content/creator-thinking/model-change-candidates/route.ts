import { NextResponse } from "next/server";
import { loadModelChangeCandidates, loadModelVersions } from "@/app/lib/content/creator-thinking/modelVersioningStore";

export const dynamic = "force-dynamic";

/** 最低限のHuman Review一覧（section19）: Current Version / Proposed Version / Changes / Evidence */
export async function GET() {
  const [changeCandidates, { versions, history }] = await Promise.all([
    loadModelChangeCandidates(),
    loadModelVersions(),
  ]);
  return NextResponse.json({
    changeCandidates,
    pending: changeCandidates.filter((c) => c.status === "PENDING_REVIEW"),
    versions,
    activeVersion: versions.find((model) => model.status === "ACTIVE") ?? null,
    history,
  });
}
