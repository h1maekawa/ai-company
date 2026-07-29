import { NextRequest, NextResponse } from "next/server";
import { loadBrand, saveBrand } from "@/app/lib/note/store";

export const dynamic = "force-dynamic";

/** GET /api/note/brand — ブランディング・チャネル・教育プログラム */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadBrand());
  } catch (error) {
    const message = error instanceof Error ? error.message : "ブランド情報の取得に失敗しました";
    console.error("[api/note/brand] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/note/brand — まとめて保存 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const current = await loadBrand();
    const saved = await saveBrand({
      brand: { ...current.brand, ...(body.brand ?? {}) },
      channels: Array.isArray(body.channels) ? body.channels : current.channels,
      program: body.program ?? current.program,
    });
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ブランド情報の保存に失敗しました";
    console.error("[api/note/brand] PUT失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
