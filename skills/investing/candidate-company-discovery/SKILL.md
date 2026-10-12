---
id: candidate-company-discovery
name: Candidate Company Discovery
department: Company Research
thinkingModelStep: candidate-companies
horizon: ALL
status: planned
---

## Purpose

Shortlists 3–5 companies to compare for a given thesis, pulling from existing holdings,
watchlist, and theme/graph candidates rather than a single hand-picked ticker.

## Reuses

- `app/lib/investing/intelligence/types.ts`: `InvestmentCandidate` already carries `held`,
  `watchlisted`, `themes`, `candidateSources` (`portfolio` / `watchlist` / `theme-universe` /
  `theme-graph` / `research`).
- `app/lib/investing/watchlist.ts`, `app/lib/investing/portfolio.ts` for the portfolio/watchlist
  sources.

## Inputs

- `InvestmentCandidate[]`.

## Output

A 3–5 company shortlist with each company's `candidateSources` and theme exposure. Per
`INVESTMENT_THINKING_MODEL.md`, single-ticker output is only valid when a human explicitly asked
for one ticker. The typed `CompanyComparisonRow` artifact (ticker, name, marketRole,
themeExposure, causalDistance, growth/margin/valuation fields, moat, risks, evidenceRefs) is a
PR-B deliverable, not implemented here.

## Evidence rules

- A company enters the shortlist only via a recorded `candidateSources` entry; it is never added
  because it "feels similar" to a theme.

## Human Gate

Feeds `fundamental-research`, `valuation-research`, `risk-research`; does not itself gate a
decision.

## Prohibited

No new candidate store, no new provider, no trade path.

## Status

`planned` — no `run()` in `app/lib/skills/implementationRegistry.ts` yet.
