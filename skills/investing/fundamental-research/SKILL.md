---
id: fundamental-research
name: Fundamental Research
department: Company Research
thinkingModelStep: fundamental
horizon: ALL
status: planned
---

## Purpose

Collects sourced, dated fundamental metrics for each shortlisted company, with missing fields
left missing.

## Reuses

- `app/lib/investing/intelligence/providers/sec.ts` for filing-sourced fundamentals.
- `app/lib/investing/intelligence/types.ts`: `FundamentalSnapshot` already carries
  `revenue`/`revenueGrowth`/`eps`/`epsGrowth`/`operatingMargin`/`fcf`/`roic`/`per`/`pbr` plus
  `sourceUrl`, `observedAt`, `filedAt`, `freshness`.

## Inputs

- `FundamentalSnapshot` per candidate ticker.

## Output

A per-company fundamentals table using `FundamentalSnapshot` as-is. Every value carries its
source and freshness; a `null` value is reported as missing, never backfilled with an estimate
or a peer average.

## Evidence rules

- Per `INVESTMENT_THINKING_MODEL.md`: "Every metric carries source, period, observedAt,
  freshness, and confidence; missing is null."

## Human Gate

Feeds `valuation-research`, `risk-research`, and the horizon analyses; does not itself gate a
decision.

## Prohibited

No new fundamentals provider, no new store, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
