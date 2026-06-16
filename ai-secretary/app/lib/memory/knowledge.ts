import { generateUniqueId } from "../utils/id";
import { saveVaultFile, listVaultDirectory } from "../vault";
import { KnowledgeCategory } from "../parser/saveSuggestion";

export interface KnowledgeSaveInput {
  title: string;
  slug: string;
  category: KnowledgeCategory;
  importance: 1 | 2 | 3;
  content: string;
  tags?: string[];
  source_ref?: string[];
  related?: string[];
}

/**
 * Saves a new knowledge markdown file to the Vault with Frontmatter metadata.
 * Resolves naming conflicts by adding numerical suffixes.
 */
export async function saveKnowledge(input: KnowledgeSaveInput): Promise<{ success: boolean; path: string; id: string }> {
  const { title, slug, category, importance, content, tags = [], source_ref = [], related = [] } = input;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // Generate unique sequential ID
  const id = await generateUniqueId("kn");

  // Construct Frontmatter
  const frontmatter = `---
id: ${id}
type: knowledge
status: raw
category: ${category}
created: ${dateHyphen}
updated: ${dateHyphen}
reviewed_at: null
importance: ${importance}
tags: [${tags.map(t => `"${t}"`).join(", ")}]
source_ref: [${source_ref.map(s => `"${s}"`).join(", ")}]
related: [${related.map(r => `"${r}"`).join(", ")}]
---

# ${title}

${content}
`;

  const targetDir = `memory/knowledge/${category}`;
  
  // Conflict resolver (Race Condition prevention)
  let finalFileName = `${dateHyphen}-${slug}.md`;
  
  try {
    const existingFiles = await listVaultDirectory(targetDir);
    let counter = 1;
    while (existingFiles.includes(finalFileName)) {
      counter++;
      finalFileName = `${dateHyphen}-${slug}-${counter}.md`;
    }
  } catch (e) {
    console.error(`[DEBUG] Directory check failed for ${targetDir}. Proceeding with default name.`, e);
  }

  const targetFilePath = `${targetDir}/${finalFileName}`;
  await saveVaultFile(targetFilePath, frontmatter);

  return {
    success: true,
    path: targetFilePath,
    id,
  };
}
