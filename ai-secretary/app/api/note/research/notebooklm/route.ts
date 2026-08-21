import { NextRequest, NextResponse } from "next/server";
import { loadBrand } from "@/app/lib/note/store";
import { abstractItems } from "@/app/lib/note/research/abstract";
import { buildClusters, selectTopCandidates } from "@/app/lib/note/research/cluster";
import { notebookLMResearchItems, parseNotebookLMImport } from "@/app/lib/note/research/notebooklm";
import { withLock } from "@/app/lib/note/publishing/queue";
import {
  loadClusters,
  loadExperiences,
  loadResearchInbox,
  loadSocialDrafts,
  saveClusters,
  saveResearchInbox,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { result?: unknown };
    if (typeof body.result !== "string") {
      return NextResponse.json({ error: "NotebookLMの結果を貼り付けてください" }, { status: 400 });
    }
    const imported = parseNotebookLMImport(body.result);
    const result = await withLock("research-run", async () => {
      const [existingItems, existingClusters, brandFile, experiences, drafts] = await Promise.all([
        loadResearchInbox(), loadClusters(), loadBrand(), loadExperiences(), loadSocialDrafts(),
      ]);
      const knownUrls = new Set(existingItems.map((item) => item.sourceUrl));
      const rawItems = notebookLMResearchItems(imported).filter((item) => !knownUrls.has(item.sourceUrl));
      const fresh = await abstractItems(rawItems, { useAI: false });
      const savedItems = await saveResearchInbox([...fresh, ...existingItems]);
      const pastTitles = [
        ...existingClusters.filter((item) => item.status === "used").map((item) => item.title),
        ...drafts.map((item) => item.text.slice(0, 60)),
      ];
      const clusters = await saveClusters(buildClusters(
        savedItems,
        { brand: brandFile.brand, experiences, pastTitles },
        existingClusters
      ));
      const topCandidates = selectTopCandidates(
        clusters, savedItems, imported.topic, fresh.map((item) => item.id)
      );
      return { imported: fresh.length, skipped: rawItems.length - fresh.length, topCandidates };
    });
    if (!result) return NextResponse.json({ error: "別の調査が実行中です" }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "NotebookLMの取り込みに失敗しました" },
      { status: 400 }
    );
  }
}
