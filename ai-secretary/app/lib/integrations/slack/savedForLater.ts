import { updateVaultFile } from "../../vault";
import { assertAiAutoWritable } from "../../knowledge/writePolicy";

export const SAVED_FOR_LATER_PATH = "memory/personal/note/saved-for-later.md";
export type SavedForLaterItem = { id: string; sourceUrl: string; title: string; savedAt: string; source: string; category: string };
const marker = /<!-- saved-for-later-v1:([A-Za-z0-9+/=]+) -->\s*$/;
export function parseSavedForLater(content: string): SavedForLaterItem[] {
  if (!content.trim()) return [];
  const match = content.match(marker); if (!match) throw new Error("INVALID_SAVED_FOR_LATER");
  const parsed = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  return Array.isArray(parsed) ? parsed : [];
}
function render(items: SavedForLaterItem[]) {
  return `---\ntype: saved_for_later\nmanaged_by: ai\nupdated: ${JSON.stringify(new Date().toISOString())}\n---\n\n# あとで読む\n\n${items.map((item) => `- [${item.title}](${item.sourceUrl}) — ${item.category} / ${item.savedAt}`).join("\n") || "（まだありません）"}\n\n<!-- saved-for-later-v1:${Buffer.from(JSON.stringify(items)).toString("base64")} -->\n`;
}
export async function saveForLater(item: SavedForLaterItem) {
  await updateVaultFile(SAVED_FOR_LATER_PATH, (content) => {
    assertAiAutoWritable(SAVED_FOR_LATER_PATH, content.split("\n---\n")[0]);
    const items = parseSavedForLater(content);
    if (items.some((saved) => saved.id === item.id || saved.sourceUrl === item.sourceUrl)) return content;
    return render([item, ...items].slice(0, 500));
  });
}
