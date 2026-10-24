import { getVaultFile, saveVaultFile } from "@/app/lib/vault";
import type { IntelligenceToday, InvestmentDecisionRecord } from "./types";

const TODAY_PATH = "memory/personal/fund/intelligence-today.json";
const DECISIONS_PATH = "memory/personal/fund/intelligence-decisions.json";
const THEME_HISTORY_PATH = "memory/personal/fund/theme-history/index.json";

export type IntelligenceTodayRead =
  | { status: "AVAILABLE"; data: IntelligenceToday }
  | { status: "NOT_FOUND"; data: null }
  | { status: "UNAVAILABLE"; data: null; reason: "READ_FAILED" }
  | { status: "INVALID_DATA"; data: null };

export async function readIntelligenceToday(): Promise<IntelligenceTodayRead> {
  let file;
  try {
    file = await getVaultFile(TODAY_PATH);
  } catch {
    return { status: "UNAVAILABLE", data: null, reason: "READ_FAILED" };
  }
  if (file.exists === false || (file.exists === undefined && !file.content.trim())) {
    return { status: "NOT_FOUND", data: null };
  }
  try {
    const data = JSON.parse(file.content) as IntelligenceToday;
    if (!data || typeof data !== "object" || typeof data.asOf !== "string" || !Number.isFinite(Date.parse(data.asOf))) {
      return { status: "INVALID_DATA", data: null };
    }
    return { status: "AVAILABLE", data };
  } catch {
    return { status: "INVALID_DATA", data: null };
  }
}

export async function loadIntelligenceToday(): Promise<IntelligenceToday | null> {
  const result = await readIntelligenceToday();
  if (result.status === "UNAVAILABLE") throw new Error(`INTELLIGENCE_TODAY_${result.reason}`);
  return result.data;
}

export async function saveIntelligenceToday(value: IntelligenceToday): Promise<void> {
  const current = await getVaultFile(TODAY_PATH);
  await saveVaultFile(TODAY_PATH, `${JSON.stringify(value, null, 2)}\n`, current.sha);
}
export async function saveThemeSnapshot(value: IntelligenceToday): Promise<void> {
  const current = await getVaultFile(THEME_HISTORY_PATH);
  const existing = current.content.trim() ? JSON.parse(current.content) as Array<{ asOf: string; themes: IntelligenceToday["themeStrength"] }> : [];
  const day = value.asOf.slice(0, 10), next = [{ asOf: value.asOf, themes: value.themeStrength }, ...existing.filter((item) => item.asOf.slice(0, 10) !== day)].slice(0, 365);
  await saveVaultFile(THEME_HISTORY_PATH, `${JSON.stringify(next, null, 2)}\n`, current.sha);
}

export async function loadInvestmentDecisions(): Promise<InvestmentDecisionRecord[]> {
  const file = await getVaultFile(DECISIONS_PATH);
  if (file.exists === false || (file.exists === undefined && !file.content.trim())) return [];
  return JSON.parse(file.content) as InvestmentDecisionRecord[];
}

export async function appendInvestmentDecision(record: InvestmentDecisionRecord): Promise<void> {
  const current = await getVaultFile(DECISIONS_PATH);
  const existing = current.content.trim() ? JSON.parse(current.content) as InvestmentDecisionRecord[] : [];
  if (existing.some((item) => item.id === record.id)) return;
  await saveVaultFile(DECISIONS_PATH, `${JSON.stringify([...existing, record], null, 2)}\n`, current.sha);
}
