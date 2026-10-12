---
id: performance-review
name: Performance Review
department: Decision & Learning
thinkingModelStep: performance
horizon: ALL
status: planned
---

## Purpose

Tracks what happened *after* a decision (GO, WAIT, or PASS), separate from overall portfolio
value history, so GO/WAIT/PASS quality can be measured later without look-ahead bias.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `InvestmentDecisionRecord` as the decision-time
  anchor (price, regime, score, scenario, timestamp).
- `app/lib/investing/history.ts` is explicitly a *different* artifact (portfolio value history)
  and is not reused as a substitute for per-decision performance.

## Gap (honest, not filled in PR-A)

`main` has no typed `DecisionPerformance` (1D/5D/20D/60D/120D/250D return,
`maxDrawdown20d/60d`, `maxGain20d/60d`) yet. That is a PR-E deliverable. This Skill documents the
intent and the look-ahead-bias rule now so PR-E implements it consistently.

## Inputs

- `InvestmentDecisionRecord[]` plus later-dated price data (for performance measurement only).

## Output

(Post-PR-E) a `DecisionPerformance` record per decision. In PR-A, this Skill is a Skeleton only.

## Evidence rules

- Per `INVESTMENT_THINKING_MODEL.md` §Look-ahead bias: later price/news/fundamental data may
  compute performance, but must never be fed back into the original decision's score.
- PASS and WAIT decisions are tracked the same as GO, to measure opportunity cost and WAIT
  correctness — not only winners.

## Human Gate

Purely observational; produces no decision and triggers no trade.

## Prohibited

No new store beyond the PR-E `DecisionPerformance` type when it lands, no trade path, no
automatic re-scoring of past decisions.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
