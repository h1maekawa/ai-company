/**
 * Obsidian Content Provider — 既存Vaultのファイルを発信材料として取り込む。
 * 取り込みは常に copy（Materialとして複製保存）で、元のVaultファイルは変更しない。
 */

import { getVaultFile } from "../../../vault";
import { createMaterial, Material } from "../types";
import { loadContentCore, upsertMaterial } from "../store";
import { ContentSourceProvider } from "./types";

/** vault path を id として扱う（例: memory/personal/note/idea-inbox.md） */
export const ObsidianContentProvider: ContentSourceProvider = {
  id: "obsidian",
  label: "Obsidian Vault",
  async isAvailable() {
    try {
      await getVaultFile("memory/personal/note/idea-inbox.md");
      return true;
    } catch {
      return false;
    }
  },
  async listMaterials() {
    const { materials } = await loadContentCore();
    return materials.filter((m) => m.sourceType === "obsidian");
  },
  async getMaterial(id: string) {
    const materials = await this.listMaterials();
    return materials.find((m) => m.id === id) ?? null;
  },
  /** id は "vaultPath" または既存Material id のどちらでもよい */
  async importMaterial(id: string): Promise<Material> {
    const existing = (await this.listMaterials()).find((m) => m.id === id);
    if (existing) return existing;

    const vaultPath = id;
    const file = await getVaultFile(vaultPath);
    if (!file.content) throw new Error(`Vault file not found or empty: ${vaultPath}`);

    const material = createMaterial({
      type: "note",
      title: vaultPath.split("/").pop() ?? vaultPath,
      rawContent: file.content,
      sourceType: "obsidian",
      sourceId: vaultPath,
      sourceUrl: vaultPath,
    });
    return upsertMaterial(material);
  },
};
