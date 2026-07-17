import { NextRequest, NextResponse } from "next/server";
import { generateAndSaveNote } from "@/app/lib/memory/notes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, theme, target, purpose, cta, template } = body;

    // Validation
    if (!title || !theme || !target || !purpose || !cta) {
      return NextResponse.json(
        { error: "必須パラメータ（title, theme, target, purpose, cta）が不足しています。" },
        { status: 400 }
      );
    }

    const result = await generateAndSaveNote({
      title,
      theme,
      target,
      purpose,
      cta,
      template: template || undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/note/generate:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
