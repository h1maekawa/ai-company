import { createKakeiSource } from "./source";
import { classifyMerchant } from "./classify";
import { normalizeMerchant } from "./normalize";
import { loadLedger, saveLedger, loadRules } from "./ledger";
import { monthKeysBack, monthRange } from "./month";
import type { KakeiTx } from "./types";

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
