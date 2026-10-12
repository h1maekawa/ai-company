---
id: risk-research
name: Risk Research
department: Company Research
thinkingModelStep: risk
horizon: ALL
status: planned
---

## Purpose

Lists the specific risks for a candidate, keeping unknown-probability risks explicitly
`UNKNOWN` instead of forcing a numeric estimate.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `OpportunityRiskFlag` already covers
  `LOW_LIQUIDITY` / `FUNDAMENTAL_STALE` / `SINGLE_SOURCE` / `MACRO_CONFLICT` /
  `NEGATIVE_DEMAND` / `NEGATIVE_CATALYST`, each with `severity` and `detail`.

## Inputs

- `InvestmentOpportunity.riskFlags`.

## Output

A risk list per candidate, grouped by category, each with a probability of `LOW`/`MEDIUM`/
`HIGH`/`UNKNOWN`. Per `INVESTMENT_THINKING_MODEL.md`: "Unknown probability stays UNKNOWN and is
never converted into a numeric estimate."

## Evidence rules

- A risk's probability is only rated when evidence supports a rating; otherwise it stays
  `UNKNOWN`.

## Human Gate

Feeds the horizon analyses and `opportunity-decision`; does not itself gate a decision.

## Prohibited

No new risk store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
