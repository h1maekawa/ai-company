import { NextRequest, NextResponse } from "next/server";
import { saveKnowledge } from "@/app/lib/memory/knowledge";
import { KnowledgeCategory } from "@/app/lib/parser/saveSuggestion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, slug, category, importance, content } = body;

    // Validation
    if (!title || !slug || !category || !content) {
      return NextResponse.json(
        { error: "必須パラメータ（title, slug, category, content）が不足しています。" },
        { status: 400 }
      );
    }

    const validCategories: KnowledgeCategory[] = [
      "sales",
      "marketing",
      "recruiting",
      "investing",
      "systems",
      "content",
      "strategy",
      "misc",
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `無効なカテゴリです。指定可能：${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    const cleanImportance = (importance === 1 || importance === 2 || importance === 3) ? importance : 1;

    const result = await saveKnowledge({
      title,
      slug,
      category: category as KnowledgeCategory,
      importance: cleanImportance as (1 | 2 | 3),
      content,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/save:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
