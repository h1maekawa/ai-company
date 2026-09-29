import { getVaultFile, saveVaultFile } from "@/app/lib/vault";
import type { IntelligenceToday, InvestmentDecisionRecord } from "./types";

const TODAY_PATH = "memory/personal/fund/intelligence-today.json";
const DECISIONS_PATH = "memory/personal/fund/intelligence-decisions.json";

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try { const file = await getVaultFile(path); return file.content.trim() ? JSON.parse(file.content) as T : fallback; }
  catch { return fallback; }
}

export async function loadIntelligenceToday(): Promise<IntelligenceToday | null> {
  return loadJson<IntelligenceToday | null>(TODAY_PATH, null);
}

export async function saveIntelligenceToday(value: IntelligenceToday): Promise<void> {
  const current = await getVaultFile(TODAY_PATH).catch(() => ({ content: "", sha: undefined }));
  await saveVaultFile(TODAY_PATH, `${JSON.stringify(value, null, 2)}\n`, current.sha);
}

export async function loadInvestmentDecisions(): Promise<InvestmentDecisionRecord[]> {
  return loadJson<InvestmentDecisionRecord[]>(DECISIONS_PATH, []);
}

export async function appendInvestmentDecision(record: InvestmentDecisionRecord): Promise<void> {
  const current = await getVaultFile(DECISIONS_PATH).catch(() => ({ content: "", sha: undefined }));
  const existing = current.content.trim() ? JSON.parse(current.content) as InvestmentDecisionRecord[] : [];
  if (existing.some((item) => item.id === record.id)) return;
  await saveVaultFile(DECISIONS_PATH, `${JSON.stringify([...existing, record], null, 2)}\n`, current.sha);
}
