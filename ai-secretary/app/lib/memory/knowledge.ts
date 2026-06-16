import { generateUniqueId } from "../utils/id";
import { saveVaultFile, listVaultDirectory, getVaultFile } from "../vault";
import { KnowledgeCategory } from "../parser/saveSuggestion";
import { applyWikiLinks } from "../parser/wikilink";

export interface KnowledgeSaveInput {
  title: string;
  slug: string;
  category: KnowledgeCategory;
  importance: 1 | 2 | 3;
  content: string;
  status?: "raw" | "reviewed" | "promoted" | "archived";
  tags?: string[];
  source_ref?: string[];
  related?: string[];
  id?: string; // Reused when updating/overwriting status
  sha?: string; // Required for GitHub API overwrite
}

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

/**
 * Saves a new or existing knowledge markdown file to the Vault with Frontmatter metadata.
 * Resolves naming conflicts by adding numerical suffixes, applies WikiLinks, and links related files.
 */
export async function saveKnowledge(input: KnowledgeSaveInput): Promise<{ success: boolean; path: string; id: string }> {
  const {
    title,
    slug,
    category,
    importance,
    content,
    status = "raw",
    tags = [],
    source_ref = [],
    related = [],
    id: existingId,
    sha,
  } = input;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // Generate unique sequential ID or reuse existing
  const id = existingId || (await generateUniqueId("kn"));

  // Apply WikiLinks to the content before saving
  const linkedContent = applyWikiLinks(content);

  // Estimate related files dynamically if not provided
  const finalRelated = [...related];
  if (finalRelated.length === 0 && tags.length > 0) {
    try {
      for (const cat of KNOWLEDGE_CATEGORIES) {
        const dir = `memory/knowledge/${cat}`;
        const fileNames = await listVaultDirectory(dir);
        for (const name of fileNames) {
          const filePath = `${dir}/${name}`;
          const { content: fileContent } = await getVaultFile(filePath);
          
          // Parse tag list in existing file Frontmatter
          const tagsMatch = fileContent.match(/tags:\s*\[([\s\S]*?)\]/);
          if (tagsMatch && tagsMatch[1]) {
            const existingTags = tagsMatch[1].split(",").map(t => t.replace(/"/g, "").trim());
            const hasCommonTag = tags.some(t => existingTags.includes(t));
            if (hasCommonTag) {
              const idMatch = fileContent.match(/id:\s*(kn-\d+-\d+)/);
              if (idMatch && idMatch[1] && idMatch[1] !== id && !finalRelated.includes(idMatch[1])) {
                finalRelated.push(idMatch[1]);
                if (finalRelated.length >= 5) break; // Cap at 5 related links
              }
            }
          }
        }
        if (finalRelated.length >= 5) break;
      }
    } catch (e) {
      console.error("[DEBUG] Failed to estimate related knowledge:", e);
    }
  }

  // Construct Frontmatter
  const frontmatter = `---
id: ${id}
type: knowledge
status: ${status}
category: ${category}
created: ${dateHyphen}
updated: ${dateHyphen}
reviewed_at: null
importance: ${importance}
tags: [${tags.map(t => `"${t}"`).join(", ")}]
source_ref: [${source_ref.map(s => `"${s}"`).join(", ")}]
related: [${finalRelated.map(r => `"${r}"`).join(", ")}]
---

# ${title}

${linkedContent}
`;

  const targetDir = `memory/knowledge/${category}`;
  
  // Conflict resolver - Skip file search if we are overwriting an existing ID/file
  let finalFileName = `${dateHyphen}-${slug}.md`;
  
  if (!existingId) {
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
  }

  const targetFilePath = `${targetDir}/${finalFileName}`;
  await saveVaultFile(targetFilePath, frontmatter, sha);

  return {
    success: true,
    path: targetFilePath,
    id,
  };
}
