/**
 * 収益の帰属 — Phase 4 §13 / §14 / §15
 *
 * 最重要指標は aiGeneratedRevenueYen（AI Companyが直接関与した収益）。
 *
 * 守ること:
 *   - 「AIを使ったから全部AI収益」にしない（§13）
 *   - 投資損益をAIが稼いだ売上に含めない（§15）
 *   - AIが勝手に「収益が出た」と判断しない。人の確認を必須にする（§14）
 */

export type RevenueSourceType =
  | "note"
  | "affiliate"
  | "web"
  | "ai_service"
  | "saas"
  | "investment"
  | "other";

export const REVENUE_SOURCE_LABELS: Record<RevenueSourceType, string> = {
  note: "note",
  affiliate: "アフィリエイト",
  web: "Web制作",
  ai_service: "AIサービス",
  saas: "SaaS",
  investment: "投資",
  other: "その他",
};

export type RevenueAttribution = {
  id: string;
  amountYen: number;
  sourceType: RevenueSourceType;

  /** どの実行から生まれたか。追跡できない収益もあるため optional */
  originTraceId?: string;
  originAgentId?: string;
  originSkillId?: string;
  originWorkflowId?: string;

  occurredAt: string;

  /**
   * 人が確認したか。
   * false のものは集計に含めない。AIの自己申告で収益を立てないため。
   */
  confirmedByHuman: boolean;
};

/**
 * 投資による収益。
 * AI Generated Revenue とは別枠で集計する（§15）。
 * 株価が上がったことを「AIが稼いだ」に混ぜると、
 * First Revenue の達成判定が意味を失う。
 */
export const INVESTMENT_SOURCES: RevenueSourceType[] = ["investment"];

export function isInvestmentRevenue(entry: RevenueAttribution): boolean {
  return INVESTMENT_SOURCES.includes(entry.sourceType);
}

/**
 * AI Companyが生んだ収益か。
 *
 * 条件は3つすべて:
 *   1. 人が確認済み
 *   2. 投資由来ではない
 *   3. AI Companyの実行に紐づいている（trace / agent / skill / workflow のいずれか）
 *
 * 3を外すと、手作業で得た収益までAI収益に入ってしまう。
 */
export function isAiGeneratedRevenue(entry: RevenueAttribution): boolean {
  if (!entry.confirmedByHuman) return false;
  if (isInvestmentRevenue(entry)) return false;
  return Boolean(
    entry.originTraceId || entry.originAgentId || entry.originSkillId || entry.originWorkflowId
  );
}

export type RevenueBreakdown = {
  /** AI Companyが生んだ収益（円） */
  aiGeneratedYen: number;
  /** 事業・副業の収益のうち、AI由来と特定できなかったもの */
  otherBusinessYen: number;
  /** 投資による損益 */
  investmentYen: number;
  /** 人の確認待ちで集計に入れなかったもの */
  unconfirmedYen: number;
  /** 集計に使った件数 */
  confirmedEntries: number;
};

/** 期間で絞って集計する。窓を指定しなければ全件 */
export function summarizeRevenue(
  entries: RevenueAttribution[],
  options: { since?: string; until?: string } = {}
): RevenueBreakdown {
  const scoped = entries.filter((entry) => {
    if (options.since && entry.occurredAt < options.since) return false;
    if (options.until && entry.occurredAt > options.until) return false;
    return true;
  });

  const confirmed = scoped.filter((e) => e.confirmedByHuman);

  return {
    aiGeneratedYen: confirmed
      .filter(isAiGeneratedRevenue)
      .reduce((sum, e) => sum + e.amountYen, 0),
    otherBusinessYen: confirmed
      .filter((e) => !isInvestmentRevenue(e) && !isAiGeneratedRevenue(e))
      .reduce((sum, e) => sum + e.amountYen, 0),
    investmentYen: confirmed
      .filter(isInvestmentRevenue)
      .reduce((sum, e) => sum + e.amountYen, 0),
    unconfirmedYen: scoped
      .filter((e) => !e.confirmedByHuman)
      .reduce((sum, e) => sum + e.amountYen, 0),
    confirmedEntries: confirmed.length,
  };
}
