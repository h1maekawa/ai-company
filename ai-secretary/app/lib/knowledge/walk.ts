import type { DocumentStore } from "../persistence/store";

/** DocumentStore境界だけを使い、root配下のMarkdown pathを再帰的に列挙する。 */
export async function listMarkdownPathsRecursively(
  store: Pick<DocumentStore, "listEntries">,
  root: string
): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await store.listEntries(directory);
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.type === "dir") await walk(path);
      else if (entry.name.toLowerCase().endsWith(".md")) found.push(path);
    }
  }
  await walk(root.replace(/\/$/, ""));
  return found.sort();
}
