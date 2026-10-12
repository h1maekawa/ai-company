---
id: investment-learning
name: Investment Learning
department: Decision & Learning
thinkingModelStep: learning
horizon: ALL
status: planned
---

## Purpose

Aggregates decision performance into Win Rate, Average/Median Return, Expected Value, Max
Drawdown/Gain, Risk/Reward, and factor-level attribution (Future Demand, RVOL, Earnings,
Catalyst, Sector Strength, Valuation, Macro) — and only ever *proposes* a weight change for a
human to apply.

## Reuses

- `app/api/investing/learning/route.ts` — **already exists**, but currently serves the daily
  Investment Learning Brief via `app/lib/note/investing/learningBrief.ts`
  (`getOrCreateTodayLearningBrief`, `loadRecentLearningBriefs`). That file is shared with the
  note/X draft bridge (`app/lib/note/investing/xBridge.ts` reads the same brief). Per this
  session's constraint, this Skill does not modify `learningBrief.ts` or the `/api/investing/learning`
  route; any PR-F extension must add a separate, investing-only aggregation rather than changing
  this shared file's behavior.
- `app/lib/investing/intelligence/types.ts`: `InvestmentDecisionRecord` as the input once
  `performance-review` (PR-E) exists.

## Gap (honest, not filled in PR-A)

No `WeightRecommendation` type or minimum-sample gate exists in `main` yet. PR-F adds:
`WeightRecommendation { factor, currentWeight, suggestedWeight, sampleSize, confidence,
evidence, expectedImprovement }`, with `INSUFFICIENT_SAMPLE` below 30 decisions and 100+
recommended for confidence.

## Inputs

- (Post-PR-E) `DecisionPerformance[]`.

## Output

(Post-PR-F) Win Rate / EV / drawdown / factor-attribution summaries and, where sample size
allows, `WeightRecommendation` entries. No weight in `INVESTMENT_THINKING_MODEL.md`'s Short/Mid/
Long Score tables is changed automatically; a recommendation is surfaced for human review only.

## Evidence rules

- Below the minimum sample size, the output is `INSUFFICIENT_SAMPLE`, not a low-confidence
  number presented as actionable.

## Human Gate

Every weight change requires explicit human application outside this Skill's output path.

## Prohibited

No automatic weight mutation, no new decision store, no trade path, no change to
`learningBrief.ts` / the note-X bridge.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
