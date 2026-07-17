import { NextRequest, NextResponse } from "next/server";
import { listSkills } from "@/app/lib/skills";

/**
 * GET /api/skills
 *
 * Read-only endpoint that returns the registered Skill list (app/lib/skills/registry.ts).
 * No execution, no writes — this only exposes what's registered so the Skill Registry can
 * be inspected without reading source code.
 *
 * Phase3A: extended the response to include description/status/implemented alongside the
 * original id/name/category/allowedSecretaries fields (additive change, nothing removed).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const skills = listSkills().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      allowedSecretaries: s.allowedSecretaries,
      status: s.status,
      implemented: s.status === "implemented",
    }));

    return NextResponse.json({ skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Skills API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
