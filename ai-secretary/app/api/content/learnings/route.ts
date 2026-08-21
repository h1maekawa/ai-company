import { NextRequest, NextResponse } from "next/server";
import { approveLearning, createLearningCandidate, rejectLearning } from "@/app/lib/content/learning/types";
import { loadLearnings, saveLearnings } from "@/app/lib/content/learning/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ learnings: await loadLearnings() });
  } catch (error) {
    console.error("[api/content/learnings] GET失敗:", error);
    return NextResponse.json({ error: "Learningの取得に失敗しました" }, { status: 500 });
  }
}

/** POST: 新規Learning候補を作成（常にcandidate。ObservationとInterpretationを分離） */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.observation || !body.interpretation) {
      return NextResponse.json({ error: "observation と interpretation が必要です" }, { status: 400 });
    }
    const learning = createLearningCandidate({
      period: body.period ?? new Date().toISOString().slice(0, 10),
      sourceContentIds: body.sourceContentIds ?? [],
      sourcePerformanceIds: body.sourcePerformanceIds ?? [],
      observation: body.observation,
      interpretation: body.interpretation,
      confidence: body.confidence,
      actionCandidate: body.actionCandidate,
    });
    const existing = await loadLearnings();
    const learnings = await saveLearnings([learning, ...existing]);
    return NextResponse.json({ learning, learnings });
  } catch (error) {
    console.error("[api/content/learnings] POST失敗:", error);
    return NextResponse.json({ error: "Learningの作成に失敗しました" }, { status: 500 });
  }
}

/** PATCH { id, decision: "approve"|"reject" }: 本人承認後のみapproved */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    const decision = body.decision;
    if (!id || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "id と有効な decision が必要です" }, { status: 400 });
    }
    const existing = await loadLearnings();
    const target = existing.find((l) => l.id === id);
    if (!target) return NextResponse.json({ error: "Learningが見つかりません" }, { status: 404 });

    const updated = decision === "approve" ? approveLearning(target) : rejectLearning(target);
    const learnings = await saveLearnings(existing.map((l) => (l.id === id ? updated : l)));
    return NextResponse.json({ learning: updated, learnings });
  } catch (error) {
    console.error("[api/content/learnings] PATCH失敗:", error);
    return NextResponse.json({ error: "Learningの承認処理に失敗しました" }, { status: 500 });
  }
}
