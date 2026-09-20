import { getVaultFile, saveVaultFile } from "../../vault";
import { hasDuplicateExternalReference, type InvestmentTransaction } from "./types";

const TRANSACTION_LEDGER_PATH = "memory/personal/fund/transaction-ledger.md";

function extractLedger(markdown: string): InvestmentTransaction[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { transactions?: InvestmentTransaction[] };
    return Array.isArray(parsed.transactions) ? parsed.transactions : [];
  } catch { return []; }
}

function buildLedgerMarkdown(entries: InvestmentTransaction[]): string {
  const recent = [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((entry) =>
      `| ${entry.executedAt.slice(0, 10)} | ${entry.kind} | ${entry.ticker} | ${entry.transactionType} | ${entry.quantity} | ${entry.price} ${entry.currency} | ${entry.source} |`)
    .join("\n");
  return `---\ntype: investment_transaction_ledger\nentries: ${entries.length}\nupdated: ${new Date().toISOString()}\n---\n\n# Investment Transaction Ledger\n\n実際に約定し、人間が確認した取引FactのAppend-only SSOTです。\nAI Recommendation、Human ACCEPT、Holdings Snapshot、Decision Outcomeから自動生成しません。\n修正・取消は元レコードを変更せずCorrection / Reversalを追記します。\n\n## 直近の記録\n\n| 約定日 | 種別 | Ticker | 売買 | 数量 | 価格 | Source |\n|---|---|---|---|---:|---:|---|\n${recent || "| — | — | — | — | — | — | — |"}\n\n\`\`\`json\n${JSON.stringify({ transactions: entries }, null, 2)}\n\`\`\`\n`;
}

export async function loadInvestmentTransactions(): Promise<InvestmentTransaction[]> {
  try {
    const file = await getVaultFile(TRANSACTION_LEDGER_PATH);
    return extractLedger(file.content || "");
  } catch { return []; }
}

/** 既存レコードは変更せず末尾へ追記する。 */
export async function appendInvestmentTransaction(
  entry: InvestmentTransaction
): Promise<InvestmentTransaction[]> {
  let entries: InvestmentTransaction[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(TRANSACTION_LEDGER_PATH);
    entries = extractLedger(file.content || "");
    sha = file.sha;
  } catch { /* 初回作成 */ }

  if (hasDuplicateExternalReference(entries, entry)) throw new Error("DUPLICATE_EXTERNAL_REFERENCE");
  const next = [...entries, entry];
  await saveVaultFile(TRANSACTION_LEDGER_PATH, buildLedgerMarkdown(next), sha);
  return next;
}
