/**
 * Achievement — Phase 4 §28 / §29
 *
 * §28 の要点: 一度解除したAchievementは重複解除しない。
 * 解除済みの状態を渡せば、条件が一時的に満たされなくなっても解除は維持される。
 * （月次収益が翌月0円に戻っても「初めて稼いだ」事実は消えない）
 */

import { PERSONAL_COMPANY } from "./personalCompany";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  /** 進捗。数値で表せるものだけ */
  progress?: number;
  target?: number;
};

export type AchievementInput = {
  /** AI Companyが生んだ累計収益（円）。未測定は null */
  aiGeneratedRevenueYen: number | null;
  /** 既に解除済みのもの */
  unlocked?: Achievement[];
  now?: Date;
};

export const FIRST_REVENUE_ID = "first-revenue";

/**
 * Achievementを評価する。
 *
 * 未測定（null）は0として扱わない。
 * 「まだ測っていない」を「0円だった」と記録すると、進捗表示が嘘になる。
 */
export function evaluateAchievements(input: AchievementInput): Achievement[] {
  const now = (input.now ?? new Date()).toISOString();
  const already = new Map((input.unlocked ?? []).map((a) => [a.id, a]));

  const revenue = input.aiGeneratedRevenueYen;
  const target = PERSONAL_COMPANY.firstRevenueTargetYen;

  const previous = already.get(FIRST_REVENUE_ID);
  const meetsCondition = revenue !== null && revenue >= target;

  const firstRevenue: Achievement = {
    id: FIRST_REVENUE_ID,
    title: "FIRST REVENUE",
    description: `AI Companyを使って${target}円以上の収益を生み出す`,
    // 一度解除したら維持する（§28）
    unlocked: previous?.unlocked === true || meetsCondition,
    unlockedAt:
      previous?.unlockedAt ?? (meetsCondition && !previous?.unlocked ? now : undefined),
    progress: revenue ?? undefined,
    target,
  };

  return [firstRevenue];
}
