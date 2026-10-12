---
id: long-term-analysis
name: Long-Term Analysis
department: Opportunity Intelligence
thinkingModelStep: short-mid-long
horizon: LONG
status: planned
---

## Purpose

Produces the LONG-horizon (6 months – 3+ years) read on a candidate: TAM/future demand,
competitive advantage, FCF/ROIC, margin quality, balance sheet, and structural bottleneck.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `FundamentalSnapshot.fcf` / `.roic` /
  `.operatingMargin`, `ScoreFactor[]` entries (`futureDemand`, `quality`, `valuation`).
- `bottleneck-discovery` Skill output, where available, for the structural-bottleneck factor.

## Inputs

- `InvestmentOpportunity`, `FundamentalSnapshot`.

## Output

A narrative LONG-horizon read using the existing fields above. The typed `longTerm`
`HorizonAssessment` and the weighted factor table in `INVESTMENT_THINKING_MODEL.md` §Long Score
are PR-C deliverables; not implemented here.

## Evidence rules

- Competitive-advantage ("moat") claims require a stated reason and evidence; a company is never
  marked durable solely for being a known brand.

## Human Gate

Feeds `opportunity-decision`'s Triple Gate view (PR-C); does not itself gate a decision.

## Prohibited

No new scoring store, no new provider, no trade path, no silent weight change to the Long Score
table in `INVESTMENT_THINKING_MODEL.md`.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
