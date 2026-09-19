/** Append-only Business Cost Ledger。Creator事業の実費の正本。 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  effectiveBusinessCostEntries,
  type BusinessCostEntry,
} from "./businessCost";

const BUSINESS_COST_PATH = "memory/personal/revenue/business-cost-ledger.md";

function extractJson(markdown: string): BusinessCostEntry[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { entries?: BusinessCostEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function yen(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function buildMarkdown(entries: BusinessCostEntry[]): string {
  const confirmed = effectiveBusinessCostEntries(
    entries.filter((entry) => entry.confirmedByHuman)
  );
  const confirmedYen = confirmed.reduce((sum, entry) => sum + entry.amountYen, 0);
  const unconfirmed = entries.filter((entry) => !entry.confirmedByHuman).length;
  const recent = [...entries]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 15)
    .map(
      (entry) =>
        `| ${entry.occurredAt.slice(0, 10)} | ${entry.kind} | ${entry.category} | ${yen(entry.amountYen)} | ${
          entry.confirmedByHuman ? "確認済み" : "未確認"
        } | ${entry.note ?? ""} |`
    )
    .join("\n");

  return `---
type: business_cost_ledger
entries: ${entries.length}
updated: ${new Date().toISOString()}
---

# Creator事業コスト台帳

追記のみ。修正・取消は既存行を書き換えず別Entryとして記録します。
AIの推測コストは実績に含めず、人間確認済みのCreator事業直接費だけを集計します。
株式購入額・Investment P/Lはこの台帳へ記録しません。

- 確認済み実効コスト: ${yen(confirmedYen)}
- 人の確認待ち: ${unconfirmed}件

| 日付 | 種別 | カテゴリ | 金額 | 確認 | メモ |
|---|---|---|---:|---|---|
${recent || "| — | — | — | — | — | （まだありません） |"}

\`\`\`json
${JSON.stringify({ entries }, null, 2)}
\`\`\`
`;
}

export async function loadBusinessCostEntries(): Promise<BusinessCostEntry[]> {
  try {
    const file = await getVaultFile(BUSINESS_COST_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

export async function appendBusinessCostEntry(
  entry: BusinessCostEntry
): Promise<BusinessCostEntry[]> {
  let entries: BusinessCostEntry[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(BUSINESS_COST_PATH);
    entries = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  const next = [...entries, entry];
  await saveVaultFile(BUSINESS_COST_PATH, buildMarkdown(next), sha);
  return next;
}
