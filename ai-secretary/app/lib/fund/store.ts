/**
 * Fund Department Vaultストア（Phase 1.3）
 * policy / capacity / holdings / recommendations / decisions の読み書き。
 * 全て「人間可読Markdown＋末尾jsonブロック」形式で保存する。
 *
 * セキュリティ（§19）: 保有数量・家計情報・CSV本文をログへ出さないこと。
 * このモジュールでは内容のconsole出力を行わない。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  FundPolicy,
  DEFAULT_POLICY,
  parsePolicyMarkdown,
  buildPolicyMarkdown,
} from "./policy";
import { FundRecommendation } from "./engine";
import { AllocationSummary, Holding, extractHoldingsJson } from "./rakutenCsv";

const PATHS = {
  policy: "memory/personal/fund/policy.md",
  capacity: "memory/personal/fund/capacity.md",
  holdings: "memory/personal/fund/holdings.md",
  recommendations: "memory/personal/fund/recommendations.md",
  decisions: "memory/personal/fund/decisions.md",
} as const;

const MAX_STORED_RECOMMENDATIONS = 100;
const MAX_STORED_DECISIONS = 200;

// ─── 汎用jsonブロック入出力 ─────────────────────────────────

function extractJsonBlock<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJsonFile<T>(path: string): Promise<{ data: T | null; sha?: string }> {
  try {
    const file = await getVaultFile(path);
    return { data: extractJsonBlock<T>(file.content || ""), sha: file.sha };
  } catch {
    return { data: null };
  }
}

async function writeJsonFile(
  path: string,
  title: string,
  description: string,
  data: unknown,
  sha?: string
): Promise<void> {
  const md = `---
type: fund_store
updated: ${new Date().toISOString().slice(0, 10)}
---

# ${title}

${description}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
  await saveVaultFile(path, md, sha);
}

// ─── ポリシー ───────────────────────────────────────────────

export async function loadPolicy(): Promise<{
  policy: FundPolicy;
  source: "vault" | "default";
}> {
  try {
    const file = await getVaultFile(PATHS.policy);
    const parsed = parsePolicyMarkdown(file.content || "");
    if (parsed) return { policy: parsed, source: "vault" };
  } catch {
    // fallthrough
  }
  return { policy: DEFAULT_POLICY, source: "default" };
}

export async function savePolicy(policy: FundPolicy): Promise<void> {
  let sha: string | undefined;
  try {
    const existing = await getVaultFile(PATHS.policy);
    sha = existing.sha;
  } catch {
    // 新規
  }
  await saveVaultFile(PATHS.policy, buildPolicyMarkdown(policy), sha);
}

// ─── capacity（投資可能額） ─────────────────────────────────

export interface CapacityData {
  target_month: string | null;
  investable_amount: number | null;
  personal_cash_floor: number | null;
  already_invested: number | null;
  source: "manual" | "flow-plus";
  calculated_at: string | null;
  confidence?: "low" | "medium" | "high";
  missing_data?: string[];
}

export async function loadCapacity(): Promise<CapacityData | null> {
  const { data } = await readJsonFile<CapacityData>(PATHS.capacity);
  return data;
}

// ─── holdings（保有スナップショット） ───────────────────────

export interface HoldingsData {
  importedAt: string;
  summary: AllocationSummary;
  holdings: Holding[];
}

export async function loadHoldings(): Promise<HoldingsData | null> {
  try {
    const file = await getVaultFile(PATHS.holdings);
    return extractHoldingsJson(file.content || "");
  } catch {
    return null;
  }
}

// ─── recommendations（AI提案の記録・§15） ───────────────────

export interface StoredRecommendation extends FundRecommendation {
  id: string;
}

export async function loadRecommendations(): Promise<StoredRecommendation[]> {
  const { data } = await readJsonFile<StoredRecommendation[]>(PATHS.recommendations);
  return Array.isArray(data) ? data : [];
}

export async function appendRecommendation(
  rec: FundRecommendation
): Promise<StoredRecommendation> {
  const { data, sha } = await readJsonFile<StoredRecommendation[]>(PATHS.recommendations);
  const list = Array.isArray(data) ? data : [];
  const stored: StoredRecommendation = {
    ...rec,
    id: `rec-${Date.now()}-${rec.ticker}`,
  };
  const next = [stored, ...list].slice(0, MAX_STORED_RECOMMENDATIONS);
  await writeJsonFile(
    PATHS.recommendations,
    "Fund OS — AI提案ログ",
    "AI投資提案の記録（新しい順）。/api/fund/evaluate が追記する。手動編集しないこと。",
    next,
    sha
  );
  return stored;
}

// ─── decisions（本人判断の記録・§15/§17） ───────────────────

export type DecisionAction =
  | "acknowledged" // AI提案を確認した
  | "bought"
  | "skipped"
  | "trimmed"
  | "sold";

export interface StoredDecision {
  id: string;
  recommendationId: string | null;
  ticker: string;
  action: DecisionAction;
  note: string | null;
  amountJpy: number | null;
  shares: number | null;
  decidedAt: string;
}

export async function loadDecisions(): Promise<StoredDecision[]> {
  const { data } = await readJsonFile<StoredDecision[]>(PATHS.decisions);
  return Array.isArray(data) ? data : [];
}

export async function appendDecision(input: {
  recommendationId?: string | null;
  ticker: string;
  action: DecisionAction;
  note?: string | null;
  amountJpy?: number | null;
  shares?: number | null;
}): Promise<StoredDecision> {
  const { data, sha } = await readJsonFile<StoredDecision[]>(PATHS.decisions);
  const list = Array.isArray(data) ? data : [];
  const stored: StoredDecision = {
    id: `dec-${Date.now()}-${input.ticker.toUpperCase()}`,
    recommendationId: input.recommendationId ?? null,
    ticker: input.ticker.toUpperCase(),
    action: input.action,
    note: input.note ?? null,
    amountJpy: input.amountJpy ?? null,
    shares: input.shares ?? null,
    decidedAt: new Date().toISOString(),
  };
  const next = [stored, ...list].slice(0, MAX_STORED_DECISIONS);
  await writeJsonFile(
    PATHS.decisions,
    "Fund OS — 本人判断ログ",
    "AI提案に対する本人の確認・売買判断の記録（新しい順）。注文の自動実行は行われない。",
    next,
    sha
  );
  return stored;
}
