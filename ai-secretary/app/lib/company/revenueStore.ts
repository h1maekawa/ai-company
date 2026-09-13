/**
 * 収益の記録 — Phase 5 §3 / §7 / §8 / §43
 *
 * §8 の要点: 履歴は Append Only。
 * 修正は上書きではなく correction / reversal を別エントリとして積む。
 * 収益の履歴を上書きで消すと、「いつ何が起きたか」が復元できなくなる。
 *
 * §43 の要点: 口座番号等は保存しない。
 * 保存するのは金額・カテゴリ・日付・関連Mission・メモだけ。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  isAiGeneratedRevenue,
  isInvestmentRevenue,
  type RevenueAttribution,
  type RevenueSourceType,
} from "./revenue";

const REVENUE_PATH = "memory/personal/revenue/ledger.md";

/** 収益エントリの種別。修正・取消を上書きではなく追記で表す（§8） */
export type RevenueEntryKind = "revenue" | "correction" | "reversal";

export type RevenueEntry = RevenueAttribution & {
  kind: RevenueEntryKind;
  /** correction / reversal が対象とする元エントリ */
  correctsId?: string;
  /** どのMissionから生まれた収益か（§29） */
  missionId?: string;
  /** どのOpportunityから生まれたか（§30） */
  opportunityId?: string;
  businessId?: string;
  note?: string;
  createdAt: string;
};

const VALID_SOURCES: RevenueSourceType[] = [
  "note",
  "affiliate",
  "web",
  "ai_service",
  "saas",
  "investment",
  "other",
];

/* ─── 検証（§9） ────────────────────────────────── */

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateRevenueInput(input: Partial<RevenueEntry>): ValidationResult {
  if (typeof input.amountYen !== "number" || !Number.isFinite(input.amountYen)) {
    return { ok: false, error: "金額は数値で指定してください" };
  }
  // 取消は reversal で表す。金額0以下の「収益」は認めない
  if (input.kind !== "reversal" && input.amountYen <= 0) {
    return { ok: false, error: "金額は0より大きい値にしてください（取消は reversal で記録します）" };
  }
  if (input.kind === "reversal" && !input.correctsId) {
    return { ok: false, error: "取消には対象の収益ID（correctsId）が必要です" };
  }
  if (!input.sourceType || !VALID_SOURCES.includes(input.sourceType)) {
    return { ok: false, error: `収益源が不正です（${VALID_SOURCES.join(" / ")}）` };
  }
  if (typeof input.confirmedByHuman !== "boolean") {
    return { ok: false, error: "confirmedByHuman を明示してください" };
  }
  return { ok: true };
}

/* ─── 保存 ──────────────────────────────────────── */

function extractJson(markdown: string): RevenueEntry[] {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { entries?: RevenueEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

const yen = (value: number): string => `¥${Math.round(value).toLocaleString("ja-JP")}`;

function buildMarkdown(entries: RevenueEntry[]): string {
  const effective = effectiveEntries(entries);
  const ai = effective.filter(isAiGeneratedRevenue).reduce((s, e) => s + e.amountYen, 0);
  const investment = effective.filter(isInvestmentRevenue).reduce((s, e) => s + e.amountYen, 0);
  const unconfirmed = entries
    .filter((e) => !e.confirmedByHuman)
    .reduce((s, e) => s + e.amountYen, 0);

  const recent = [...entries]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 15)
    .map(
      (e) =>
        `| ${e.occurredAt.slice(0, 10)} | ${e.kind} | ${e.sourceType} | ${yen(e.amountYen)} | ${
          e.confirmedByHuman ? "確認済み" : "未確認"
        } | ${e.note ?? ""} |`
    )
    .join("\n");

  return `---
type: revenue_ledger
entries: ${entries.length}
updated: ${new Date().toISOString()}
---

# 収益台帳

追記のみ。修正・取消は上書きではなく別エントリとして積みます。
口座番号などの金融の生データは保存しません。

- AI Company経由の収益: ${yen(ai)}
- 投資による損益: ${yen(investment)}
- 人の確認待ち（集計対象外）: ${yen(unconfirmed)}

## 直近の記録

| 日付 | 種別 | 収益源 | 金額 | 確認 | メモ |
|---|---|---|---:|---|---|
${recent || "| — | — | — | — | — | （まだありません） |"}

\`\`\`json
${JSON.stringify({ entries }, null, 2)}
\`\`\`
`;
}

export async function loadRevenueEntries(): Promise<RevenueEntry[]> {
  try {
    const file = await getVaultFile(REVENUE_PATH);
    return extractJson(file.content || "");
  } catch {
    return [];
  }
}

/**
 * 追記する。既存エントリは一切書き換えない（§8）。
 * 保存に失敗したら呼び出し側へ返す（収益の記録は静かに失敗させない）。
 */
export async function appendRevenueEntry(entry: RevenueEntry): Promise<RevenueEntry[]> {
  let entries: RevenueEntry[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(REVENUE_PATH);
    entries = extractJson(file.content || "");
    sha = file.sha;
  } catch {
    // 初回作成
  }

  const next = [...entries, entry];
  await saveVaultFile(REVENUE_PATH, buildMarkdown(next), sha);
  return next;
}

/**
 * 取消・修正を反映した「実効の収益」を返す。
 *
 * reversal で取り消されたエントリは集計から外す。
 * 元エントリ自体は履歴として残り続ける（消さない）。
 */
export function effectiveEntries(entries: RevenueEntry[]): RevenueEntry[] {
  const reversed = new Set(
    entries.filter((e) => e.kind === "reversal" && e.correctsId).map((e) => e.correctsId as string)
  );
  const correctedBy = new Map<string, RevenueEntry>();
  for (const entry of entries) {
    if (entry.kind === "correction" && entry.correctsId) {
      correctedBy.set(entry.correctsId, entry);
    }
  }

  return entries
    .filter((entry) => entry.kind === "revenue")
    .filter((entry) => !reversed.has(entry.id))
    // 修正があれば修正後の値を使う
    .map((entry) => correctedBy.get(entry.id) ?? entry);
}

export function createRevenueEntry(
  input: Omit<RevenueEntry, "id" | "createdAt" | "kind"> & { kind?: RevenueEntryKind },
  now: Date = new Date()
): RevenueEntry {
  return {
    ...input,
    kind: input.kind ?? "revenue",
    id: `rev_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(),
  };
}
