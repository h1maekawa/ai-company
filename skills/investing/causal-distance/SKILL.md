---
id: causal-distance
name: Causal Distance
department: Market & Theme Research
thinkingModelStep: causal-distance
horizon: ALL
status: planned
---

## Purpose

Records how far a candidate company sits, causally, from the original demand hypothesis, so
confidence can be discounted with distance instead of assumed uniform for every theme member.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `ThemeGraphDiscovery.hopDistance` (0/1/2) is the
  existing partial signal.

## Scale (policy, from `INVESTMENT_THINKING_MODEL.md`)

| Distance | Meaning |
|---|---|
| 1 | Direct |
| 2 | Strong |
| 3 | Moderate |
| 4 | Weak |
| 5 | Indirect |

PR-B maps the existing 0/1/2 `hopDistance` onto this 1–5 scale and extends it to candidates that
did not arrive via the theme graph (e.g. `candidateSources: ["research"]`). Not implemented in
PR-A.

## Inputs

- `InvestmentCandidate.themeGraphDiscoveries`, `InvestmentThemeGraph`.

## Output

A per-candidate causal-distance value with the graph path/evidence that produced it. `UNKNOWN`
when no graph or researched path exists — never defaulted to "Direct."

## Evidence rules

- Distance is never assumed "1" because a candidate carries a matching theme tag; it must trace
  an evidenced edge or documented path.

## Human Gate

Feeds confidence weighting in `fundamental-research`, `valuation-research`, and the horizon
analyses; does not itself gate a decision.

## Prohibited

No new graph store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
