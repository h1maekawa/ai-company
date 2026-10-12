import type { TripleGate } from "../intelligence/horizon/types";
import type { OpportunityPipelineStatus } from "./types";

/** Linear, auto-progressable chain. HOLDING/INVALIDATED/ARCHIVED are side-states, not on this chain. */
const PROGRESSION: OpportunityPipelineStatus[] = ["DISCOVERED", "RESEARCHING", "WATCH", "WAIT_ENTRY", "GO_CANDIDATE"];
const rankOf = (status: OpportunityPipelineStatus) => PROGRESSION.indexOf(status);

/**
 * Triple Gate -> target pipeline status, per INVESTMENT_THINKING_MODEL.md §Triple Gate:
 * - TRIPLE_GO ("最優先候補")      -> GO_CANDIDATE
 * - MID_LONG_GO ("Entry Timing待ち") -> WATCH
 * - SHORT_ONLY ("Momentum/Event向け") -> WAIT_ENTRY
 * - LONG_ONLY ("長期Watch")        -> WATCH
 * - NO_GO (no gate is GO)         -> WATCH (still a known, monitored candidate)
 * - MIXED (inconclusive combination) -> RESEARCHING
 * - DATA_INCOMPLETE               -> RESEARCHING (attempted, insufficient evidence)
 * `GO_CANDIDATE` means "present this to the human for a decision," never "buy" — the final
 * GO/WAIT/PASS and any order remain HUMAN_ONLY (see opportunity-decision Skill, PR-A).
 */
function targetFromTripleGate(tripleGate: TripleGate | null): OpportunityPipelineStatus {
  switch (tripleGate) {
    case "TRIPLE_GO": return "GO_CANDIDATE";
    case "MID_LONG_GO": return "WATCH";
    case "SHORT_ONLY": return "WAIT_ENTRY";
    case "LONG_ONLY": return "WATCH";
    case "NO_GO": return "WATCH";
    case "MIXED": return "RESEARCHING";
    case "DATA_INCOMPLETE": return "RESEARCHING";
    case null: return "DISCOVERED";
  }
}

/**
 * Derives the safe next status. Rules, in order:
 * 1. A held position is always HOLDING — regardless of gates. Reused, read-only: `held` comes
 *    from the existing Portfolio, never mutated here.
 * 2. An ARCHIVED item stays ARCHIVED — only a human (or an explicit future policy) un-archives.
 * 3. An invalidated thesis moves to INVALIDATED — this is not a sell signal, it's a status label.
 * 4. Otherwise, the Triple-Gate-derived target is merged with any prior status so the status
 *    only ever moves FORWARD along the DISCOVERED -> ... -> GO_CANDIDATE chain automatically.
 *    Nothing here ever auto-downgrades a further-along status back down; that is a human/
 *    ARCHIVED decision, not an automatic one.
 */
export function deriveOpportunityPipelineStatus(input: {
  held: boolean;
  invalidated: boolean;
  tripleGate: TripleGate | null;
  previousStatus?: OpportunityPipelineStatus;
}): OpportunityPipelineStatus {
  if (input.held) return "HOLDING";
  if (input.previousStatus === "ARCHIVED") return "ARCHIVED";
  if (input.invalidated) return "INVALIDATED";

  const target = targetFromTripleGate(input.tripleGate);
  const previous = input.previousStatus;
  if (previous === undefined || rankOf(previous) < 0) return target;
  const targetRank = rankOf(target);
  if (targetRank < 0) return target;
  return PROGRESSION[Math.max(rankOf(previous), targetRank)];
}
