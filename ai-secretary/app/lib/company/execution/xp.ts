/**
 * Company XP / Agent XP — Phase 6 §65 〜 §67
 *
 * §66 の要点: XP は Game Layer であって経営KPIではない。
 * Company Health へは入れない。
 * ゲームの数字を健全性の指標に混ぜると、XPを稼ぐ行動が
 * 「経営が良くなっている」ように見えてしまう。
 */

export type XpEventType =
  | "MISSION_COMPLETE"
  | "FIRST_REVENUE"
  | "REVENUE_EARNED"
  | "ACHIEVEMENT"
  | "REVIEW_PASS";

export const COMPANY_XP: Record<XpEventType, number> = {
  MISSION_COMPLETE: 50,
  FIRST_REVENUE: 1000,
  // 収益1,000円ごとに100XP（下の計算で使う）
  REVENUE_EARNED: 100,
  ACHIEVEMENT: 200,
  REVIEW_PASS: 0,
};

export const AGENT_XP: Record<XpEventType, number> = {
  MISSION_COMPLETE: 10,
  REVIEW_PASS: 5,
  REVENUE_EARNED: 1,
  FIRST_REVENUE: 0,
  ACHIEVEMENT: 0,
};

export type XpEvent = {
  type: XpEventType;
  at: string;
  agentId?: string;
  /** REVENUE_EARNED のときの金額 */
  amountYen?: number;
};

/** 収益XPは1,000円ごと。端数では入らない */
function revenueXp(amountYen: number, perUnit: number): number {
  return Math.floor(amountYen / 1000) * perUnit;
}

export function computeCompanyXp(events: XpEvent[]): number {
  return events.reduce((total, event) => {
    if (event.type === "REVENUE_EARNED") {
      return total + revenueXp(event.amountYen ?? 0, COMPANY_XP.REVENUE_EARNED);
    }
    return total + COMPANY_XP[event.type];
  }, 0);
}

export function computeAgentXp(events: XpEvent[], agentId: string): number {
  return events
    .filter((event) => event.agentId === agentId)
    .reduce((total, event) => {
      if (event.type === "REVENUE_EARNED") {
        return total + revenueXp(event.amountYen ?? 0, AGENT_XP.REVENUE_EARNED);
      }
      return total + AGENT_XP[event.type];
    }, 0);
}

/** XP → レベル。100XPごとに1レベル */
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

/**
 * §45 AI社員のレベル。
 * 収益を直接入れすぎない。完了数・成功率・レビュー結果を主にする。
 * 収益は別途 Revenue Contribution として表示する。
 */
export function computeAgentLevel(input: {
  completedMissions: number;
  successRate: number;
  reviewPassRate: number;
  ceoRejectionRate: number;
}): number {
  const base = input.completedMissions * 10;
  const quality =
    input.successRate * 50 + input.reviewPassRate * 30 - input.ceoRejectionRate * 30;
  return levelFromXp(Math.max(0, base + quality));
}
