import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { listSkills } from "@/app/lib/skills/registry";
import { skillEffectiveness } from "@/app/lib/company/evolution/skillObservability";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const state = await loadExecutionState();
    const events = state.runtime?.skillExecutions ?? [];
    return NextResponse.json({ effectiveness: listSkills().map((skill) => ({ definition: skill, metrics: skillEffectiveness(skill.id, events, state.missions) })), improvementCandidates: state.runtime?.skillImprovementCandidates ?? [], retentionLimit: 1000 });
  } catch { return NextResponse.json({ effectiveness: listSkills().map((skill) => ({ definition: skill, metrics: skillEffectiveness(skill.id, null) })), improvementCandidates: null, retentionLimit: 1000 }); }
}
