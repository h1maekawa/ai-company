import { getVaultFile, saveVaultFile } from "../../vault";
import type { ContentContribution, ContentRelation, EvidenceFile } from "./types";

export const CONTENT_EVIDENCE_PATH = "memory/personal/note/content-evidence.md";

function extractJson(markdown: string): EvidenceFile {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return { relations: [], contributions: [] };
  try {
    const parsed = JSON.parse(match[1]) as Partial<EvidenceFile>;
    return {
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
      contributions: Array.isArray(parsed.contributions) ? parsed.contributions : [],
    };
  } catch {
    return { relations: [], contributions: [] };
  }
}

function markdown(file: EvidenceFile): string {
  return `---
type: content_evidence
updated: ${new Date().toISOString()}
---

# Content Relation / Contribution Evidence

PublishedContent間の関係とCompany Revenueへの貢献証跡です。
Revenue金額の会計SSOTはCompany Revenue Ledgerであり、このファイルでは複製しません。

- Relations: ${file.relations.length}件
- Assisted Contributions: ${file.contributions.length}件

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`
`;
}

export async function loadContentEvidence(): Promise<EvidenceFile> {
  try {
    const file = await getVaultFile(CONTENT_EVIDENCE_PATH);
    return extractJson(file.content || "");
  } catch {
    return { relations: [], contributions: [] };
  }
}

async function saveContentEvidence(file: EvidenceFile): Promise<EvidenceFile> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(CONTENT_EVIDENCE_PATH)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(CONTENT_EVIDENCE_PATH, markdown(file), sha);
  return file;
}

export async function appendContentRelation(
  relation: ContentRelation
): Promise<EvidenceFile> {
  const current = await loadContentEvidence();
  if (current.relations.some((item) => item.id === relation.id)) return current;
  return saveContentEvidence({ ...current, relations: [...current.relations, relation] });
}

export async function appendContentContribution(
  contribution: ContentContribution
): Promise<EvidenceFile> {
  const current = await loadContentEvidence();
  if (current.contributions.some((item) => item.id === contribution.id)) return current;
  return saveContentEvidence({
    ...current,
    contributions: [...current.contributions, contribution],
  });
}
