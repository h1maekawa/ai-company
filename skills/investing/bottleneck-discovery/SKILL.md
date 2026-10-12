---
id: bottleneck-discovery
name: Bottleneck Discovery
department: Market & Theme Research
thinkingModelStep: bottleneck
horizon: ALL
status: planned
---

## Purpose

Finds explicitly evidenced supply/capacity constraints ("bottlenecks") in a value chain, as
distinct from a company simply operating in a hot theme.

## Reuses

- `app/lib/investing/intelligence/providers/economicNews.ts` / `newsImpact.ts`: the existing
  `EconomicNewsItem.factSummary` and `impacts[].rationale` text is the only current source of
  constraint language in `main`.

## Gap (honest, not filled in PR-A)

`main` has no typed bottleneck extraction yet. `origin/feat/investment-thinking-model` (unmerged,
not pulled into this PR because it also edits the note/X bridge) prototypes a regex-based
constraint detector over `factSummary`/`rationale` text. PR-B should re-derive a typed bottleneck
extractor from that prior art without carrying over its X-coupled files.

## Inputs

- `EconomicNewsItem[]`.

## Output

A bottleneck claim only when explicit constraint evidence exists (`EVIDENCED` status). Absence
of supply data is reported as "no evidenced bottleneck found," never silently treated as "no
bottleneck exists."

## Evidence rules

- A bottleneck requires explicit constraint evidence with `evidenceIds`. It is never created from
  theme similarity alone.

## Human Gate

Feeds `causal-distance` and company risk research; does not itself gate a decision.

## Prohibited

No new evidence store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
