# X Production Readiness — Phase B1

Status: `CODE_READY / PRODUCTION_RUNTIME_UNKNOWN`

Baseline: `ed0663cd7a2c4fe10ac2ff7be4dd2c82d524ade5`

This audit covers the existing Normal DailyX path. It does not authorize a Canary rerun, provider mutation, Production data cleanup, deployment, or threshold change.

## Canonical Flow

| Stage | Existing owner | B1 finding |
|---|---|---|
| Research | `note/research` and Daily Research checkpoint | JST operation id rolls daily; stale active checkpoints do not suppress a new JST day |
| Hot / Confidence | `research/cluster.ts` | scored candidates remain `MEDIUM` / `HIGH` only; `LOW` remains a normal skip |
| Plan | `automation/dailyXPlan.ts` | deterministic current-day plan and slot candidate reference |
| Draft | `automation/dailyXExecution.ts` | new draft receives `planId`, `planSlotId`, exploration, and strategy snapshot |
| Fact / Safety | QA facts, X Safety, and Buffer final preflight | all remain fail closed; no gate was weakened |
| Duplicate | plan/slot lineage, strict claim, daily count | duplicate, unavailable, persistence failure, and ambiguous states stop another send |
| Publish Eligibility | `automation/publishEligibility.ts` | current plan/slot, length, similarity, source, experience, secret/PII, and high-risk checks remain required |
| Buffer / X | `publishing/buffer.ts` | one existing external mutation path; ambiguous responses retain the claim and prohibit blind retry |
| Reconciliation | publication evidence plus metrics evidence | B1 separates publication truth from metrics availability for Normal DailyX as well as Canary |
| Performance | `ContentPerformance` | missing remains `undefined` / `unavailable`; observed metrics are never replaced by a later unavailable read |
| Learning | shared growth review and learning foundation | observation, interpretation, approved learning, and strategy mutation remain distinct |

## Verified Defects and Fixes

1. Normal DailyX reconciliation used the combined Buffer post/metrics read. A metrics-side failure could therefore hide valid `sent`, `sentAt`, and canonical X link evidence. B1 now reads publication evidence first and metrics separately.
2. A later metrics outage could replace an existing observed `ContentPerformance` record with an unavailable snapshot. B1 preserves the existing observed record and reports metrics as unavailable for the current read.

Neither fix calls `createPost`, retries a provider mutation, requeues a draft, or changes DailyX candidate selection.

## Failure Matrix

| Failure | Result |
|---|---|
| Research has only LOW confidence candidates | normal skip; no plan or publish |
| stale prior-day Daily Research checkpoint | new JST operation id; stale checkpoint does not suppress the run |
| missing or duplicate plan/slot lineage | fail closed; no automatic selection |
| Safety, Fact, similarity, or eligibility rejection | blocked before provider mutation |
| strict claim or daily count unavailable | stop; no Buffer request |
| Buffer timeout, 5xx, invalid JSON, or missing post id | ambiguous; claim retained; no resend |
| publication evidence missing or invalid | no published promotion; no resend |
| publication confirmed, metrics unavailable | published truth retained; metrics marked unavailable |
| observed metrics followed by metrics outage | previous observations retained; no fake zero |
| published queue item | terminal; never requeued by DailyX |

## Queue Lifecycle

The existing global `active unresolved >= 20` and per-topic `>= 3` protections remain unchanged. Published/discarded rows are terminal. Provider-linked scheduled rows remain protected from cleanup and are surfaced for reconciliation. Once valid publication evidence is observed, reconciliation promotes them to `published`, removing them from unresolved pressure. An unconfirmed old scheduled row remains fail closed by design; B1 does not guess, delete, or resend it.

## Production Truth

Repository tests establish code-path readiness only. This workspace did not provide safe read-only evidence for current Production runtime status, persistent queue contents, current DailyX plan, deployment health, provider health, or live metrics freshness. Those states are `UNKNOWN`, not healthy and not failed.

After human review, CI, and Preview pass, the next step is a read-only Production observation of the normal scheduled run and subsequent reconciliation. Do not run or reuse the 2026-10-08 one-time Canary.

## Protected Boundaries

- Hot Confidence thresholds unchanged.
- Normal DailyX still accepts only `MEDIUM` / `HIGH`; `LOW` stays skipped.
- No Safety, Fact, Duplicate, or Publish Eligibility bypass.
- No Canary reuse or new Canary execution.
- No Production data, Redis schema, secret, environment, API key, investment, Note publishing, or provider configuration change.
- No automatic merge or deploy.
