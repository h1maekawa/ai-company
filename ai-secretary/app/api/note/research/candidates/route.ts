import { NextRequest, NextResponse } from "next/server";
import {
  loadClusters,
  loadExperiences,
  loadResearchInbox,
  saveClusters,
} from "@/app/lib/note/research/store";
import { TrendClusterStatus } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

/** GET /api/note/research/candidates — 候補テーマ一覧（採点済み） */
export async function GET(): Promise<NextResponse> {
  try {
    const [clusters, items, experiences] = await Promise.all([
      loadClusters(),
      loadResearchInbox(),
      loadExperiences(),
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));
    const expById = new Map(experiences.map((e) => [e.id, e]));

    const enriched = clusters.map((c) => ({
      ...c,
      items: c.researchItemIds
        .map((id) => itemById.get(id))
        .filter((i): i is NonNullable<typeof i> => Boolean(i)),
      experiences: c.matchedExperienceIds
        .map((id) => expById.get(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    }));

    return NextResponse.json({ clusters: enriched });
  } catch (error) {
    console.error("[api/note/research/candidates] GET失敗:", error);
    return NextResponse.json({ error: "候補の取得に失敗しました" }, { status: 500 });
  }
}

/** PUT — 候補の状態を変更する（選択・却下・使用済み） */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { id?: string; status?: TrendClusterStatus };
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id と status が必要です" }, { status: 400 });
    }
    const clusters = await loadClusters();
    const next = clusters.map((c) => (c.id === body.id ? { ...c, status: body.status! } : c));
    return NextResponse.json({ clusters: await saveClusters(next) });
  } catch (error) {
    console.error("[api/note/research/candidates] PUT失敗:", error);
    return NextResponse.json({ error: "候補の更新に失敗しました" }, { status: 500 });
  }
}
