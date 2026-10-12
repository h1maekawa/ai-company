---
id: valuation-research
name: Valuation Research
department: Company Research
thinkingModelStep: valuation
horizon: ALL
status: planned
---

## Purpose

Compares a candidate's valuation against its evidenced peer set, and says `INSUFFICIENT` rather
than guessing when peer coverage is thin.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `FundamentalSnapshot.per` / `.pbr`, each with
  `freshness`.

## Inputs

- `FundamentalSnapshot[]` for the shortlisted companies from `candidate-company-discovery`.

## Output

A valuation read (e.g. relative to peer median) only when at least 3 peer companies have a fresh
(`freshness` not `stale`/`unknown`) measured `per`/`pbr`. Below that threshold, the output is
`INSUFFICIENT`, with the reason stated, not a single-company valuation presented as a
comparison.

## Evidence rules

- Per `INVESTMENT_THINKING_MODEL.md`: "Valuation is INSUFFICIENT without measured current and
  comparison evidence."

## Human Gate

Feeds the horizon analyses and `opportunity-decision`; does not itself gate a decision.

## Prohibited

No new valuation store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
