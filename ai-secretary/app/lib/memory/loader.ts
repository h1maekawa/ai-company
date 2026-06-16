import { SecretaryMode } from "../config/modes";
import { MEMORY_MAP } from "../config/memory-map";
import { getVaultFile } from "../vault";

/**
 * Loads Obsidian memory files according to the selected secretary mode
 * and merges them into a single context string.
 */
export async function loadMemoryFromVault(mode: SecretaryMode): Promise<string> {
  const fileDefs = MEMORY_MAP[mode] || MEMORY_MAP.personal; // Fallback to personal
  const loadedParts: string[] = [];

  for (const file of fileDefs) {
    try {
      const { content } = await getVaultFile(file.path);
      if (content && content.trim()) {
        loadedParts.push(`=== ${file.name} ===\n${content.trim()}`);
      }
    } catch (e) {
      console.error(`Failed to load memory file ${file.name} for mode ${mode}:`, e);
    }
  }

  return loadedParts.join("\n\n");
}
