/**
 * Manual Content Provider — 自由入力から始める発信材料。
 * 「今日は何について書きたいですか？」の自由記述はここでMaterialになる。Timeboxは一切関与しない。
 */

import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export async function createManualMaterial(input: { title: string; rawContent: string }): Promise<Material> {
  const material = createMaterial({
    type: "text",
    title: input.title || input.rawContent.slice(0, 40),
    rawContent: input.rawContent,
    sourceType: "manual",
  });
  return upsertMaterial(material);
}

export const ManualContentProvider: ContentSourceProvider = {
  id: "manual",
  label: "手動入力",
  async isAvailable() {
    return true;
  },
  async listMaterials() {
    const { materials } = await loadContentCore();
    return materials.filter((m) => m.sourceType === "manual");
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  async importMaterial(id: string) {
    const material = await this.getMaterial(id);
    if (!material) throw new Error(`Manual material not found: ${id}`);
    return material;
  },
};
