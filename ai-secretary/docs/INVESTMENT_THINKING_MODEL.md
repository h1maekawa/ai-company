# Investment Thinking Model v1

## Purpose and ownership

The Investment Department owns one canonical, versioned thinking model. It turns existing Research/Evidence into an auditable research artifact; it is not a trading model and does not add a Research, Knowledge, Performance, or Learning store.

Runtime output is saved as `researchArtifact` inside the existing `IntelligenceToday` record. The active model definition is `ACTIVE_INVESTMENT_THINKING_MODEL`; a model change requires a reviewed version change. Human feedback enters the existing non-executable `SkillCandidate` workflow and cannot mutate the active model by approval alone.

## Research sequence

1. Market hypothesis with confirming and invalidating evidence
2. Observable market demand
3. Market structure and causal distance
4. Explicitly evidenced bottlenecks
5. Three to five comparable companies when evidence permits
6. Source- and period-bearing fundamentals
7. Valuation comparison, or `INSUFFICIENT`
8. Risks with unknown probability preserved as `UNKNOWN`
9. Current research view and unresolved unknowns

Every statement is classified as `FACT`, `INTERPRETATION`, `HYPOTHESIS`, or `UNKNOWN`. Missing and stale fields are not inferred. A bottleneck cannot be created from theme similarity alone.

## Authority

This feature may research, compare, explain, and propose a model-improvement candidate. Buy/Sell, final GO/WAIT/PASS, position size, order placement, broker actions, and money transfer remain `HUMAN_ONLY`. No executable trade path is introduced.

## X projection

X receives a read-only projection of the canonical research artifact. Supported projection types are `LEARNING`, `INSIGHT`, `MARKET_STRUCTURE`, `COMPANY_COMPARISON`, and `INVESTMENT_THESIS`. Each type has a minimum evidence depth. An ineligible projection cannot be promoted by narrative quality and falls back to the existing safe path. The existing Fact/Safety/Publish Eligibility and investment Fact Gate remain authoritative.

## Current limitations

- SEC coverage and provider freshness remain dependent on existing providers.
- Peer and historical valuation comparison is not yet available, so valuation remains `INSUFFICIENT` rather than guessed.
- Explicit bottleneck evidence may be absent; the UI displays that absence.
- Fewer than three evidence-backed companies may be available; the artifact reports the gap.
