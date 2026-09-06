import { getVaultFile, saveVaultFile } from "@/app/lib/vault";
import { parseSnapshot, serializeSnapshot, snapshotPath } from "./snapshotFormat";
import type { KakeiSummary } from "./types";

/** 家計簿アプリの月次集計スナップショットの Vault 読み書き */

export { snapshotPath } from "./snapshotFormat";

export async function loadSnapshot(
  month: string
): Promise<{ summary: KakeiSummary | null; sha?: string }> {
  const f = await getVaultFile(snapshotPath(month));
  return { summary: f.content ? parseSnapshot(f.content) : null, sha: f.sha };
}

export async function saveSnapshot(summary: KakeiSummary, sha?: string): Promise<void> {
  await saveVaultFile(snapshotPath(summary.month), serializeSnapshot(summary), sha);
}
