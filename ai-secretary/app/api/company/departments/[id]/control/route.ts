import { NextRequest, NextResponse } from "next/server";
import { DEPARTMENT_IDS, DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import { listSkills } from "@/app/lib/skills/registry";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { loadLearningCandidates } from "@/app/lib/fund/learning/store";
import {
  appendHumanDecisionFeedback,
  createHumanDecisionFeedback,
  departmentSkillIds,
  emptyRunnerState,
  upsertKpiGoal,
  validateKpiGoalInput,
} from "@/app/lib/mobile-ceo/controlCenter";

export const dynamic = "force-dynamic";

const isDepartment = (id: string): id is NavigationDepartmentId => DEPARTMENT_IDS.includes(id as NavigationDepartmentId);

/**
 * Department Control Center の CEO確認データ。
 * Skill Proposal は Skill.allowedSecretaries と所属AI社員の intersection で部門へ割り当てる。
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDepartment(params.id)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 404 });
  const department = DEPARTMENT_NAV_BY_ID[params.id];
  const skills = listSkills();
  const skillIds = new Set(departmentSkillIds(skills, department.employeeIds));
  const employees = new Set(department.employeeIds);
  try {
    const state = await loadExecutionState();
    const feedback = (state.runtime?.humanDecisionFeedback ?? []).filter((record) => record.departmentId === department.id);
    const skillImprovements = (state.runtime?.skillImprovementCandidates ?? [])
      .filter((candidate) => skillIds.has(candidate.skillId))
      .map((candidate) => ({ ...candidate, skillName: skills.find((skill) => skill.id === candidate.skillId)?.name ?? candidate.skillId }));
    const skillCandidates = state.skillCandidates.filter((candidate) => candidate.suggestedAgents.some((agentId) => employees.has(agentId)));
    return NextResponse.json({
      departmentId: department.id,
      skillIds: [...skillIds],
      skillImprovements,
      skillCandidates,
      feedback,
      kpiGoals: (state.runtime?.departmentKpiGoals ?? []).filter((goal) => goal.departmentId === department.id),
    });
  } catch {
    return NextResponse.json({ departmentId: department.id, skillIds: [...skillIds], skillImprovements: null, skillCandidates: null, feedback: null, kpiGoals: null, error: "EXECUTION_STORE_UNAVAILABLE" }, { status: 503 });
  }
}

/**
 * Human actionのみ。
 * - set-kpi-goal: CEOが入力/採用した目標だけを保存する（AIは確定しない）
 * - constitution-decision: Investment LearningのproposedPrincipleを「人間が認めた採用候補」にする。
 *   Policy / Constitution本文・Recommendation Scoreは変更しない。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!isDepartment(params.id)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 404 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (body.confirmedByHuman !== true) return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
  if (!["set-kpi-goal", "constitution-decision"].includes(body.action)) return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const departmentId = params.id;

  let validate: () => Promise<void>;
  if (body.action === "set-kpi-goal") {
    try { validateKpiGoalInput(body, departmentId); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_KPI_GOAL" }, { status: 400 }); }
    validate = async () => undefined;
  } else {
    if (departmentId !== "fund") return NextResponse.json({ error: "CONSTITUTION_IS_FUND_ONLY" }, { status: 400 });
    if (!["APPROVED", "REJECTED"].includes(body.decision) || typeof body.learningId !== "string") return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
    validate = async () => {
      const learning = (await loadLearningCandidates()).find((item) => item.id === body.learningId);
      if (!learning?.proposedPrinciple) throw new Error("CONSTITUTION_PROPOSAL_NOT_FOUND");
    };
  }

  try { await validate(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_REQUEST" }, { status: 404 }); }
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult("department-control", key);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("department-control", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const result = await executionTransaction(async () => {
      const state = await loadExecutionState();
      const runtime = state.runtime ?? emptyRunnerState();
      if (body.action === "set-kpi-goal") {
        const goal = validateKpiGoalInput(body, departmentId);
        await saveExecutionState({ ...state, runtime: { ...runtime, departmentKpiGoals: upsertKpiGoal(runtime.departmentKpiGoals, goal) } });
        return { goal, aiConfirmed: false };
      }
      const feedback = createHumanDecisionFeedback({ id: `human_decision_${key}`, targetType: "constitution-proposal", targetId: body.learningId, departmentId, decision: body.decision, note: body.note });
      await saveExecutionState({ ...state, runtime: { ...runtime, humanDecisionFeedback: appendHumanDecisionFeedback(runtime.humanDecisionFeedback, feedback) } });
      return { feedback, policyChanged: false, recommendationScoreChanged: false };
    });
    await store.completeIdempotency("department-control", key, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CONTROL_ACTION_FAILED" }, { status: 409 });
  }
}
