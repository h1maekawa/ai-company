import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { dryRunCareerBuffer } from "@/app/lib/content/career/bufferGate";
import { careerId } from "@/app/lib/content/career/ids";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const state = loadCareerState();
    const report = dryRunCareerBuffer(state);

    state.audit.unshift({
      id: careerId("career_audit"),
      divisionId: "career",
      action: "buffer_dry_run_executed",
      at: report.timestamp,
      details: {
        totalPosts: report.totalPostsChecked,
        eligible: report.eligibleCount,
        blocked: report.blockedCount,
        excluded: report.excludedCount,
      },
    });

    saveCareerState(state);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DRY_RUN_FAILED" }, { status: 500 });
  }
}
