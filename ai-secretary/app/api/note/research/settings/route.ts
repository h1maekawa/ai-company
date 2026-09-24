import { NextRequest, NextResponse } from "next/server";
import {
  loadResearchSettings,
  saveResearchSettings,
} from "@/app/lib/note/research/store";
import { normalizeApprovalPolicy } from "@/app/lib/review/approvalPolicy";
import { withPurposeMixUpdate } from "@/app/lib/note/research/types";

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
    // purposeMix の正は growthStrategy.purposeMix。画面の変更をそこへ保存し、旧 purposeMix は同値のミラーにする
    const saved = await saveResearchSettings(
      withPurposeMixUpdate({
        x: { ...current.x, ...(body.x ?? {}) },
        // 工程ごとの承認要否（要件10）。壊れた値は既定へ倒される
        approvalPolicy: normalizeApprovalPolicy({
          ...current.approvalPolicy,
          ...(body.approvalPolicy ?? {}),
        }),
        purposeMix: current.purposeMix,
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
      }, body.purposeMix),
      { modeExplicit }
    );
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/note/research/settings] PUT失敗:", error);
    return NextResponse.json({ error: "設定の保存に失敗しました" }, { status: 500 });
  }
}
