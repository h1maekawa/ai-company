/**
 * Research Content Provider — 既存Research pipeline（trend-clusters / research-inbox）を
 * Materialとして橋渡しする。Researchと本人の意見は混同しない（rawContentは抜粋・要約のみ）。
 */

import { loadClusters, loadResearchInbox } from "../../../note/research/store";
import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export const ResearchContentProvider: ContentSourceProvider = {
  id: "research",
  label: "Research",
  async isAvailable() {
    try {
      await loadClusters();
      return true;
    } catch {
      return false;
    }
  },
  async listMaterials() {
    try {
      const [clusters, items] = await Promise.all([loadClusters(), loadResearchInbox()]);
      const fromClusters: Material[] = clusters
        .filter((c) => !c.blocked)
        .map((c) => ({
          id: `research-cluster:${c.id}`,
          type: "note",
          title: c.title,
          rawContent: c.summary,
          summary: c.summary,
          sourceType: "research",
          sourceId: c.id,
          createdAt: c.firstDetectedAt,
          updatedAt: c.lastDetectedAt,
          status: c.status === "used" ? "archived" : "inbox",
        }));
      const fromItems: Material[] = items.slice(0, 40).map((item) => ({
        id: `research-item:${item.id}`,
        type: "link",
        title: item.title ?? item.textExcerpt.slice(0, 40),
        rawContent: item.textExcerpt,
        sourceType: "research",
        sourceId: item.id,
        sourceUrl: item.sourceUrl,
        createdAt: item.fetchedAt,
        updatedAt: item.fetchedAt,
        status: "inbox",
      }));
      return [...fromClusters, ...fromItems];
    } catch {
      return [];
    }
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  async importMaterial(id: string): Promise<Material> {
    const { materials: saved } = await loadContentCore();
    const alreadySaved = saved.find((m) => m.sourceType === "research" && m.sourceId === id.split(":")[1]);
    if (alreadySaved) return alreadySaved;

    const candidate = (await this.listMaterials()).find((m) => m.id === id);
    if (!candidate) throw new Error(`Research material not found: ${id}`);

    const material = createMaterial({
      type: candidate.type,
      title: candidate.title,
      rawContent: candidate.rawContent,
      summary: candidate.summary,
      sourceType: "research",
      sourceId: candidate.sourceId,
      sourceUrl: candidate.sourceUrl,
    });
    return upsertMaterial(material);
  },
};
