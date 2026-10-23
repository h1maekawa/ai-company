import { NextRequest, NextResponse } from "next/server";
import { listSkills } from "@/app/lib/skills";
import { getSkillImplementation } from "@/app/lib/skills/implementationRegistry";

/**
 * Read-only inventory of registered skills and their handler registration state.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const skills = listSkills().map((skill) => {
      const hasRuntime = Boolean(getSkillImplementation(skill.id));
      const handlerAvailable = skill.status === "implemented" && hasRuntime;
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        allowedSecretaries: skill.allowedSecretaries,
        status: skill.status,
        registered: true,
        implemented: skill.status === "implemented",
        handlerAvailable,
        // This is static handler registration, not a live provider/runtime probe.
        availabilityReason: handlerAvailable
          ? null
          : skill.status !== "implemented"
            ? "SKILL_PLANNED"
            : "NO_RUNTIME_IMPLEMENTATION",
      };
    });

    return NextResponse.json({
      skills,
      summary: {
        registeredCount: skills.length,
        implementedCount: skills.filter((skill) => skill.implemented).length,
        handlerAvailableCount: skills.filter((skill) => skill.handlerAvailable).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Skills API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
