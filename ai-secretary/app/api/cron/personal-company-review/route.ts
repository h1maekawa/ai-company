import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { withLock } from "@/app/lib/note/publishing/queue";
import {
  runDailyPersonalCompanyReview,
  runMonthlyPersonalCompanyReview,
  runWeeklyPersonalCompanyReview,
} from "@/app/lib/company/reviews/reviews";
import { saveReview } from "@/app/lib/company/reviews/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/personal-company-review?period=daily|weekly|monthly
 *
 * Scheduler は薄いAdapterに徹する（Phase 4 §22）。
 * 判断も集計もすべて reviews.ts 側にあり、ここは呼んで保存するだけ。
 * これにより Vercel Cron / GitHub Action / 手動 のどこからでも同じ結果になる。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "daily";
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return NextResponse.json({ error: "period の値が不正です" }, { status: 400 });
  }

  try {
    const result = await withLock(`personal-company-review-${period}`, async () => {
      const review =
        period === "monthly"
          ? await runMonthlyPersonalCompanyReview()
          : period === "weekly"
            ? await runWeeklyPersonalCompanyReview()
            : await runDailyPersonalCompanyReview();
      await saveReview(review);
      return review;
    });

    if (!result) return NextResponse.json({ skipped: true, reason: "すでに実行中です" });
    return NextResponse.json({
      ok: true,
      period,
      date: result.date,
      health: result.companyHealth.score,
      coverage: result.companyHealth.coveragePct,
      level: result.level.label,
    });
  } catch (error) {
    console.error("[cron/personal-company-review] 失敗:", error);
    return NextResponse.json({ error: "レビューの実行に失敗しました" }, { status: 500 });
  }
}
