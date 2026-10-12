/**
 * Opportunity Pipeline (PR-D).
 *
 * An additive, read-only projection over the existing `watchlist.md` (app/lib/investing/
 * watchlist.ts), today's `InvestmentOpportunity[]` (app/lib/investing/intelligence/types.ts),
 * and the existing `Portfolio` (app/lib/investing/types.ts). It introduces no second scoring
 * logic and no new persisted store: `shortGate`/`midGate`/`longGate`/`tripleGate` are read
 * directly from the existing Horizon Intelligence (PR-C); nothing here recomputes a score.
 *
 * Because nothing is persisted by this PR, `status` is derived fresh on every call from
 * {held, tripleGate} with no memory of a prior day's status. The monotonic "safe progression"
 * guard in `deriveStatus.ts` only has an effect when a caller supplies `previousStatus` from its
 * own cache; by default each call starts from the gates alone. See deriveStatus.ts for the
 * documented gap and what a future PR would need to add persistence.
 */

import type { HorizonGate, TripleGate } from "../intelligence/horizon/types";

export type OpportunityPipelineStatus =
  | "DISCOVERED"
  | "RESEARCHING"
  | "WATCH"
  | "WAIT_ENTRY"
  | "GO_CANDIDATE"
  | "HOLDING"
  | "INVALIDATED"
  | "ARCHIVED";

export type OpportunityPipelineItem = {
  ticker: string;
  theme: string | null;
  subTheme: string | null;

  shortGate: HorizonGate | null;
  midGate: HorizonGate | null;
  longGate: HorizonGate | null;
  tripleGate: TripleGate | null;

  whyWatching: string | null;
  targetCatalyst: string | null;
  nextEarnings: string | null;
  invalidation: string[];

  status: OpportunityPipelineStatus;
  held: boolean;

  createdAt: string;
  updatedAt: string;
};
