---
id: short-term-analysis
name: Short-Term Analysis
department: Opportunity Intelligence
thinkingModelStep: short-mid-long
horizon: SHORT
status: planned
---

## Purpose

Produces the SHORT-horizon (1 trading day – 4 weeks) read on a candidate: relative volume, price
momentum, catalyst, and liquidity.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `InvestmentOpportunity.relativeVolume`,
  `.priceChangePct`, `.catalyst`, and the relevant entries of `ScoreFactor[]` (`volume`,
  `catalyst`) already computed by `app/lib/investing/intelligence/engine.ts`.

## Inputs

- `InvestmentOpportunity` (existing single `score`/`gate`/`breakdown`).

## Output

A narrative SHORT-horizon read using the existing fields above. The typed `HorizonAssessment`
(`score`, `coverage`, `gate: GO_CANDIDATE|WAIT|PASS|DATA_INCOMPLETE`, `confidence`, `factors`,
bull/base/bear case, `invalidationConditions`) and the weighted factor table in
`INVESTMENT_THINKING_MODEL.md` §Short Score are PR-C deliverables; this Skill does not compute a
new `shortTerm` field on `InvestmentOpportunity` in PR-A.

## Evidence rules

- Coverage below what the existing `scoreCoverage`/`coverage` fields already represent must be
  reported, not hidden behind a confident-looking score.

## Human Gate

Feeds `opportunity-decision`'s Triple Gate view (PR-C); does not itself gate a decision.

## Prohibited

No new scoring store, no new provider, no trade path, no silent weight change to the Short Score
table in `INVESTMENT_THINKING_MODEL.md`.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
