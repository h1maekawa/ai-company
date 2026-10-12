---
id: market-structure
name: Market Structure
department: Market & Theme Research
thinkingModelStep: market-structure
horizon: ALL
status: planned
---

## Purpose

Reads the existing theme/sector/ticker graph to describe how a market is structured — who
supplies whom, who belongs to which theme — before claiming a causal path to any ticker.

## Reuses

- `app/lib/investing/intelligence/themeIntelligence.ts`, `themes.ts`: builds/holds
  `InvestmentThemeGraph` (nodes: theme/sector/ticker; edges: upstream/downstream/belongs-to/
  represented-by, each with `evidenceRefs`).
- `app/lib/investing/intelligence/providers/sector.ts` for sector-level snapshots.

No second graph or theme store is introduced; this Skill only reads and narrates the existing
`InvestmentThemeGraph`.

## Inputs

- `InvestmentThemeGraph`, `SectorSnapshot[]` (`app/lib/investing/intelligence/types.ts`).

## Output

A structural narrative: which nodes/edges the candidate sits on, with each edge's
`evidenceRefs`. Edges without evidence are reported as absent, not inferred from naming
similarity.

## Evidence rules

- An edge is only asserted if the existing graph carries it with `evidenceRefs`. No edge is
  added from ticker-name or theme-name string matching alone.

## Human Gate

Feeds `picks-and-shovels`, `bottleneck-discovery`, and `causal-distance`; does not itself gate a
decision.

## Prohibited

No new graph/theme store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
