import { listVaultDirectory, getVaultFile } from "../vault";

export type IdPrefix = "kn" | "nt" | "lg";

const KNOWLEDGE_CATEGORIES = [
  "sales",
  "marketing",
  "recruiting",
  "investing",
  "systems",
  "content",
  "strategy",
  "misc",
];

const NOTE_SUBFOLDERS = ["ideas", "drafts", "published", "research", "templates"];

const LOG_MODES = ["personal", "company", "finance", "note"];

/**
 * Generates a unique serial ID for Knowledge (kn-), Note (nt-), or Log (lg-)
 * based on the current date and the number of existing files for today.
 */
export async function generateUniqueId(prefix: IdPrefix): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD
  const datePlain = `${year}${month}${day}`;    // YYYYMMDD

  let directoriesToScan: string[] = [];

  if (prefix === "kn") {
    directoriesToScan = KNOWLEDGE_CATEGORIES.map(cat => `memory/knowledge/${cat}`);
  } else if (prefix === "nt") {
    directoriesToScan = NOTE_SUBFOLDERS.map(sub => `memory/personal/note/${sub}`);
  } else if (prefix === "lg") {
    directoriesToScan = LOG_MODES.map(mode => `memory/chat-log/${mode}`);
  }

  let maxNum = 0;
  const idRegex = new RegExp(`id:\\s*${prefix}-${datePlain}-(\\d+)`);

  for (const dir of directoriesToScan) {
    try {
      const fileNames = await listVaultDirectory(dir);
      // Filter files that start with today's hyphenated date prefix
      const todaysFiles = fileNames.filter(name => name.startsWith(dateHyphen));

      for (const fileName of todaysFiles) {
        const filePath = `${dir}/${fileName}`;
        const { content } = await getVaultFile(filePath);
        const match = content.match(idRegex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    } catch (e) {
      console.error(`[DEBUG] Failed to scan directory ${dir} for ID generation:`, e);
    }
  }

  const nextNumStr = String(maxNum + 1).padStart(3, "0");
  return `${prefix}-${datePlain}-${nextNumStr}`;
}
