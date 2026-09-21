import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const state = await loadExecutionState();
  return NextResponse.json({ candidates: state.skillCandidates, proposed: state.skillCandidates.filter((candidate) => candidate.status === "PROPOSED") });
}
