import { NextRequest, NextResponse } from "next/server";
import { loadAgentTasks, updateAgentTask } from "@/app/lib/agents/store";

export const dynamic = "force-dynamic";

/** GET /api/agents/tasks — チャット指示から生まれたタスクの一覧（要件1のタスクログ） */
export async function GET(): Promise<NextResponse> {
  try {
    const tasks = await loadAgentTasks();
    return NextResponse.json({
      tasks: [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      open: tasks.filter((t) => t.status === "queued" || t.status === "running").length,
    });
  } catch (error) {
    console.error("[api/agents/tasks] GET失敗:", error);
    return NextResponse.json({ error: "タスクの取得に失敗しました" }, { status: 500 });
  }
}

/** PATCH — タスクの状態更新（完了・失敗・取り消し） */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const allowed = ["queued", "running", "done", "failed", "cancelled"];
    if (body.status && !allowed.includes(body.status)) {
      return NextResponse.json({ error: "status の値が不正です" }, { status: 400 });
    }

    const updated = await updateAgentTask(body.id, {
      status: body.status,
      result: body.result,
      failureReason: body.failureReason,
    });
    if (!updated) {
      return NextResponse.json({ error: "そのタスクが見つかりません" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/agents/tasks] PATCH失敗:", error);
    return NextResponse.json({ error: "タスクの更新に失敗しました" }, { status: 500 });
  }
}
