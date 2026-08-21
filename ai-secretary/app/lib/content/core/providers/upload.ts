/**
 * Upload Content Provider — 貼り付け/アップロードしたテキストを発信材料として取り込む。
 * ファイルストレージは持たず、テキスト本文を直接Materialとして保存する（Manual Firstの原則）。
 */

import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

export async function createUploadMaterial(input: { title: string; rawContent: string }): Promise<Material> {
  const material = createMaterial({
    type: "text",
    title: input.title || input.rawContent.slice(0, 40),
    rawContent: input.rawContent,
    sourceType: "upload",
  });
  return upsertMaterial(material);
}

export const UploadContentProvider: ContentSourceProvider = {
  id: "upload",
  label: "アップロード",
  async isAvailable() {
    return true;
  },
  async listMaterials() {
    const { materials } = await loadContentCore();
    return materials.filter((m) => m.sourceType === "upload");
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  async importMaterial(id: string) {
    const material = await this.getMaterial(id);
    if (!material) throw new Error(`Upload material not found: ${id}`);
    return material;
  },
};
