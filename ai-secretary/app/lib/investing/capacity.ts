/**
 * 家計簿（Flow+ / household-finance）から当月の投資可能額を取得する。
 *
 * 金額はすべて家計簿側で決定的に計算されたものをそのまま使う。
 * こちら側で推定や補完はしない（取得できなければ「未取得」と表示する）。
 *
 * 必要な環境変数:
 *   FLOWPLUS_BASE_URL   … 家計簿アプリのURL（例 https://household-finance-smoky.vercel.app）
 *   FLOWPLUS_API_SECRET … 家計簿アプリで発行した連携シークレット
 */

import { getVaultFile, saveVaultFile } from "../vault";

const CAPACITY_PATH = "memory/personal/fund/capacity.md";

export type CapacityBreakdown = { label: string; amount: number; sign: "+" | "-" };

export type Capacity = {
  target_month: string;
  available_cash: number | null;
  confirmed_income: number;
  expected_income: number;
  confirmed_expenses: number;
  pending_card_amount: number;
  fixed_expenses: number;
  scheduled_expenses: number;
  already_invested: number;
  personal_cash_floor: number;
  investable_amount: number | null;
  calculated_at: string;
  data_freshness: "current" | "stale" | "unknown";
  confidence: "high" | "medium" | "low";
  missing_data: string[];
  breakdown: CapacityBreakdown[];
  /** 家計側の「今月あといくら使えるか」 */
  living?: {
    variable_budget: number;
    spent: number;
    remaining: number;
    days_left: number;
    daily_allowance: number;
    pace: number;
  };
  balance_recorded_at?: string | null;
  /** データの出所（"flow_plus" = 家計簿から取得、"manual" = capacity.md の手入力） */
  source: "flow_plus" | "manual";
};

export function isCapacityConfigured(): boolean {
  return Boolean(process.env.FLOWPLUS_BASE_URL && process.env.FLOWPLUS_API_SECRET);
}

function currentMonthJst(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/** 接続に失敗したときの理由（シークレットは絶対に含めない） */
export type CapacityFailure = { reason: string; hint: string };

let lastFailure: CapacityFailure | null = null;

export function getLastFailure(): CapacityFailure | null {
  return lastFailure;
}

/** 家計簿アプリから取得する。到達できなければ null（理由は lastFailure に残す） */
async function fetchFromFlowPlus(month: string): Promise<Capacity | null> {
  const base = process.env.FLOWPLUS_BASE_URL;
  const secret = process.env.FLOWPLUS_API_SECRET;
  if (!base || !secret) {
    lastFailure = {
      reason: "未設定",
      hint: "FLOWPLUS_BASE_URL と FLOWPLUS_API_SECRET を設定して再デプロイしてください",
    };
    return null;
  }

  const url = `${base.replace(/\/$/, "")}/api/integrations/investment-capacity?month=${month}`;

  try {
    const response = await fetch(url, {
      headers: { "x-import-secret": secret.trim() },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      // 原因の切り分けに必要な情報だけを残す（シークレットは出さない）
      lastFailure = {
        reason: `家計簿APIが ${response.status} を返しました`,
        hint:
          response.status === 401
            ? "連携キーが一致していません。家計簿の設定→連携タブで発行し直してください"
            : response.status === 404
              ? "URLが違う可能性があります。FLOWPLUS_BASE_URL を確認してください"
              : body.slice(0, 120),
      };
      console.error("[investing/capacity] 家計簿APIがエラー:", response.status, body.slice(0, 200));
      return null;
    }

    const data = (await response.json()) as Capacity;
    lastFailure = null;
    return { ...data, source: "flow_plus" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastFailure = {
      reason: "家計簿アプリへ接続できませんでした",
      hint: `URLを確認してください（${new URL(url).origin}）: ${message.slice(0, 80)}`,
    };
    console.error("[investing/capacity] 接続失敗:", message);
    return null;
  }
}

/** 旧来の手入力（capacity.md のjsonブロック）を読む */
async function loadManual(month: string): Promise<Capacity | null> {
  try {
    const file = await getVaultFile(CAPACITY_PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return null;
    const data = JSON.parse(match[1]) as Partial<Capacity> & {
      investable_amount?: number | null;
    };
    if (typeof data.investable_amount !== "number") return null;

    return {
      target_month: data.target_month ?? month,
      available_cash: null,
      confirmed_income: 0,
      expected_income: 0,
      confirmed_expenses: 0,
      pending_card_amount: 0,
      fixed_expenses: 0,
      scheduled_expenses: 0,
      already_invested: 0,
      personal_cash_floor: data.personal_cash_floor ?? 0,
      investable_amount: data.investable_amount,
      calculated_at: data.calculated_at ?? new Date().toISOString(),
      data_freshness: "unknown",
      confidence: "low",
      missing_data: ["手入力の値です（家計簿連携は未設定）"],
      breakdown: [],
      source: "manual",
    };
  } catch {
    return null;
  }
}

function buildMarkdown(capacity: Capacity): string {
  const yen = (value: number | null) =>
    value === null ? "未取得" : `${value.toLocaleString("ja-JP")}円`;

  const breakdownLines =
    capacity.breakdown.length > 0
      ? capacity.breakdown.map((row) => `- ${row.sign} ${row.label}: ${yen(row.amount)}`)
      : ["（内訳なし）"];

  const livingLines = capacity.living
    ? [
        `- 今月の変動費予算: ${yen(capacity.living.variable_budget)}`,
        `- 使用済み: ${yen(capacity.living.spent)}`,
        `- **残り: ${yen(capacity.living.remaining)}**（あと${capacity.living.days_left}日 / 1日あたり ${yen(capacity.living.daily_allowance)}）`,
      ]
    : ["（家計簿から取得できていません）"];

  return `---
id: fund-capacity
type: fund_capacity
source: ${capacity.source}
target_month: ${capacity.target_month}
investable_amount: ${capacity.investable_amount ?? "null"}
confidence: ${capacity.confidence}
updated: ${capacity.calculated_at}
---

# ${capacity.target_month} の投資可能額

家計簿アプリが算出した金額をそのまま取り込んでいます（このファイルは自動更新されます）。

## 投資に回せる額

**${yen(capacity.investable_amount)}**（信頼度: ${capacity.confidence}）

${breakdownLines.join("\n")}

## 今月の生活費

${livingLines.join("\n")}

${capacity.missing_data.length > 0 ? `## 不足しているデータ\n\n${capacity.missing_data.map((m) => `- ${m}`).join("\n")}` : ""}

\`\`\`json
${JSON.stringify(capacity, null, 2)}
\`\`\`
`;
}

/**
 * 当月の投資可能額を取得する。
 * 取れなければ手入力値、それも無ければ null。
 *
 * persist=true のときだけVaultへ記録する。同じ画面から複数のAPIが
 * 同時に呼ぶため、書き込むのは1経路（capacity API）だけに限定している。
 */
export async function loadCapacity(
  month = currentMonthJst(),
  options: { persist?: boolean } = {}
): Promise<Capacity | null> {
  const fetched = await fetchFromFlowPlus(month);

  if (fetched && options.persist) {
    let sha: string | undefined;
    try {
      sha = (await getVaultFile(CAPACITY_PATH)).sha;
    } catch {
      // 初回作成
    }
    try {
      await saveVaultFile(CAPACITY_PATH, buildMarkdown(fetched), sha);
    } catch (error) {
      console.error("[investing/capacity] Vaultへの保存に失敗:", error);
    }
    return fetched;
  }
  if (fetched) return fetched;

  return loadManual(month);
}
