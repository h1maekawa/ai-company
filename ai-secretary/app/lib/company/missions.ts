/**
 * Mission — Phase 4 §33 / §34
 *
 * 自動生成エンジンは Phase 5。ここでは型と、初期の固定ミッションだけを置く。
 */

import { PERSONAL_COMPANY } from "./personalCompany";

export type MissionCategory = "money" | "asset" | "business" | "automation" | "organization";

/**
 * §52 / §53 の状態遷移。
 * 既存の open / in_progress / done / skipped は互換のため残し、
 * Money Quest 用の PLANNED / ACTIVE / COMPLETED を追加する（Additive）。
 */
export type MissionStatus =
  | "open"
  | "in_progress"
  | "done"
  | "skipped"
  | "PLANNED"
  | "ACTIVE"
  | "COMPLETED";

export type PersonalMission = {
  id: string;
  category: MissionCategory;
  title: string;
  description: string;
  status: MissionStatus;

  expectedRevenueYen?: number;
  expectedSavingsYen?: number;
  expectedTimeSavedMinutes?: number;

  /** どの実行から生まれたミッションか（自動生成時に入る） */
  sourceTraceId?: string;
  /** どの収益機会から生まれたか（Phase 5 §28）。Additive */
  opportunityId?: string;
  /** 今日のMoney Questとしての優先度。大きいほど先に勧める */
  priorityScore?: number;
  /** 最初の1円までの近さ（分）。FIRST_REVENUE_MODE で重視する（§25） */
  estimatedMinutesToRevenue?: number;

  createdAt: string;
};

export const FIRST_MISSION_ID = "mission-001-first-revenue";

/**
 * 初期状態で必ず表示するミッション（§34）。
 *
 * 達成済みなら status を done にして返す。
 * 進捗の表示は呼び出し側が aiGeneratedRevenueYen と対で行う。
 */
export function firstRevenueMission(input: {
  aiGeneratedRevenueYen: number | null;
  now?: Date;
}): PersonalMission {
  const achieved =
    input.aiGeneratedRevenueYen !== null &&
    input.aiGeneratedRevenueYen >= PERSONAL_COMPANY.firstRevenueTargetYen;

  return {
    id: FIRST_MISSION_ID,
    category: "money",
    title: "FIRST REVENUE",
    description: `AI Companyを使って${PERSONAL_COMPANY.firstRevenueTargetYen}円以上の収益を生み出す`,
    status: achieved ? "done" : "open",
    expectedRevenueYen: PERSONAL_COMPANY.firstRevenueTargetYen,
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}
