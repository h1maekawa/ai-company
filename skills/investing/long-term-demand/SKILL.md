---
id: long-term-demand
name: Long-Term Demand
department: Market & Theme Research
thinkingModelStep: market-demand
horizon: ALL
status: planned
---

## Purpose

Checks whether a market hypothesis is backed by observable, durable demand evidence, as opposed
to narrative momentum.

## Reuses

- `app/lib/investing/intelligence/providers/economicNews.ts` and `newsImpact.ts`: items whose
  `impacts[].role === "future_demand"` are the existing durable-demand evidence signal.
- `app/lib/investing/intelligence/themeIntelligence.ts` / `themes.ts` for theme-level strength as
  corroborating (not sufficient on its own) context.

## Inputs

- `EconomicNewsItem[]` filtered to `role: "future_demand"`.
- `ThemeStrength[]` (`app/lib/investing/intelligence/types.ts`).

## Output

A demand status of `SUPPORTED` (2+ independent future-demand items), `PARTIAL` (1 item), or
`UNKNOWN` (0 items). Classified `INTERPRETATION` when evidence exists, `UNKNOWN` otherwise —
never `HYPOTHESIS` dressed up as `FACT`.

## Evidence rules

- Demand status is derived only from `future_demand`-tagged impacts with evidence IDs. A theme
  being "hot" (`ThemeStrength.hot`) is never substituted for demand evidence.

## Human Gate

Feeds `market-hypothesis` and downstream company research; does not itself gate a decision.

## Prohibited

No new provider, no new evidence store, no trade path, no automatic weight change.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
