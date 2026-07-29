import { NextRequest, NextResponse } from "next/server";
import { composeLesson } from "@/app/lib/note/compose";
import { loadAffiliates, loadBrand, saveBrand } from "@/app/lib/note/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/note/lesson
 * 公式LINEのステップ配信・指定回の文面を生成し、プログラムへ保存する。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { stepId?: string };
    const stepId = String(body.stepId ?? "");

    const [brandFile, allLinks] = await Promise.all([loadBrand(), loadAffiliates()]);
    const step = brandFile.program.steps.find((s) => s.id === stepId);
    if (!step) {
      return NextResponse.json({ error: "その回が見つかりません" }, { status: 404 });
    }

    const affiliates = allLinks.filter((link) => link.active && link.url);

    const result = await composeLesson({
      program: brandFile.program,
      step,
      brand: brandFile.brand,
      affiliates,
    });
    if (!result) {
      return NextResponse.json({ error: "生成に失敗しました。もう一度お試しください" }, { status: 502 });
    }

    // 生成した配信文をプログラムへ保存する
    const saved = await saveBrand({
      ...brandFile,
      program: {
        ...brandFile.program,
        steps: brandFile.program.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                content: result.content,
                assignment: result.assignment,
                affiliateId: result.usedAffiliateId,
              }
            : s
        ),
      },
    });

    return NextResponse.json({ ...saved, generated: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "配信文の生成に失敗しました";
    console.error("[api/note/lesson] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
