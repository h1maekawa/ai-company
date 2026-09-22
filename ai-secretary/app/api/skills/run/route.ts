import { NextRequest, NextResponse } from "next/server";
import { executeSkill } from "@/app/lib/skills";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { appendSkillExecution, discoverSkillImprovementCandidates, skillExecutionEvent } from "@/app/lib/company/evolution/skillObservability";
import { listSkills } from "@/app/lib/skills/registry";

/**
 * POST /api/skills/run
 *
 * Phase3A: Skill実行API。app/lib/skills/executor.ts の executeSkill() を呼ぶだけの薄いラッパー。
 *
 * 必須仕様:
 * - 認証は middleware.ts のセッションCookieチェックで全APIに一括適用済み
 * - このPhaseではMemoryに保存しない（実行結果をJSONで返すのみ）
 * - executeSkill() 自体が例外を握りつぶす設計だが、リクエストのパースなど
 *   このハンドラ側の失敗もAPI全体を落とさないようtry/catchで包む
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { skillId, secretaryId, input } = body as {
      skillId?: string;
      secretaryId?: string;
      input?: Record<string, unknown>;
    };

    if (!skillId || typeof skillId !== "string") {
      return NextResponse.json({ error: "skillId は必須です" }, { status: 400 });
    }
    if (!secretaryId || typeof secretaryId !== "string") {
      return NextResponse.json({ error: "secretaryId は必須です" }, { status: 400 });
    }

    const startedAt = new Date();
    const result = await executeSkill({
      skillId,
      secretaryId,
      input: input && typeof input === "object" ? input : {},
    });
    const event = skillExecutionEvent({ skillId, agentId: secretaryId, source: "direct", result, startedAt });
    await executionTransaction(async () => {
      const state = await loadExecutionState();
      const runtime = state.runtime ?? { runs: {}, executions: [], artifacts: [], learning: [] };
      const skillExecutions = appendSkillExecution(runtime.skillExecutions ?? [], event);
      const skillImprovementCandidates = discoverSkillImprovementCandidates(listSkills().filter((item) => item.status === "implemented").map((item) => item.id), skillExecutions, runtime.skillImprovementCandidates ?? []);
      await saveExecutionState({ ...state, runtime: { ...runtime, skillExecutions, skillImprovementCandidates } });
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Skills Run API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
