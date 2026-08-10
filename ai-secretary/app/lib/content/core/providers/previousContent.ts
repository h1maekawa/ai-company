/**
 * Previous Content Provider — 過去に公開した投稿・記事（PublishedContent）を発信材料として橋渡しする。
 * X → Note（反応の良かったXをnote記事にする）や、Note → X の起点として使う。
 */

import { loadPublishedContent } from "../../../note/research/store";
import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export const PreviousContentProvider: ContentSourceProvider = {
  id: "previous-content",
  label: "過去の公開投稿",
  async isAvailable() {
    try {
      const published = await loadPublishedContent();
      return published.length > 0;
    } catch {
      return false;
    }
  },
  async listMaterials() {
    try {
      const published = await loadPublishedContent();
      return published.map(
        (p): Material => ({
          id: `published:${p.id}`,
          type: p.channel === "x" ? "conversation" : "note",
          title: p.title,
          rawContent: p.bodySummary ?? p.title,
          sourceType: "previous-content",
          sourceId: p.id,
          sourceUrl: p.url,
          createdAt: p.publishedAt,
          updatedAt: p.publishedAt,
          status: "inbox",
        })
      );
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
    const publishedId = id.split(":")[1];
    const already = saved.find((m) => m.sourceType === "previous-content" && m.sourceId === publishedId);
    if (already) return already;

    const candidate = (await this.listMaterials()).find((m) => m.id === id);
    if (!candidate) throw new Error(`Previous content material not found: ${id}`);

    const material = createMaterial({
      type: candidate.type,
      title: candidate.title,
      rawContent: candidate.rawContent,
      sourceType: "previous-content",
      sourceId: candidate.sourceId,
      sourceUrl: candidate.sourceUrl,
    });
    return upsertMaterial(material);
  },
};
