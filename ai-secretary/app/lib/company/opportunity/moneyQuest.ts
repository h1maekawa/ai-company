/**
 * Money Quest Engine — Phase 5 §21 〜 §25 / §51 〜 §54
 *
 * Opportunity（機会）を「今日できるサイズ」のMissionへ落とす。
 *
 * §23 の要点: 巨大な事業計画にしない。
 *   悪い例「SaaSを作って月100万円稼ぐ」
 *   良い例「SaaSのLPコピーを完成させる」
 *   大きすぎる目標は着手されず、いつまでも1円に届かない。
 *
 * Mission の型は Phase 4 のものを使う（複製しない・§21）。
 */

import { type PersonalMission } from "../missions";
import { resolveRevenueMode, type RevenueMode } from "../revenueMode";
import type { RevenueOpportunity } from "./types";

/** 1日に出すMoney Questの上限（§24） */
export const MAX_DAILY_QUESTS = 3;

/**
 * 機会 → 最初の一歩。
 *
 * ここで「完成させる」ではなく「初稿を作る」「候補を出す」に落とすのが肝。
 * 1回のQuestで終わる大きさにしないと、着手されずに積み上がる。
 */
const FIRST_STEP: Record<string, { title: string; minutes: number }> = {
  content: { title: "有料記事の初稿を書き上げる", minutes: 45 },
  affiliate: { title: "既存記事1本に紹介導線を追加する", minutes: 30 },
  automation: { title: "テンプレートとして配る形の目次を作る", minutes: 40 },
  consulting: { title: "相談メニューと価格の案を1枚にまとめる", minutes: 30 },
  service: { title: "提供できることを1枚にまとめる", minutes: 30 },
  product: { title: "最小の商品構成を決める", minutes: 45 },
  saas: { title: "LPの見出しと説明文を書く", minutes: 45 },
  other: { title: "最初の一歩を決める", minutes: 30 },
};

export type QuestGenerationResult = {
  quests: PersonalMission[];
  mode: RevenueMode;
  /** 上限で切り落とした件数 */
  deferred: number;
};

/**
 * §24 優先度。
 *
 * FIRST_REVENUE_MODE では「収益額」ではなく
 * 「短時間で最初の1円に届きそうか」を重く見る（§25 Time to First Revenue）。
 */
export function questPriority(
  opportunity: RevenueOpportunity,
  mode: RevenueMode
): number {
  const effort = opportunity.estimatedEffortMinutes ?? 120;
  const quickness = Math.max(0, 1 - effort / 480);

  if (mode === "FIRST_REVENUE_MODE") {
    // 速さと既存資産の活用度を重視。金額見込みは参考程度
    return Math.round(
      (quickness * 0.5 + opportunity.existingAssetMatch * 0.4 + (opportunity.score / 100) * 0.1) *
        100
    );
  }

  // GROWTH_MODE では金額・拡張性側を重く見る
  const revenue = opportunity.expectedRevenue.known
    ? Math.min(1, (opportunity.expectedRevenue.minYen + opportunity.expectedRevenue.maxYen) / 2 / 100_000)
    : 0;
  return Math.round(
    (revenue * 0.4 + (opportunity.score / 100) * 0.3 + opportunity.automationPotential * 0.3) * 100
  );
}

export function generateMoneyQuests(input: {
  opportunities: RevenueOpportunity[];
  aiGeneratedRevenueYen: number | null;
  now?: Date;
}): QuestGenerationResult {
  const now = input.now ?? new Date();
  const mode = resolveRevenueMode(input.aiGeneratedRevenueYen);

  const eligible = input.opportunities.filter(
    (o) => o.status !== "DISMISSED" && o.status !== "FAILED"
  );

  const ranked = eligible
    .map((opportunity) => ({ opportunity, priority: questPriority(opportunity, mode) }))
    .sort((a, b) => b.priority - a.priority);

  const quests = ranked.slice(0, MAX_DAILY_QUESTS).map(({ opportunity, priority }) => {
    const step = FIRST_STEP[opportunity.category] ?? FIRST_STEP.other;

    return {
      id: `quest_${opportunity.id}_${now.toISOString().slice(0, 10)}`,
      category: "money" as const,
      title: step.title,
      description: `${opportunity.title} の最初の一歩。${opportunity.summary}`,
      status: "PLANNED" as const,
      expectedRevenueYen: opportunity.expectedRevenue.known
        ? opportunity.expectedRevenue.minYen
        : undefined,
      expectedTimeSavedMinutes: undefined,
      opportunityId: opportunity.id,
      priorityScore: priority,
      estimatedMinutesToRevenue: step.minutes,
      createdAt: now.toISOString(),
    } satisfies PersonalMission;
  });

  return { quests, mode, deferred: Math.max(0, ranked.length - quests.length) };
}

/**
 * §52 開始 / §53 完了。
 *
 * 完了しても収益が出るとは限らない。Revenue 0 の完了も正常な結果であり、
 * それ自体が「このやり方では稼げなかった」という学習データになる（§54）。
 */
export function startQuest(mission: PersonalMission): PersonalMission {
  return { ...mission, status: "ACTIVE" };
}

export function completeQuest(mission: PersonalMission): PersonalMission {
  return { ...mission, status: "COMPLETED" };
}
