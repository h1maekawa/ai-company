import { createKakeiSource } from "./source";
import { monthKeysBack } from "./month";
import { loadSnapshot, saveSnapshot } from "./snapshot";

/**
 * 家計簿アプリの集計を Vault へキャッシュする。
 * 取引を取り込んで分類し直すことはしない（分類の正はあちら側）。
 */
export async function runKakeiSync(monthsBack = 2): Promise<{ month: string; total: number }[]> {
  const source = createKakeiSource();
  const out: { month: string; total: number }[] = [];

  for (const month of monthKeysBack(monthsBack)) {
    const summary = await source.fetchSummary(month);
    const { sha } = await loadSnapshot(month);
    await saveSnapshot(summary, sha);
    out.push({ month, total: summary.totalSpent });
  }
  return out;
}
