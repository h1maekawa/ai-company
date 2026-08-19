import { generateUniqueId } from "../utils/id";
import { getVaultFile } from "../vault";
import { vaultDocumentStore } from "../persistence/vaultStore";
import { KnowledgeCategory } from "../parser/saveSuggestion";
import { applyWikiLinks } from "../parser/wikilink";
import {
  CANONICAL_DOMAINS,
  coerceDomainForWrite,
  resolveDomain,
  type CanonicalDomain,
} from "../knowledge/domain";
import { canAiAutoWrite } from "../knowledge/writePolicy";
import { isKnowledgeStatus, type KnowledgeStatus } from "../knowledge/types";

export interface KnowledgeSaveInput {
  title: string;
  slug: string;
  /** Legacy category（8種）または canonical domain（11種）どちらでも可。内部で canonical に解決する。 */
  category: KnowledgeCategory | string;
  /** 明示的に canonical domain を渡したい場合（未指定なら category から解決） */
  domain?: string;
  importance: 1 | 2 | 3;
  content: string;
  status?: KnowledgeStatus | "raw" | "reviewed";
  tags?: string[];
  source_ref?: string[];
  related?: string[];
  id?: string; // Reused when updating/overwriting status
  sha?: string; // Required for GitHub API overwrite
}

/** 旧 status 文字列を新 status enum にマッピング（後方互換） */
function normalizeStatus(status: KnowledgeSaveInput["status"]): KnowledgeStatus {
  if (!status) return "captured";
  if (isKnowledgeStatus(status)) return status;
  // legacy 値のマッピング
  if (status === "raw") return "captured";
  if (status === "reviewed") return "candidate";
  return "captured";
}

/**
 * Saves a new or existing knowledge markdown file to the Vault with Frontmatter metadata.
 *
 * ADR-A/C/F/G (docs/14):
 * - 保存先は canonical domain 配下（memory/knowledge/<domain>）に統一。
 * - frontmatter に domain / status / managed_by:ai を付与。
 * - Vault 書き込みポリシー(canAiAutoWrite)を通す（Human Managed 既存ファイルは自動上書きしない）。
 * Resolves naming conflicts by adding numerical suffixes, applies WikiLinks, and links related files.
 */
export async function saveKnowledge(input: KnowledgeSaveInput): Promise<{ success: boolean; path: string; id: string }> {
  const {
    title,
    slug,
    category,
    domain: domainInput,
    importance,
    content,
    status,
    tags = [],
    source_ref = [],
    related = [],
    id: existingId,
    sha,
  } = input;

  // Canonical domain へ解決（legacy category も alias で吸収）
  const domain: CanonicalDomain = coerceDomainForWrite(domainInput ?? category);
  const domainRes = resolveDomain(domainInput ?? category);
  if (domainRes.warning) {
    console.warn(`[knowledge] domain 解決: ${domainRes.warning}`);
  }
  const normalizedStatus = normalizeStatus(status);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // Generate unique sequential ID or reuse existing
  const id = existingId || (await generateUniqueId("kn"));

  // Apply WikiLinks to the content before saving
  const linkedContent = applyWikiLinks(content);

  // Estimate related files dynamically if not provided（canonical domain を走査）
  const finalRelated = [...related];
  if (finalRelated.length === 0 && tags.length > 0) {
    try {
      for (const dom of CANONICAL_DOMAINS) {
        const dir = `memory/knowledge/${dom}`;
        const fileNames = await vaultDocumentStore.listFiles(dir);
        for (const name of fileNames) {
          const filePath = `${dir}/${name}`;
          const { content: fileContent } = await vaultDocumentStore.getFile(filePath);

          // Parse tag list in existing file Frontmatter
          const tagsMatch = fileContent.match(/tags:\s*\[([\s\S]*?)\]/);
          if (tagsMatch && tagsMatch[1]) {
            const existingTags = tagsMatch[1].split(",").map((t) => t.replace(/"/g, "").trim());
            const hasCommonTag = tags.some((t) => existingTags.includes(t));
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

  // Construct Frontmatter（domain / status / managed_by を追加。legacy category も併記して後方互換）
  const frontmatter = `---
id: ${id}
type: knowledge
domain: ${domain}
category: ${category}
status: ${normalizedStatus}
managed_by: ai
created: ${dateHyphen}
updated: ${dateHyphen}
reviewed_at: null
importance: ${importance}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
source_ref: [${source_ref.map((s) => `"${s}"`).join(", ")}]
related: [${finalRelated.map((r) => `"${r}"`).join(", ")}]
---

# ${title}

${linkedContent}
`;

  const targetDir = `memory/knowledge/${domain}`;

  // Conflict resolver - Skip file search if we are overwriting an existing ID/file
  let finalFileName = `${dateHyphen}-${slug}.md`;

  if (!existingId) {
    try {
      const existingFiles = await vaultDocumentStore.listFiles(targetDir);
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

  // ADR-F: 書き込みポリシー強制。既存ファイルの所有権を確認し、Human Managed の自動上書きを禁止。
  let existingContent = "";
  if (existingId) {
    try {
      existingContent = (await getVaultFile(targetFilePath)).content || "";
    } catch {
      existingContent = "";
    }
  }
  const decision = canAiAutoWrite(targetFilePath, existingContent);
  if (!decision.allowed) {
    throw new Error(`[knowledge] ${decision.reason} (${targetFilePath})`);
  }

  await vaultDocumentStore.saveFile(targetFilePath, frontmatter, sha);

  return {
    success: true,
    path: targetFilePath,
    id,
  };
}
