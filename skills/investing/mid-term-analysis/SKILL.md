---
id: mid-term-analysis
name: Mid-Term Analysis
department: Opportunity Intelligence
thinkingModelStep: short-mid-long
horizon: MID
status: planned
---

## Purpose

Produces the MID-horizon (1–6 months) read on a candidate: future demand, earnings growth,
guidance, sector strength, and catalyst.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `ScoreFactor[]` entries (`futureDemand`,
  `earningsGrowth`, `sectorStrength`, `catalyst`, `valuation`) and
  `FundamentalSnapshot.revenueGrowth` / `.epsGrowth`.

## Inputs

- `InvestmentOpportunity`, `FundamentalSnapshot`.

## Output

A narrative MID-horizon read using the existing fields above. The typed `midTerm`
`HorizonAssessment` and the weighted factor table in `INVESTMENT_THINKING_MODEL.md` §Mid Score
are PR-C deliverables; not implemented here.

## Evidence rules

- Guidance/revision claims require sourced evidence; absent that, the factor is reported
  `UNKNOWN`, not assumed neutral.

## Human Gate

Feeds `opportunity-decision`'s Triple Gate view (PR-C); does not itself gate a decision.

## Prohibited

No new scoring store, no new provider, no trade path, no silent weight change to the Mid Score
table in `INVESTMENT_THINKING_MODEL.md`.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
