import { NextRequest, NextResponse } from "next/server";
import { saveKnowledge } from "@/app/lib/memory/knowledge";
import { resolveDomain, isCanonicalDomain } from "@/app/lib/knowledge/domain";

// 後方互換の legacy カテゴリ（alias で canonical domain に解決される）
const LEGACY_CATEGORIES = [
  "sales",
  "marketing",
  "recruiting",
  "investing",
  "systems",
  "content",
  "strategy",
  "misc",
];

/**
 * POST /api/knowledge/save
 * 直接の正式Knowledge保存（ユーザーの明示操作）。Human Approval 相当の Approved Write として扱う。
 * domain は canonical / legacy(alias) で解決できることが必須（未解決は 400）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, slug, category, domain, importance, content } = body;
    const rawClass = domain ?? category;

    if (!title || !slug || !rawClass || !content) {
      return NextResponse.json(
        { error: "必須パラメータ（title, slug, category|domain, content）が不足しています。" },
        { status: 400 }
      );
    }

    const isCanonical = isCanonicalDomain(rawClass);
    const isLegacy = LEGACY_CATEGORIES.includes(rawClass);
    if (!isCanonical && !isLegacy && !resolveDomain(rawClass).domain) {
      return NextResponse.json(
        { error: "無効な category/domain です。canonical domain もしくは legacy category を指定してください。" },
        { status: 400 }
      );
    }

    const cleanImportance = importance === 1 || importance === 2 || importance === 3 ? importance : 1;

    const result = await saveKnowledge({
      title,
      slug,
      category: category ?? rawClass,
      domain: domain ?? undefined,
      importance: cleanImportance as 1 | 2 | 3,
      content,
      status: "promoted",
      approved: true, // 直接保存API = 明示的なHuman Approved Write
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/save:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
