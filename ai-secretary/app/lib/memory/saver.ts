import { getVaultFile, saveVaultFile } from "../vault";
import { SecretaryMode } from "../config/modes";

const ARCHIVE_TARGET_FILES = ["today.md", "tasks.md", "strategy.md", "portfolio.md"];

/**
 * Saves a file, and if the file is one of the tracked mutable files (today.md, tasks.md, etc.),
 * it copies the current version to memory/archive/{mode}/{filename}-YYYY-MM-DD.md before overwriting.
 */
export async function saveWithArchiving(
  filePath: string,
  newContent: string,
  sha?: string
): Promise<{ sha: string }> {
  // Parse path components: e.g. "memory/personal/today.md" -> ["memory", "personal", "today.md"]
  const parts = filePath.split("/");
  const fileNameWithExt = parts[parts.length - 1];
  const mode = parts[parts.length - 2] as SecretaryMode;

  const dotIndex = fileNameWithExt.lastIndexOf(".");
  const baseName = dotIndex !== -1 ? fileNameWithExt.slice(0, dotIndex) : fileNameWithExt;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // Archive mutable file if detected
  if (ARCHIVE_TARGET_FILES.includes(fileNameWithExt) && mode) {
    try {
      const existing = await getVaultFile(filePath);
      if (existing.content && existing.content.trim()) {
        const archivePath = `memory/archive/${mode}/${baseName}-${dateHyphen}.md`;
        
        console.log(`[DEBUG] Archiving mutable file ${filePath} to ${archivePath}`);
        // Back up the old content to archive
        await saveVaultFile(archivePath, existing.content);
      }
    } catch (e) {
      console.log(`[DEBUG] No existing mutable file found to archive at ${filePath}`);
    }
  }

  // Proceed with overwrite saving
  return saveVaultFile(filePath, newContent, sha);
}
