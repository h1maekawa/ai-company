# Investment Department — Logical Structure

Status: ACTIVE (PR-A) · Companion to `INVESTMENT_THINKING_MODEL.md`

This is a responsibility map, not a directory-split mandate. The 7 logical departments below are
implemented inside the existing `app/lib/investing/`, `app/lib/fund/`, and `app/api/investing/`
trees. PR-A adds no new runtime directories; it documents ownership and points each department at
its Skills under `skills/investing/`.

## ① Market & Theme Research

Owns: market hypothesis, macro, market regime, sector, theme, picks-and-shovels, bottleneck,
causal distance.

- Existing code: `app/lib/investing/intelligence/engine.ts` (market regime), `themes.ts`,
  `themeIntelligence.ts` (theme strength / theme graph), `providers/macro.ts`,
  `providers/sector.ts`, `providers/economicNews.ts`, `newsImpact.ts`.
- Skills: `market-hypothesis`, `long-term-demand`, `market-structure`, `picks-and-shovels`,
  `bottleneck-discovery`, `causal-distance`.
- Not duplicated: no second theme store. `InvestmentThemeGraph` stays the single source for
  theme → ticker structure.

## ② Company Research

Owns: per-candidate fundamental/qualitative research, the 3–5 company comparison rule.

- Existing code: `app/lib/investing/intelligence/providers/sec.ts` (fundamentals),
  `app/lib/investing/intelligence/types.ts` (`FundamentalSnapshot`, `InvestmentCandidate`).
- Skills: `candidate-company-discovery`, `fundamental-research`, `valuation-research`,
  `risk-research`.
- Future (PR-B): typed `CompanyComparisonRow` artifact. Not implemented in PR-A.

## ③ Opportunity Intelligence

Owns: scoring a candidate into an actionable opportunity.

- Existing code: `app/lib/investing/intelligence/engine.ts`,
  `app/lib/investing/intelligence/types.ts` (`InvestmentOpportunity`, `ScoreFactor`,
  `OpportunityGate`). The single `score`/`gate` fields are the back-compat baseline; PR-C adds
  `shortTerm` / `midTerm` / `longTerm` / `tripleGate` alongside them, not instead of them.
- Skills: `short-term-analysis`, `mid-term-analysis`, `long-term-analysis`, `opportunity-decision`.

## ④ Portfolio Intelligence

Owns: concentration, exposure, and risk read on current holdings.

- Existing code: `app/lib/investing/analysis.ts` (general portfolio health — concentration, asset
  diversification, position count, cash ratio — **kept, not removed, not used as this
  department's primary risk score**), `app/lib/investing/portfolio.ts`, `app/lib/investing/revalue.ts`,
  `app/lib/investing/history.ts` (portfolio value history — stays separate from per-decision
  performance, see ⑥).
- Future (PR-D): Theme Concentration, Sector Concentration, Single Stock Exposure, Country
  Exposure, Currency Exposure, Correlation Risk, Drawdown Risk, Thesis Risk. Not implemented in
  PR-A.

## ⑤ Watchlist / Opportunity Pipeline

Owns: tracking a candidate from discovery through decision.

- Existing code: `app/lib/investing/watchlist.ts` (`memory/personal/fund/watchlist.md`
  compatible format: theme / ticker / market / reason / status).
- Future (PR-D): `OpportunityPipelineStatus` (`DISCOVERED` → … → `ARCHIVED`), richer `WatchItem`
  fields (`shortGate`, `midGate`, `longGate`, `targetCatalyst`, `nextEarnings`, `whyWatching`,
  `invalidation`, `addedAt`, `lastReviewedAt`). Must stay backward-compatible with
  `watchlist.md`. Not implemented in PR-A.

## ⑥ Decision & Learning

Owns: recording a decision, tracking what happened after it, and learning without mutating
weights automatically.

- Existing code: `app/lib/investing/intelligence/types.ts` (`InvestmentDecisionRecord`),
  `app/api/investing/decisions/route.ts`, `app/api/investing/learning/route.ts`,
  `app/lib/investing/history.ts` (portfolio value history — a different artifact from
  per-decision performance).
- Skills: `opportunity-decision`, `performance-review`, `investment-learning`.
- Future (PR-E/PR-F): `DecisionPerformance` (1D/5D/20D/60D/120D/250D returns and drawdown/gain),
  Win Rate / EV / factor attribution, `WeightRecommendation` (human-gated, never auto-applied).
  Not implemented in PR-A.

## ⑦ Data / Provider Health

Owns: provider status and production-readiness visibility for this department only.

- Existing code: `app/lib/investing/intelligence/providers/*`, `app/lib/fund/marketData/`,
  `ProviderStatus` (`OK` / `NOT_CONFIGURED` / `ERROR` / `SKIPPED`) already recorded in
  `IntelligenceToday.providerStatus`.
- Audited but not merged in PR-A: `origin/feat/investment-phase2-readiness-audit` already
  implements a read-only `InvestmentPhase2Readiness` projection
  (`app/lib/investing/intelligence/readiness.ts` + `readinessProjection.ts` +
  `app/api/investing/intelligence/readiness/route.ts`) that reports the
  `INVESTING_INTELLIGENCE_ENABLED` flag state and `FRED_API_KEY`/`SEC_USER_AGENT`/SerpAPI
  configuration presence without reading or exposing secret values, and without mutating
  Production. It is safe, additive, and already tested, but it adds runtime code/an API route,
  which is out of scope for PR-A ("code behavior should barely change"). Recommended as the next
  PR after PR-A (see audit report).
- No new provider abstraction is introduced by this department.

## Audit notes on other investment branches (read-only, not merged by PR-A)

| Branch | Already merged into `main`? | Relevant to PR-A? |
|---|---|---|
| `feat/investment-theme-graph-candidate-bridge` | Yes (ancestor of `main`) | No action needed. |
| `feat/investment-theme-intelligence-fast-track` | Yes (ancestor of `main`) | No action needed. |
| `feat/investment-phase2-readiness-audit` | No | Implements ⑦; recommended as next PR, not pulled into PR-A (adds runtime code). |
| `feat/investment-thinking-model` | No | Implements a research-artifact builder (`thinkingModel.ts`, `thinkingResearch.ts`) that overlaps with PR-B's Market/Company Research scope. **Also edits `app/lib/note/investing/xBridge.ts` and adds `app/lib/note/investing/researchProjection.ts`**, which are part of the note/X draft bridge. Per this session's constraint (no X/Content changes), this branch must not be merged as-is; its non-X-coupled files (`thinkingModel.ts`, `thinkingResearch.ts`) are reusable raw material for PR-B after the X-coupled parts are separated out. |

Four other investment branches exist on `origin` that were not named in this audit request —
`feat/investment-decision-learning`, `feat/investment-intelligence-opportunity-correctness`,
`feat/investment-intelligence-phase1`, `feat/investment-transaction-ledger`. All four are already
ancestors of `main` (fully merged); no action needed. A local branch
`feature/investment-x-autonomous-department` also exists but was out of scope (X-coupled) and was
not inspected.
