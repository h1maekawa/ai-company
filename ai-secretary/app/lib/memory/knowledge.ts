import { generateUniqueId } from "../utils/id";
import { vaultDocumentStore } from "../persistence/vaultStore";
import { KnowledgeCategory } from "../parser/saveSuggestion";
import { applyWikiLinks } from "../parser/wikilink";
import { CANONICAL_DOMAINS, requireCanonicalDomain, type CanonicalDomain } from "../knowledge/domain";
import { canWrite } from "../knowledge/writePolicy";
import type { ApprovalGrant } from "../knowledge/approval";
import { isKnowledgeStatus, managedByForStatus, type KnowledgeStatus } from "../knowledge/types";

export interface KnowledgeSaveInput {
  title: string;
  slug: string;
  /** Legacy category（8種）または canonical domain（11種）。未指定なら domain を使う。 */
  category?: KnowledgeCategory | string;
  /** canonical domain（優先）。未解決なら requireCanonicalDomain が throw する。 */
  domain?: string;
  importance: 1 | 2 | 3;
  content: string;
  /** 既定は promoted（正式Knowledge）。promoted/merged は managed_by:human になる。 */
  status?: KnowledgeStatus | "raw" | "reviewed";
  tags?: string[];
  source_ref?: string[];
  related?: string[];
  /** レガシー: 既存Knowledgeの status を更新する明示操作（note/promote 等）。指定時は Approved Write 扱い。 */
  id?: string;
  sha?: string;
  /**
   * Human Approval 済みであることを示す承認トークン（Phase4 修正1）。
   * サーバー内部の Promotion / Merge ハンドラだけが issueApprovalGrant() で発行できる。
   * HTTPリクエストのJSONからは偽造できないため、外部入力で Human Managed 領域を
   * 書き換えることはできない。未指定なら writePolicy により拒否される。
   */
  grant?: ApprovalGrant;
}

function normalizeStatus(status: KnowledgeSaveInput["status"]): KnowledgeStatus {
  if (!status) return "promoted";
  if (isKnowledgeStatus(status)) return status;
  if (status === "raw") return "captured";
  if (status === "reviewed") return "candidate";
  return "promoted";
}

/**
 * 正式Knowledge（promoted/merged）を Vault へ書き込む low-level writer。
 *
 * Phase4 修正:
 *  - 修正1: managed_by は status から決定（promoted/merged → human）。
 *  - 修正2: domain は requireCanonicalDomain で必須化（personal への自動fallback廃止）。未解決は throw。
 *  - 修正3: Human Managed のため canWrite(grant) 経路でのみ書ける（grantはサーバー内部発行）。
 *  - 修正4（案B）: 新規昇格は常に新規ファイルを作成する。
 *    ただし id 指定のレガシー明示 promote（note/promote 等）は従来どおり同一idで更新する。
 */
export async function saveKnowledge(
  input: KnowledgeSaveInput
): Promise<{ success: boolean; path: string; id: string }> {
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
    grant,
  } = input;

  const domain: CanonicalDomain = requireCanonicalDomain(domainInput ?? category);
  const normalizedStatus = normalizeStatus(status);
  const managedBy = managedByForStatus(normalizedStatus);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateHyphen = `${year}-${month}-${day}`;

  const id = existingId || (await generateUniqueId("kn"));
  const linkedContent = applyWikiLinks(content);

  const finalRelated = [...related];
  if (finalRelated.length === 0 && tags.length > 0) {
    try {
      for (const dom of CANONICAL_DOMAINS) {
        const dir = `memory/knowledge/${dom}`;
        const fileNames = await vaultDocumentStore.listFiles(dir);
        for (const name of fileNames) {
          const filePath = `${dir}/${name}`;
          const { content: fileContent } = await vaultDocumentStore.getFile(filePath);
          const tagsMatch = fileContent.match(/tags:\s*\[([\s\S]*?)\]/);
          if (tagsMatch && tagsMatch[1]) {
            const existingTags = tagsMatch[1].split(",").map((t) => t.replace(/"/g, "").trim());
            if (tags.some((t) => existingTags.includes(t))) {
              const idMatch = fileContent.match(/id:\s*(kn-\d+-\d+)/);
              if (idMatch && idMatch[1] && idMatch[1] !== id && !finalRelated.includes(idMatch[1])) {
                finalRelated.push(idMatch[1]);
                if (finalRelated.length >= 5) break;
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

  const frontmatter = `---
id: ${id}
type: knowledge
domain: ${domain}
category: ${category ?? domain}
status: ${normalizedStatus}
managed_by: ${managedBy}
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

  let finalFileName = `${dateHyphen}-${slug}.md`;
  if (!existingId) {
    // 修正4（案B）: 新規昇格は常に新規ファイル。同名衝突のみ連番回避。
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

  const decision = canWrite(targetFilePath, "", grant);
  if (!decision.allowed) {
    throw new Error(`[knowledge] ${decision.reason} (${targetFilePath})`);
  }

  await vaultDocumentStore.saveFile(targetFilePath, frontmatter, existingId ? sha : undefined);

  return { success: true, path: targetFilePath, id };
}
