/**
 * 収益機会の保存 — Phase 5 §20
 *
 * fingerprint で突き合わせて更新する。毎日新しい機会を作り直さない。
 * 今回生成されなかった機会も消さない（人が検討中のものを消さないため）。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { RevenueOpportunity } from "./types";

const PATH = "memory/personal/revenue/opportunities.md";

function extractJson(markdown: string): RevenueOpportunity[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { opportunities?: RevenueOpportunity[] };
    return Array.isArray(parsed.opportunities) ? parsed.opportunities : [];
  } catch {
    return [];
  }
}

export async function loadOpportunities(): Promise<RevenueOpportunity[]> {
  try {
    const file = await getVaultFile(PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

export async function saveOpportunities(
  incoming: RevenueOpportunity[]
): Promise<RevenueOpportunity[]> {
  let existing: RevenueOpportunity[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(PATH);
    existing = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  const merged = new Map(existing.map((o) => [o.fingerprint, o]));
  for (const opportunity of incoming) merged.set(opportunity.fingerprint, opportunity);
  const opportunities = [...merged.values()].sort((a, b) => b.score - a.score);

  const validated = opportunities.filter((o) => o.status === "VALIDATED");

  const markdown = `---
type: revenue_opportunities
opportunities: ${opportunities.length}
updated: ${new Date().toISOString()}
---

# 収益機会

内部の資産・Skill・実績から導いた候補です。実行は行いません。
実績のないカテゴリでは金額を見積もらず「不明」として扱います。

- 候補: ${opportunities.length}件
- 実際に収益が出たもの: ${validated.length}件

${opportunities
  .slice(0, 10)
  .map(
    (o) =>
      `- [${o.status}] ${o.title}（スコア ${o.score} / データ充足 ${o.coveragePct}%）${
        o.expectedRevenue.known
          ? ` 見込み ¥${o.expectedRevenue.minYen}〜¥${o.expectedRevenue.maxYen}`
          : " 見込み: 不明"
      }`
  )
  .join("\n")}

\`\`\`json
${JSON.stringify({ opportunities }, null, 2)}
\`\`\`
`;

  await saveVaultFile(PATH, markdown, sha);
  return opportunities;
}
