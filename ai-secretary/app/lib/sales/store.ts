/**
 * Salesの長期記録Store。
 *
 * 顧客の一次記録を一般Knowledgeへ自動昇格させず、Primary Source、
 * AI Summary、Research、Decision、Result、Learningを明示的に分離する。
 * Runtime queueやsessionは保存しない。
 */

import { getVaultFile, saveVaultFile } from "../vault";

export const SALES_CATALOG_PATH = "memory/company/sales/catalog.md";

export const SALES_RECORD_TYPES = [
  "primary-source",
  "ai-summary",
  "research",
  "decision",
  "result",
  "learning",
] as const;

export type SalesRecordType = (typeof SALES_RECORD_TYPES)[number];

export type SalesReviewStatus = "review-pending" | "verified" | "rejected";

export type SalesRecord = {
  id: string;
  recordType: SalesRecordType;
  title: string;
  customerId?: string;
  caseId?: string;
  sourceRecordIds?: string[];
  body: string;
  sensitive: boolean;
  reviewStatus: SalesReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type SalesCatalog = {
  schemaVersion: 1;
  records: SalesRecord[];
};

export const emptySalesCatalog = (): SalesCatalog => ({
  schemaVersion: 1,
  records: [],
});

export function parseSalesCatalog(markdown: string): SalesCatalog {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return emptySalesCatalog();
  try {
    const value = JSON.parse(match[1]) as Partial<SalesCatalog>;
    return {
      schemaVersion: 1,
      records: Array.isArray(value.records) ? value.records : [],
    };
  } catch {
    return emptySalesCatalog();
  }
}

export function buildSalesCatalog(catalog: SalesCatalog): string {
  const counts = SALES_RECORD_TYPES.map((type) => {
    const count = catalog.records.filter((record) => record.recordType === type).length;
    return `- ${type}: ${count}`;
  }).join("\n");

  return `---
type: sales_catalog
schemaVersion: 1
records: ${catalog.records.length}
updated: ${new Date().toISOString()}
---

# Sales Artifact Catalog

顧客・案件・商談の長期記録です。一次記録、AI要約、調査、本人判断、
結果、学習を分離します。一次記録は一般Knowledgeへ自動昇格しません。

## Record types

${counts}

\`\`\`json
${JSON.stringify({ ...catalog, schemaVersion: 1 }, null, 2)}
\`\`\`
`;
}

export async function loadSalesCatalog(): Promise<SalesCatalog> {
  const file = await getVaultFile(SALES_CATALOG_PATH);
  return parseSalesCatalog(file.content || "");
}

export async function saveSalesCatalog(catalog: SalesCatalog): Promise<SalesCatalog> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(SALES_CATALOG_PATH)).sha;
  } catch {
    // Initial creation.
  }
  await saveVaultFile(SALES_CATALOG_PATH, buildSalesCatalog(catalog), sha);
  return catalog;
}
