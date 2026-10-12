# Investment Intelligence Phase 2 Readiness

Status: read-only audit contract

## Scope

This is PR-A of Investment Intelligence OS Phase 2. It audits the Production prerequisites for the existing Phase 1 research pipeline. It does not enable the pipeline, alter a provider, execute research, change a portfolio, or place a trade.

The read model is available from `GET /api/investing/intelligence/readiness` and reports only configuration state, previously recorded provider evidence, and non-sensitive Store inventory counts.

## Evidence rules

- `OK` is reported only when an existing canonical `IntelligenceToday.providerStatus` contains a recorded successful check.
- A configured provider without recorded evidence is `SKIPPED`, not `OK`.
- Missing `FRED_API_KEY`, `SEC_USER_AGENT`, or the SerpAPI enablement/key pair is `NOT_CONFIGURED`.
- Yahoo requires no Secret, but is still `SKIPPED` until a recorded provider check exists.
- The endpoint never performs a live provider probe. This keeps the audit deterministic, low-cost, and read-only.
- Missing Portfolio or Watchlist data remains unavailable; it is never converted to zero-valued financial data.

## Production blockers

The repository cannot prove Production environment configuration. The endpoint must be read in the Production runtime to establish current truth. The confirmed pre-implementation expectation is:

- `INVESTING_INTELLIGENCE_ENABLED`: `NOT_CONFIGURED`; changing it requires Human Review.
- FRED: `NOT_CONFIGURED` when `FRED_API_KEY` is absent.
- SEC: `NOT_CONFIGURED` when `SEC_USER_AGENT` is absent.
- SerpAPI: `NOT_CONFIGURED` unless both explicit enablement and a key are present.

No Secret value, API key, token, holding, portfolio value, watchlist item, or raw provider payload is returned.

## Human gates and protected boundaries

Human Review remains mandatory for Production feature flags, provider Secrets, investment rule changes, final GO decisions, weight changes, and portfolio actions. Auto Trade, broker integration, orders, position changes, Production deployment, and environment mutation are outside this PR.

## Follow-up

PR-B may add the Short / Mid / Long horizon model only after this audit is reviewed and the Production readiness state is understood. A missing prerequisite must remain a blocker; it must not be bypassed with synthetic data.
