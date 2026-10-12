---
id: picks-and-shovels
name: Picks & Shovels
department: Market & Theme Research
thinkingModelStep: picks-and-shovels
horizon: ALL
status: planned
---

## Purpose

Identifies infrastructure/enabler companies ("picks and shovels") that benefit from a demand
hypothesis without being the end-demand company itself.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `InvestmentThemeGraph` edges of relation
  `upstream`/`downstream`, and `InvestmentCandidate.themeGraphDiscoveries[].hopDistance`
  (0 = direct, 1 = one hop, 2 = two hops) as the existing partial signal for this.

## Inputs

- `InvestmentThemeGraph`, `InvestmentCandidate[]`.

## Output

A list of candidates classified as infrastructure beneficiaries, each with the graph edge(s) and
`evidenceRefs` that justify the classification.

## Evidence rules

- Per `INVESTMENT_THINKING_MODEL.md`: "Infrastructure beneficiaries require an evidenced
  dependency, not thematic similarity alone." A candidate sharing a theme tag with a demand
  hypothesis is insufficient by itself; it must have a graph edge or documented dependency.

## Human Gate

Feeds `causal-distance` and `candidate-company-discovery`; does not itself gate a decision.

## Prohibited

No new graph/theme store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
