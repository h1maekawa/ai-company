import { NextRequest, NextResponse } from "next/server";
import {
  loadResearchSettings,
  saveResearchSettings,
} from "@/app/lib/note/research/store";
import { normalizeApprovalPolicy } from "@/app/lib/review/approvalPolicy";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadResearchSettings());
  } catch (error) {
    console.error("[api/note/research/settings] GET失敗:", error);
    return NextResponse.json({ error: "設定の取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const current = await loadResearchSettings();
    const modeExplicit = typeof body.flags?.socialOperationMode === "string";
    const saved = await saveResearchSettings(
      {
        x: { ...current.x, ...(body.x ?? {}) },
        // 工程ごとの承認要否（要件10）。壊れた値は既定へ倒される
        approvalPolicy: normalizeApprovalPolicy({
          ...current.approvalPolicy,
          ...(body.approvalPolicy ?? {}),
        }),
        purposeMix: { ...current.purposeMix, ...(body.purposeMix ?? {}) },
        flags: { ...current.flags, ...(body.flags ?? {}) },
        performanceWeights: {
          ...current.performanceWeights,
          ...(body.performanceWeights ?? {}),
        },
        winningTopicPolicy: {
          ...current.winningTopicPolicy,
          ...(body.winningTopicPolicy ?? {}),
        },
        noteTags: Array.isArray(body.noteTags) ? body.noteTags : current.noteTags,
        growthStrategy: current.growthStrategy,
      },
      { modeExplicit }
    );
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/note/research/settings] PUT失敗:", error);
    return NextResponse.json({ error: "設定の保存に失敗しました" }, { status: 500 });
  }
}
