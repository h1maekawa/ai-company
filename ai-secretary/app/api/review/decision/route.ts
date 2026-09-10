import { NextRequest, NextResponse } from "next/server";
import { decideReviewItem, type DecideInput } from "@/app/lib/review/decide";
import { loadReviewFeed } from "@/app/lib/review/feed";
import type { ReviewDecision } from "@/app/lib/review/types";

export const dynamic = "force-dynamic";

const DECISIONS: ReviewDecision[] = ["approve", "reject", "edit_approve"];

/**
 * POST /api/review/decision — 承認 / 差し戻し / 編集して承認（要件2）
 *
 * 承認系は、自動テスト（要件9）が通っていない項目を弾く。
 * 「自動テスト通過を承認前の必須条件にする」という要件をここで担保している。
 * 人が意図的に上書きする場合は force: true を明示させる（監査ログに残る）。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<DecideInput> & { force?: boolean };

    if (typeof body.itemId !== "string" || !body.itemId) {
      return NextResponse.json({ error: "itemId が必要です" }, { status: 400 });
    }
    if (!body.decision || !DECISIONS.includes(body.decision)) {
      return NextResponse.json({ error: "decision の値が不正です" }, { status: 400 });
    }

    if (body.decision !== "reject" && !body.force) {
      const feed = await loadReviewFeed();
      const item = feed.items.find((i) => i.id === body.itemId);
      if (item?.qa && !item.qa.passed) {
        const failed = item.qa.checks
          .filter((c) => c.severity === "blocking" && c.status === "fail")
          .map((c) => `${c.label}: ${c.detail}`);
        return NextResponse.json(
          {
            error: "自動テストが通っていないため承認できません",
            failed,
            hint: "内容を修正するか、理由を確認したうえで force: true で承認してください",
          },
          { status: 422 }
        );
      }
    }

    const result = await decideReviewItem({
      itemId: body.itemId,
      decision: body.decision,
      reason: body.reason,
      editedText: body.editedText,
      decidedBy: "human",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/review/decision] POST失敗:", error);
    return NextResponse.json({ error: "決定の保存に失敗しました" }, { status: 500 });
  }
}
