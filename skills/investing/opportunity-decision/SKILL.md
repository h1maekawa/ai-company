---
id: opportunity-decision
name: Opportunity Decision
department: Decision & Learning
thinkingModelStep: human-decision
horizon: ALL
status: planned
---

## Purpose

Assembles the research summary (hypothesis, structure, bottleneck, company comparison,
fundamentals, valuation, risk, short/mid/long read) a human reviews when recording a GO/WAIT/PASS
decision. It never records the decision itself in place of the human.

## Reuses

- `app/api/investing/opportunities/[id]/decision/route.ts`, `app/api/investing/decisions/route.ts`
  — the existing, already-human-facing decision endpoints.
- `app/lib/investing/intelligence/types.ts`: `InvestmentDecisionRecord`
  (`decision: GO|WAIT|PASS`, `reason`, `priceAtDecision`, `marketRegime`, `opportunityScore`,
  `scenario`, `timestamp`).

## Inputs

- The outputs of `market-hypothesis`, `market-structure`, `candidate-company-discovery`,
  `fundamental-research`, `valuation-research`, `risk-research`, and the three horizon-analysis
  Skills.

## Output

A compiled research summary for display alongside the existing decision form. The decision value
itself (`GO`/`WAIT`/`PASS`) is entered by a human through the existing API, matching
`app/lib/fund/engine.ts`'s `executionAuthority: "HUMAN_ONLY"` contract.

## Evidence rules

- The summary must carry forward every `UNKNOWN` from its inputs; it may not resolve an unknown
  into a confident statement just because a decision is pending.

## Human Gate

This Skill's entire output feeds one human decision. It has no path to write
`InvestmentDecisionRecord` itself and no path to a broker.

## Prohibited

No new decision store, no automatic GO/WAIT/PASS, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
