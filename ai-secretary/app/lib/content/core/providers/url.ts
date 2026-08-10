/**
 * Url Content Provider — URLを参照材料として登録する。
 * 自動スクレイピングはせず（他者コンテンツの無断複製を避けるため）、
 * 本人が書いたメモ（rawContent）とURLだけを保持する。
 */

import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export async function createUrlMaterial(input: { title: string; url: string; note?: string }): Promise<Material> {
  const material = createMaterial({
    type: "link",
    title: input.title || input.url,
    rawContent: input.note ?? "",
    sourceType: "url",
    sourceUrl: input.url,
  });
  return upsertMaterial(material);
}

export const UrlContentProvider: ContentSourceProvider = {
  id: "url",
  label: "URL",
  async isAvailable() {
    return true;
  },
  async listMaterials() {
    const { materials } = await loadContentCore();
    return materials.filter((m) => m.sourceType === "url");
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  async importMaterial(id: string) {
    const material = await this.getMaterial(id);
    if (!material) throw new Error(`Url material not found: ${id}`);
    return material;
  },
};
