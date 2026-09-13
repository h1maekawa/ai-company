/**
 * 財務設定と接続境界 — Phase 5 §36 〜 §42
 *
 * §38 の要点: 目標資産額が未設定なら、自動で固定倍率を決めない。
 * NOT_CONFIGURED のまま維持する。勝手に「生活費の25倍」と決めて
 * 進捗を出すと、本人が置いていない目標に対する進捗が表示される。
 *
 * §40 / §41 の要点: 家計簿との接続は境界だけ定義し、
 * 今は手動入力のProviderだけを持つ。将来差し替えられる形にしておく。
 */

import { getVaultFile, saveVaultFile } from "../vault";

const SETTINGS_PATH = "memory/personal/company/financial-settings.md";

export type FinancialSettings = {
  /** 年間生活費（円）。未設定は null */
  annualLivingCostYen: number | null;
  /** 目標資産額（円）。未設定は null。自動算出しない（§38） */
  targetAssetAmountYen: number | null;
  /** 手動入力の月次値。家計簿が繋がるまでの経路（§42） */
  monthlyIncomeYen: number | null;
  monthlyExpenseYen: number | null;
  cashBalanceYen: number | null;
  updatedAt: string | null;
};

export function emptyFinancialSettings(): FinancialSettings {
  return {
    annualLivingCostYen: null,
    targetAssetAmountYen: null,
    monthlyIncomeYen: null,
    monthlyExpenseYen: null,
    cashBalanceYen: null,
    updatedAt: null,
  };
}

/** 数値として妥当なものだけ受け取る。0は有効な値として扱う */
function sanitize(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeFinancialSettings(input: unknown): FinancialSettings {
  const source = (input ?? {}) as Record<string, unknown>;
  return {
    annualLivingCostYen: sanitize(source.annualLivingCostYen),
    targetAssetAmountYen: sanitize(source.targetAssetAmountYen),
    monthlyIncomeYen: sanitize(source.monthlyIncomeYen),
    monthlyExpenseYen: sanitize(source.monthlyExpenseYen),
    cashBalanceYen: sanitize(source.cashBalanceYen),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

export async function loadFinancialSettings(): Promise<FinancialSettings> {
  try {
    const file = await getVaultFile(SETTINGS_PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    return match ? normalizeFinancialSettings(JSON.parse(match[1])) : emptyFinancialSettings();
  } catch {
    return emptyFinancialSettings();
  }
}

export async function saveFinancialSettings(
  settings: FinancialSettings
): Promise<FinancialSettings> {
  const next = { ...normalizeFinancialSettings(settings), updatedAt: new Date().toISOString() };
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(SETTINGS_PATH)).sha;
  } catch {
    // 初回作成
  }

  const yen = (value: number | null) =>
    value === null ? "未設定" : `¥${value.toLocaleString("ja-JP")}`;

  const markdown = `---
type: personal_financial_settings
updated: ${next.updatedAt}
---

# 財務設定

FIRE計算とKPIに使う設定です。銀行口座番号などは保存しません。
未設定の項目は0ではなく「未設定」として扱われます。

- 年間生活費: ${yen(next.annualLivingCostYen)}
- 目標資産額: ${yen(next.targetAssetAmountYen)}
- 月間収入: ${yen(next.monthlyIncomeYen)}
- 月間支出: ${yen(next.monthlyExpenseYen)}
- 現金残高: ${yen(next.cashBalanceYen)}

\`\`\`json
${JSON.stringify(next, null, 2)}
\`\`\`
`;

  await saveVaultFile(SETTINGS_PATH, markdown, sha);
  return next;
}

/* ─── 接続境界（§40 / §41） ────────────────────── */

/**
 * 財務指標の供給元。
 * いまは手動入力だけ。家計簿アプリが繋がったら
 * 同じインターフェースの別実装へ差し替える。
 */
export interface FinancialMetricsProvider {
  readonly name: string;
  getMonthlyIncome(): Promise<number | null>;
  getMonthlyExpense(): Promise<number | null>;
  getCashBalance(): Promise<number | null>;
  getNetWorth(): Promise<number | null>;
  getSavingsRate(): Promise<number | null>;
}

/** 手動入力のProvider。値が無ければ null を返す（0で埋めない） */
export function manualProvider(settings: FinancialSettings): FinancialMetricsProvider {
  return {
    name: "manual",
    async getMonthlyIncome() {
      return settings.monthlyIncomeYen;
    },
    async getMonthlyExpense() {
      return settings.monthlyExpenseYen;
    },
    async getCashBalance() {
      return settings.cashBalanceYen;
    },
    async getNetWorth() {
      // 負債が分からないため、手動入力からは純資産を出さない
      return null;
    },
    async getSavingsRate() {
      const { monthlyIncomeYen: income, monthlyExpenseYen: expense } = settings;
      if (income === null || expense === null || income <= 0) return null;
      return Math.round(((income - expense) / income) * 1000) / 1000;
    },
  };
}
