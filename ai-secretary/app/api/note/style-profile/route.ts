import { NextRequest, NextResponse } from "next/server";
import {
  loadStyleProfile,
  saveStyleProfile,
  summarizeLearningSources,
  type StyleField,
  type StyleProfile,
} from "@/app/lib/note/styleProfile";
import { loadPerformance, loadSocialDrafts } from "@/app/lib/note/research/store";
import { loadXWorkspace } from "@/app/lib/note/x/store";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = ["opening", "ending", "tone", "sentenceLength", "lineBreak", "question", "cta"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function isEditableField(v: string): v is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(v);
}

/**
 * GET — 現在のStyle Profileと、その学習ソースの内訳を返す。
 * 内訳を併せて返すのは「種が入っているか一目で分かる」ようにするため（要件4）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [profile, drafts, performance, workspace] = await Promise.all([
      loadStyleProfile(),
      loadSocialDrafts(),
      loadPerformance(),
      loadXWorkspace().catch(() => ({ ownedPosts: [], referenceNotes: [] })),
    ]);

    return NextResponse.json({
      ...profile,
      sources: summarizeLearningSources({
        profile,
        drafts,
        archivePosts: workspace.ownedPosts,
        performanceRecords: performance.records,
      }),
    });
  } catch (error) {
    console.error("[api/note/style-profile] GET失敗:", error);
    return NextResponse.json({ error: "Style Profileの取得に失敗しました" }, { status: 500 });
  }
}

/**
 * PUT — 本人明示Style（source: manual）の登録・更新・解除。
 * manualで登録した項目は自動学習（own-posts/performance）で上書きされない（要件P0.1の優先順位）。
 * description を空文字で送るとmanual指定を解除し、自動学習に戻す。
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const current = await loadStyleProfile();
    const next: StyleProfile = { ...current };

    if (body.fields && typeof body.fields === "object") {
      for (const [key, value] of Object.entries(body.fields as Record<string, unknown>)) {
        if (!isEditableField(key) || typeof value !== "string") continue;
        const description = value.trim();
        next[key] = (description
          ? { description, source: "manual", updatedAt: new Date().toISOString() }
          : { description: "", source: "unset", updatedAt: new Date().toISOString() }) as StyleField;
      }
    }
    if (Array.isArray(body.preferredExpressions)) {
      next.preferredExpressions = body.preferredExpressions.map(String).slice(0, 30);
    }
    if (Array.isArray(body.avoidedExpressions)) {
      next.avoidedExpressions = body.avoidedExpressions.map(String).slice(0, 30);
    }

    const saved = await saveStyleProfile(next);
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/note/style-profile] PUT失敗:", error);
    return NextResponse.json({ error: "Style Profileの保存に失敗しました" }, { status: 500 });
  }
}
