import { NextRequest, NextResponse } from "next/server";
import { createManualMaterial } from "@/app/lib/content/core/providers/manual";
import { createUploadMaterial } from "@/app/lib/content/core/providers/upload";
import { createUrlMaterial } from "@/app/lib/content/core/providers/url";
import { getProvider, listAllMaterials } from "@/app/lib/content/core/providers/registry";
import { loadContentCore } from "@/app/lib/content/core/store";

export const dynamic = "force-dynamic";

/** GET: Content Coreに保存済みのMaterial一覧 + 全Providerから見える候補一覧 */
export async function GET(): Promise<NextResponse> {
  try {
    const [core, available] = await Promise.all([loadContentCore(), listAllMaterials()]);
    return NextResponse.json({ materials: core.materials, available });
  } catch (error) {
    console.error("[api/content/materials] GET失敗:", error);
    return NextResponse.json({ error: "発信材料の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST
 *   { action: "manual", title, rawContent }
 *   { action: "upload", title, rawContent }
 *   { action: "url", title, url, note? }
 *   { action: "import", providerId, id }   他Providerから取り込み
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.action === "manual") {
      const material = await createManualMaterial({ title: body.title ?? "", rawContent: body.rawContent ?? "" });
      return NextResponse.json({ material });
    }
    if (body.action === "upload") {
      const material = await createUploadMaterial({ title: body.title ?? "", rawContent: body.rawContent ?? "" });
      return NextResponse.json({ material });
    }
    if (body.action === "url") {
      const material = await createUrlMaterial({ title: body.title ?? "", url: body.url ?? "", note: body.note });
      return NextResponse.json({ material });
    }
    if (body.action === "import") {
      const provider = getProvider(String(body.providerId ?? ""));
      if (!provider) return NextResponse.json({ error: "不明なProviderです" }, { status: 400 });
      const material = await provider.importMaterial(String(body.id ?? ""));
      return NextResponse.json({ material });
    }
    return NextResponse.json({ error: "actionを指定してください" }, { status: 400 });
  } catch (error) {
    console.error("[api/content/materials] POST失敗:", error);
    return NextResponse.json({ error: "発信材料の作成に失敗しました" }, { status: 500 });
  }
}
