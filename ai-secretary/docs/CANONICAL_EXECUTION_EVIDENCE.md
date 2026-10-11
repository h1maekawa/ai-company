# Canonical Execution Evidence

## Scope

This contract records execution truth at the canonical writer. It does not change DailyX ranking, Hot Confidence, Safety, Fact, Publish Eligibility, Buffer, retry, or publication behavior. Observability readers must not infer a missing result.

## GateEvidence

The X Content domain owns `GateEvidence` as append-only evidence on the existing `DailyXPlan` artifact. The writer is `executeDailyXPlan()` at the exact evaluation boundary:

- `SAFETY` immediately after the generation safety gate;
- `FACT` from the factual checks performed inside Publish Eligibility;
- `PUBLISH_ELIGIBILITY` from the final pre-Buffer eligibility decision.

Each record contains a unique ID, `gateType`, `result`, safe `reasonCode`, `policyVersion`, plan/slot/draft lineage, `evaluatedAt`, and `source`. Raw post text, provider responses, secrets, and credentials are excluded. A dependency that does not supply structured evidence is persisted as `UNKNOWN`; a reader may not convert it to PASS.

## MorningBriefEvidence

The Morning Brief writer stores `MorningBriefEvidence` in the existing durable Execution Store under the separate `morning-brief-evidence` idempotency scope. It records:

- deterministic brief ID and brief date;
- confirmed referenced X post IDs;
- published, successful, failed, skipped, and performance-available counts;
- generated and delivered timestamps;
- `GENERATED`, `DELIVERED`, `PARTIAL`, `FAILED`, or `UNKNOWN` status.

The Slack delivery idempotency result also contains the final evidence. Delivery idempotency is committed before the evidence projection, so a projection failure cannot cause a blind resend. A later deduped invocation can restore the projection from that result without delivering Slack again.

## Reader contract

PR #166 remains a separate, currently unmerged Observability change. Its follow-up may display PASS/FAIL/BLOCKED or AVAILABLE only when these persisted records exist. Missing evidence remains UNKNOWN/UNAVAILABLE. This PR does not import or modify PR #166.
