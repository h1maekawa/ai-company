---
id: market-hypothesis
name: Market Hypothesis
department: Market & Theme Research
thinkingModelStep: market-hypothesis
horizon: ALL
status: planned
---

## Purpose

States a testable hypothesis about a market or macro change ("world change") that could create
investable demand, before any candidate company is named.

## Reuses

- `app/lib/investing/intelligence/providers/economicNews.ts` (`fetchEconomicNews`) for sourced
  news items.
- `app/lib/investing/intelligence/providers/macro.ts` (`loadMacroSnapshot`) for macro metrics.
- `app/lib/investing/intelligence/engine.ts` (`deriveMarketRegime`) for the current regime.
- `app/lib/investing/intelligence/newsImpact.ts` for classifying a news item's market impact.

No new provider is introduced.

## Inputs

- `EconomicNewsItem[]`, `MacroSnapshot`, `MarketRegimeArtifact`
  (`app/lib/investing/intelligence/types.ts`).

## Output

A `HYPOTHESIS` claim: the hypothesis statement, its confirming evidence IDs, and its stated
invalidating condition. If no news/macro evidence supports a hypothesis, the output is `UNKNOWN`,
not a hypothesis invented from theme familiarity.

## Evidence rules

- A hypothesis without at least one `InvestmentEvidence` ID is not emitted; it stays `UNKNOWN`.
- Macro regime inputs follow existing freshness rules (`IntelligenceFreshness`); stale inputs
  lower confidence, they do not get treated as current.

## Human Gate

Feeds the research artifact a human reviews before any GO/WAIT/PASS decision
(`opportunity-decision` Skill). This Skill never sets a gate or score itself.

## Prohibited

No new provider, no new evidence store, no trade path, no automatic weight change.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
