import { filterHotConfidenceCandidates } from "../research/cluster";
import type { DailyXPlan, TrendCluster } from "../research/types";

export type ThreePostReadiness = {
  slotCount: number;
  eligibleCandidateCount: number;
  scheduledCount: number;
  blockedCount: number;
  skipReasons: string[];
  readyForThree: boolean;
};

export function deriveThreePostReadiness(input: {
  maxXPostsPerDay: number;
  candidates: TrendCluster[];
  plan: DailyXPlan | null;
}): ThreePostReadiness {
  const eligibleCandidateCount = filterHotConfidenceCandidates(
    input.candidates.filter((candidate) => candidate.status === "candidate" && !candidate.blocked)
  ).length;
  const slots = input.plan?.slots ?? [];
  const slotCount = Math.min(3, Math.max(0, Math.floor(input.maxXPostsPerDay)));
  const scheduledCount = slots.filter((slot) => slot.status === "scheduled").length;
  const blockedCount = slots.filter((slot) => ["blocked", "ambiguous", "failed"].includes(slot.status)).length;
  const skipReasons = slots
    .filter((slot) => ["blocked", "ambiguous", "failed", "missed", "skipped"].includes(slot.status))
    .map((slot) => `${slot.id}:${slot.failureKind ?? slot.status}${slot.failureReason ? `:${slot.failureReason}` : ""}`);
  if (input.maxXPostsPerDay !== 3) skipReasons.push("MAX_X_POSTS_PER_DAY_NOT_THREE");
  if (eligibleCandidateCount < 3) skipReasons.push(`ELIGIBLE_CANDIDATES_${eligibleCandidateCount}_OF_3`);
  return { slotCount, eligibleCandidateCount, scheduledCount, blockedCount, skipReasons, readyForThree: slotCount === 3 && eligibleCandidateCount >= 3 && blockedCount === 0 };
}
