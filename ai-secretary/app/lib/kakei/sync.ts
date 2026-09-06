import { createKakeiSource } from "./source";
import { classifyMerchant } from "./classify";
import { normalizeMerchant } from "./normalize";
import { loadLedger, saveLedger, loadRules } from "./ledger";
import type { KakeiTx } from "./types";

function monthKeysBack(n: number): string[] {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * 家計簿アプリ → 分類 → Vault台帳 を月単位で冪等同期。
 * 既にユーザー確定済み（needs_review=false）の行は上書きしない。
 */
export async function runKakeiSync(monthsBack = 2): Promise<{ month: string; count: number }[]> {
  const source = createKakeiSource();
  const rules = await loadRules();
  const out: { month: string; count: number }[] = [];

  for (const month of monthKeysBack(monthsBack)) {
    const raw = await source.fetchTransactions(monthRange(month));
    const { txs: existing, sha } = await loadLedger(month);
    const byId = new Map(existing.map((t) => [t.sourceId, t]));

    const merged: KakeiTx[] = [];
    for (const r of raw) {
      const prev = byId.get(r.sourceId);
      // 確定済みは尊重（手動修正・ルール確定を壊さない）
      if (prev && !prev.needsReview) {
        merged.push(prev);
        continue;
      }
      const merchantNorm = normalizeMerchant(r.merchantRaw);
      const cls = await classifyMerchant(merchantNorm, r.category, rules);
      merged.push({ ...r, merchantNorm, ...cls });
    }
    await saveLedger(month, merged, sha);
    out.push({ month, count: merged.length });
  }
  return out;
}
