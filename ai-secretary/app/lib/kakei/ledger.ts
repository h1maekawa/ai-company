import { getVaultFile, saveVaultFile } from "@/app/lib/vault";
import type { KakeiTx } from "./types";

const DIR = "memory/personal/kakei";
export const RULES_PATH = `${DIR}/merchant-rules.md`;
export const PROFILE_PATH = `${DIR}/profile.md`;
export const ledgerPath = (month: string) => `${DIR}/${month}.md`;

/* ── 月次台帳 ─────────────────────────── */

const HEADER =
  "| date | merchant_raw | merchant_norm | amount | category | confidence | needs_review | source_id |";
const SEP = "|---|---|---|---:|---|---:|:---:|---|";

/** Markdown表を壊す文字（| と改行）を落とす。台帳は1行=1取引が前提 */
function cell(value: string): string {
  return value.replace(/[|\r\n]+/g, " ").trim();
}

export function parseLedger(content: string): KakeiTx[] {
  const rows: KakeiTx[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("merchant_norm") || /^\|[-:\s|]+\|$/.test(line.trim())) continue;
    const c = line.split("|").map((s) => s.trim());
    // c[0] は先頭"|"の左側で空
    if (c.length < 9) continue;
    rows.push({
      date: c[1],
      merchantRaw: c[2],
      merchantNorm: c[3],
      amount: Number(c[4]) || 0,
      category: c[5],
      confidence: Number(c[6]) || 0,
      needsReview: c[7] === "true",
      sourceId: c[8],
    });
  }
  return rows;
}

export function serializeLedger(month: string, txs: KakeiTx[]): string {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const body = sorted
    .map((t) =>
      `| ${cell(t.date)} | ${cell(t.merchantRaw)} | ${cell(t.merchantNorm)} | ${t.amount} | ${cell(t.category)} | ${t.confidence.toFixed(2)} | ${t.needsReview} | ${cell(t.sourceId)} |`
    )
    .join("\n");
  return `---\nmonth: ${month}\nsynced_at: ${new Date().toISOString()}\ncount: ${sorted.length}\n---\n\n${HEADER}\n${SEP}\n${body}\n`;
}

export async function loadLedger(month: string): Promise<{ txs: KakeiTx[]; sha?: string }> {
  const f = await getVaultFile(ledgerPath(month));
  return { txs: f.content ? parseLedger(f.content) : [], sha: f.sha };
}

export async function saveLedger(month: string, txs: KakeiTx[], sha?: string): Promise<void> {
  await saveVaultFile(ledgerPath(month), serializeLedger(month, txs), sha);
}

/* ── 学習ルール ───────────────────────── */

function parseRules(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of (content || "").split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("merchant_norm") || /^\|[-:\s|]+\|$/.test(line.trim())) continue;
    const c = line.split("|").map((s) => s.trim());
    if (c.length >= 3 && c[1]) map.set(c[1], c[2]);
  }
  return map;
}

export async function loadRules(): Promise<Map<string, string>> {
  const f = await getVaultFile(RULES_PATH);
  return parseRules(f.content);
}

export async function upsertRule(merchantNorm: string, category: string): Promise<void> {
  const f = await getVaultFile(RULES_PATH);
  const map = parseRules(f.content);
  map.set(cell(merchantNorm), cell(category));
  const rows = [...map.entries()].map(([m, cat]) => `| ${m} | ${cat} |`).join("\n");
  const content = `# 店名→カテゴリ 学習ルール\n\n| merchant_norm | category |\n|---|---|\n${rows}\n`;
  await saveVaultFile(RULES_PATH, content, f.sha);
}

/* ── 収入・固定費（任意）───────────────── */

export async function loadBudget(): Promise<{ income?: number; fixed?: number }> {
  const f = await getVaultFile(PROFILE_PATH);
  const num = (k: string) => {
    const m = (f.content || "").match(new RegExp(`${k}:\\s*(\\d+)`));
    return m ? Number(m[1]) : undefined;
  };
  return { income: num("net_monthly_income"), fixed: num("fixed_costs") };
}

/* ── 集計 ─────────────────────────────── */

export function aggregate(txs: KakeiTx[]) {
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const t of txs) {
    total += t.amount;
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  }
  const needsReview = txs.filter((t) => t.needsReview);
  return { total, byCategory, needsReview, count: txs.length };
}
