import { NextRequest, NextResponse } from "next/server";
import {
  adoptLocalAiReview,
  rejectLocalAiReview,
  saveReviewAsUnverifiedExperience,
} from "@/app/lib/note/editor/actions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { action?: string };
    if (body.action === "adopt") {
      return NextResponse.json({ ok: true, drafts: await adoptLocalAiReview(params.id) });
    }
    if (body.action === "reject") {
      await rejectLocalAiReview(params.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "save-experience") {
      return NextResponse.json({
        ok: true,
        experience: await saveReviewAsUnverifiedExperience(params.id),
      });
    }
    return NextResponse.json({ error: "未対応の操作です" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
