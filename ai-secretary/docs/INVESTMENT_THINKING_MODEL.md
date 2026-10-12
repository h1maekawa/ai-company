# Investment Thinking Model v1

Status: ACTIVE · Owner: Investment Department (`personal-fund`) · Scope: PR-A (Architecture Foundation)

## Purpose

The Investment Department owns one canonical, versioned thinking model. It governs how the
department researches, compares, and reasons about candidates across the existing Investment
Intelligence runtime (`app/lib/investing/`). It is a policy and research-sequencing artifact, not
a trading model: no step in this document authorizes an automatic trade, position change, or
funds movement.

Final investment decisions (GO / WAIT / PASS, position size, order placement, broker action, and
any funds transfer) remain **HUMAN_ONLY**, matching the existing company-wide contract already
enforced by `app/lib/company/execution/actionTypes.ts` (`INVESTMENT_TRADE` is classified `R4`,
"AIに実行させない") and `app/lib/fund/engine.ts` (`executionAuthority: "HUMAN_ONLY"`,
`aiExecutionAllowed: false`). This document does not create a second trade-authority contract; it
reuses the existing one.

## Research sequence

```
World change
  -> Market Hypothesis
  -> Long-Term Demand
  -> Market Structure
  -> Picks & Shovels
  -> Bottleneck
  -> Candidate Companies
  -> Fundamental
  -> Valuation
  -> Risk
  -> Short / Mid / Long horizon view
  -> Human Decision
  -> Performance
  -> Learning
```

Every research step must classify its statements as one of:

- `FACT` — directly observed, sourced, and dated.
- `INTERPRETATION` — a reading of one or more facts.
- `HYPOTHESIS` — a testable forward claim with stated confirming/invalidating evidence.
- `UNKNOWN` — explicitly unresolved. **`UNKNOWN` is never filled with a guess or a default value.**

This mirrors the existing evidence discipline already enforced by
`app/lib/investing/intelligence/types.ts` (`InvestmentEvidence`, `IntelligenceFreshness`,
`ProviderStatus`) and `app/lib/investing/intelligence/engine.ts` / `research.ts` / `themeIntelligence.ts`,
which already refuse to synthesize values for missing providers. The thinking model formalizes
that discipline as department policy instead of leaving it implicit in the runtime code.

## Scope and horizons

Markets: US stocks and Japan stocks.

Sector emphasis: Semiconductor and AI Infrastructure are the current strongest theses, but the
model is **not sector-locked**. A candidate from another sector enters research the same way if
it scores higher on Future Demand, Earnings, Volume, Relative Strength, or Catalyst than the
current semiconductor/AI set.

Horizons:

| Horizon | Window |
|---|---|
| `SHORT` | 1 trading day – 4 weeks |
| `MID` | 1 – 6 months |
| `LONG` | 6 months – 3+ years |

Horizon scoring (`shortTerm` / `midTerm` / `longTerm` on `InvestmentOpportunity`) and the Triple
Gate (`TRIPLE_GO` / `MID_LONG_GO` / `SHORT_ONLY` / `LONG_ONLY` / `MIXED` / `NO_GO` /
`DATA_INCOMPLETE`) are **not implemented in this PR**. They are specified here so PR-C can
implement them as an additive, backward-compatible extension of the existing single
`InvestmentOpportunity.score` / `gate` (`app/lib/investing/intelligence/types.ts`), never a
replacement.

## Department structure (logical, not a forced directory split)

See `INVESTMENT_DEPARTMENT_STRUCTURE.md` for the full mapping of each of the 7 logical
departments to the existing code that already implements it, and to the Skills under
`skills/investing/` that formalize each department's playbooks.

## Company comparison rule

Deep research defaults to comparing **3–5 companies** for a given thesis, not a single ticker.
Single-ticker research is permitted only when a human explicitly asks for a single ticker. The
typed `CompanyComparisonRow` artifact is a PR-B deliverable; this PR only states the rule.

## Causal distance

Theme → company causal distance must be recorded, not assumed from thematic similarity alone:

| Distance | Meaning |
|---|---|
| 1 | Direct |
| 2 | Strong |
| 3 | Moderate |
| 4 | Weak |
| 5 | Indirect |

The further the distance, the lower the confidence a research artifact may claim. The existing
`InvestmentThemeGraph` / `ThemeGraphDiscovery.hopDistance` fields
(`app/lib/investing/intelligence/types.ts`) already carry a 0/1/2-hop distance for theme-graph
discoveries; this policy generalizes that into the 1–5 causal-distance scale used across all
research, not only theme-graph-sourced candidates. No new theme-graph store is introduced.

## Evidence integrity

Every research claim should carry, where available: `source`, `sourceUrl`, `publishedAt`,
`observedAt`, `fetchedAt`, `freshness`, `confidence`. A missing field is recorded as missing
(`UNKNOWN` / `null`), never scored as zero and never silently dropped. This is the same contract
already implemented by `InvestmentEvidence`, `FundamentalSnapshot`, and `ProviderStatus` in
`app/lib/investing/intelligence/types.ts`.

## Look-ahead bias

A decision score may only use evidence that was available as of the decision timestamp. News,
earnings, fundamentals, or price data published after a decision may be used to measure that
decision's later *performance*, never to recompute or justify the original score. (Enforced in
PR-E/PR-F; stated here as a standing rule for every research/decision artifact.)

## Weight learning safety

No automated process may change a scoring weight. Learning (PR-F) may only emit a
`WeightRecommendation` (factor, current weight, suggested weight, sample size, confidence,
evidence, expected improvement) for a human to review and apply. The minimum sample size for a
recommendation is 30 decisions (`INSUFFICIENT_SAMPLE` below that); 100+ is the recommended sample
for confidence.

## Provider boundary

The department shares the existing provider layer — Yahoo, SEC, FRED, SerpAPI
(`app/lib/investing/intelligence/providers/`, `app/lib/fund/marketData/`) — and the existing
`ProviderStatus` states (`OK` / `NOT_CONFIGURED` / `ERROR` / `SKIPPED`). No Skill or research step
introduces a parallel provider, a parallel evidence store, or a parallel decision store.

## Capacity boundary

`app/lib/investing/capacity.ts` is the read-only input from Household Finance / Personal OS. The
Investment Department reads an approved investment capacity; it never computes, edits, or
overrides household budget, fixed costs, or living-expense data.

## No Auto Trade

The following are permanently out of scope for this department, regardless of model confidence:

- Broker order execution (buy or sell)
- Automatic position sizing
- Automatic funds transfer
- Any code path that converts a GO/WAIT/PASS research conclusion directly into a placed order

This repeats, rather than replaces, the existing `INVESTMENT_TRADE` / `R4` contract referenced
above. Research, comparison, scoring, and decision-*support* are in scope; execution is not.

## Change control

A change to this document's research sequence, horizon definitions, or human-gate rules requires
a human-reviewed version bump (this file's `Status` line and a corresponding changelog entry
here). An AI-authored "skill candidate" or "weight recommendation" may *propose* a change; it
cannot *apply* one, matching the existing non-executable `SkillCandidate` workflow in
`app/lib/company/evolution/skillCandidates.ts` (`executable: false`).

## Changelog

- v1 (2026-10-12): Initial canonical document (PR-A, Investment Architecture Foundation).
