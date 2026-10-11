# Production Read-only Observability

> Status: P0 X projection implemented; runtime truth remains evidence-driven  
> Owner: Operations / CEO read model  
> Mutation authority: none

## Purpose

This layer answers what the existing Production stores currently prove about an X lifecycle. It is a projection, not a store, executor, retry mechanism, or source of truth.

```text
DailyX Plan + Social Draft + Trend Cluster + Platform Performance
  -> read-only X projection
  -> GET-only authenticated API
```

It never posts, schedules, retries, approves, changes a queue, runs a Canary or Cron, or writes a store.

## Canonical inventory and IDs

| Evidence | Canonical reader | Identity used by the projection | Current coverage |
|---|---|---|---|
| Plan / slot | `loadDailyXPlans` | `plan.id`, `slot.id` | available |
| Draft / lineage | `loadSocialDrafts` | `draft.id`, `planId`, `planSlotId` | available |
| Hot evidence | `loadClusters` | `candidateRef.id`, `sourceResearchIds` | partial |
| Buffer handoff | Plan / Draft fields | `bufferPostId`, `scheduledAt` | partial; raw provider response is deliberately excluded |
| Actual X publish | Social Draft | `xPostId`, canonical X URL, `publishedAt` | available when reconciliation has persisted all three |
| Performance | `loadPerformance` | `contentId = draft.id` | available; missing metrics remain `null` |
| Morning Brief | no canonical delivery-result reader | none | unavailable; never inferred from the generated message |
| Gate evidence | no independent persisted outcome contract | none | unavailable or explicit failure only |

`runId`, `publishJobId`, an independent `providerJobId`, `performanceRecordId`, and `morningBriefItemId` are not all represented by current canonical stores. The API returns `null`/`UNKNOWN` rather than manufacturing them.

## API

- `GET /api/company/runtime/observability/x`
- `GET /api/company/runtime/observability/x/daily?date=YYYY-MM-DD`
- `GET /api/company/runtime/observability/x/slots/:slotId`
- `GET /api/company/runtime/observability/reconciliation`

The existing `/api/company/runtime/observability` contract remains unchanged. All new routes stay behind the normal session-authenticated proxy. They are not public health endpoints or machine-route exemptions. Unsupported mutation methods receive the framework's method rejection because no handlers exist.

## Safety and data handling

- The reader imports loaders only. Architecture tests reject save/upsert/publish/execute imports.
- Draft text is used in memory only to compute weighted length and SHA-256. The P0 API returns no body preview.
- Raw provider responses and raw failure text are not returned.
- Tokens, environment values, request headers, cookies, PII, and provider payloads are never part of the projection.
- Buffer scheduled is not X published.
- Missing metrics are `null`, never `0`.
- `UNKNOWN` is never promoted to `PASS`.
- A published item without persisted Safety evidence is reported as `SAFETY_INTEGRITY_VIOLATION`.
- A normal LOW-confidence skip is `NORMAL_SKIP_LOW_CONFIDENCE` / `HEALTHY_WITH_SKIP`.
- Multiple published drafts for the same `(planId, slotId)` are `DUPLICATE_CONFIRMED`; no item is selected or changed.

## Known representational gaps

The projection exposes these gaps rather than hiding them:

1. Safety, Fact, and Publish Eligibility outcomes are evaluated in the execution path but are not independently persisted as immutable outcome records. Successful historical publication therefore does not prove each gate through current storage alone.
2. Morning Brief generation/delivery does not currently expose a canonical read model containing referenced X post IDs and published counts. Runtime reconciliation is therefore `UNKNOWN` until that evidence exists.
3. Buffer request/accept/schedule timestamps and safe response codes are not fully normalized in canonical fields.
4. Research trust tier, candidate rank, and plan version are not persisted for every historical slot.

Closing these gaps requires a separate reviewed change to the canonical artifact contracts and normal writers. It must not be implemented by making Observability write data or by retrospectively guessing Production truth.

## Verification and Production smoke

Local tests cover lineage, null/unknown handling, duplicate detection, LOW skip, stale research, Buffer-only state, Performance absence, Brief mismatch, read-only imports, GET-only routes, and auth-boundary placement.

Production smoke must be read-only:

1. authenticate as the owner;
2. call the four GET endpoints;
3. confirm no store revision, queue, provider job, draft, plan, or external post changes;
4. compare only evidence that is present;
5. report unavailable evidence as unavailable.

No Canary, Cron, retry, provider mutation, or direct Production data update is part of the smoke test.
