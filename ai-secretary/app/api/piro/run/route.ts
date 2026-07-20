import { NextRequest, NextResponse } from "next/server";
import { getPiroStatus, runPiroWorkflow } from "@/app/lib/piro/workflow";
import { PiroWorkflow } from "@/app/lib/piro/types";

const WORKFLOWS: PiroWorkflow[] = ["research", "content", "x", "full"];

export async function GET() {
  try {
    return NextResponse.json(await getPiroStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : "状況取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const workflow = body.workflow as PiroWorkflow;
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!WORKFLOWS.includes(workflow)) {
      return NextResponse.json({ error: "workflowが不正です" }, { status: 400 });
    }
    if (!topic) {
      return NextResponse.json({ error: "topicは必須です" }, { status: 400 });
    }
    const result = await runPiroWorkflow({
      workflow,
      topic,
      audience: typeof body.audience === "string" ? body.audience : undefined,
      context: typeof body.context === "string" ? body.context : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Piroワークフローの実行に失敗しました";
    console.error("[Piro Workflow]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
