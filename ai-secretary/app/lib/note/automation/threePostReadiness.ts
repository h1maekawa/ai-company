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
  publishingEnabled?: boolean;
  xAutoPublish?: boolean;
  autopilot?: boolean;
  bufferConfigured?: boolean;
  backpressure?: boolean;
}): ThreePostReadiness {
  const eligibleCandidateCount = filterHotConfidenceCandidates(
    input.candidates.filter((candidate) => candidate.status === "candidate" && !candidate.blocked && ["MEDIUM", "HIGH"].includes(candidate.hotConfidence ?? ""))
  ).length;
  const slots = input.plan?.slots ?? [];
  const slotCount = Math.min(3, Math.max(0, Math.floor(input.maxXPostsPerDay)));
  const scheduledCount = slots.filter((slot) => slot.status === "scheduled").length;
  const blockedCount = slots.filter((slot) => ["blocked", "ambiguous", "failed"].includes(slot.status)).length;
  const skipReasons = slots
    .filter((slot) => ["blocked", "ambiguous", "failed", "missed", "skipped"].includes(slot.status))
    .map((slot) => `${slot.id}:${slot.failureKind ?? slot.status}`);
  if (!input.publishingEnabled) skipReasons.push("PUBLISHING_DISABLED_OR_UNKNOWN");
  if (!input.xAutoPublish) skipReasons.push("X_AUTO_PUBLISH_DISABLED_OR_UNKNOWN");
  if (!input.autopilot) skipReasons.push("AUTOPILOT_DISABLED_OR_UNKNOWN");
  if (!input.bufferConfigured) skipReasons.push("BUFFER_NOT_CONFIGURED_OR_UNKNOWN");
  if (input.backpressure !== false) skipReasons.push("BACKPRESSURE_OR_UNKNOWN");
  if (!input.plan) skipReasons.push("CURRENT_PLAN_MISSING");
  if (scheduledCount < 3) skipReasons.push("THREE_SCHEDULED_SLOTS_NOT_CONFIRMED");
  if (input.maxXPostsPerDay !== 3) skipReasons.push("MAX_X_POSTS_PER_DAY_NOT_THREE");
  if (eligibleCandidateCount < 3) skipReasons.push(`ELIGIBLE_CANDIDATES_${eligibleCandidateCount}_OF_3`);
  return { slotCount, eligibleCandidateCount, scheduledCount, blockedCount, skipReasons, readyForThree: skipReasons.length === 0 };
}
