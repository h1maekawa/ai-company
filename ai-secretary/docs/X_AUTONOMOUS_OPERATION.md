# X Autonomous Research and Three-Slot Operation

## Scope

B1.5 extends the existing X lifecycle; it does not replace any engine:

```text
DailyResearchAgenda (planning only)
  → canonical Department Research
  → existing ResearchItem / TrendCluster
  → existing Hot Score / Hot Confidence
  → DailyXPlan
  → existing Fact, Safety, Duplicate, Publish Eligibility and Buffer path
  → Performance / Nightly Review / Learning candidate
```

No second Research Store, Hot Score, publisher, Performance store, or Learning engine exists in this change.

## Daily Research Agenda

`DailyResearchAgenda` is a department-neutral Planning Artifact owned by the Research execution boundary. It records date, department, goals, questions, query intents, target pillars and slots, reasons, evidence references, unknowns, and creation time. It is attached to the corresponding `ResearchRun`; it is not a new Research Store or factual artifact.

The Creator adapter uses the X Brand Profile plus available recent Research, posts, measured Performance, Nightly Review references, recent topics, unresolved canonical Research gaps, verified Personal Experience, and Note candidate references. Missing inputs are written as `UNKNOWN`; they are never converted to zero or facts.

Daily query intents are drawn from Breaking / Current, Strategic Brand, Performance Follow-up, Knowledge Gap, Evergreen / Educational, and Experiment. Categories are interleaved and the existing Creator policy remains authoritative:

- `maxQueriesPerRun = 8`
- `maxItemsPerRun = 40`

The Agenda cannot change either budget. Unresolved unknowns, missing sources, missing independent sources, stale evidence, or missing personal evidence may become later query candidates, but are never filled by assumption.

## Fixed three-slot policy

The initial JST policy is fixed:

| Time | Operation role | Intent |
|---|---|---|
| 07:30 | reach | fresh, current, broad-relevance candidate |
| 12:15 | trust | explanation, learning, why-it-matters candidate |
| 20:30 | depth | personal interpretation, follow-up, deep dive, Note candidate, or eligible monetization |

`depth` does not force Note or affiliate content. The existing purpose allocation and every monetization eligibility rule still apply. Time and operation role are version-controlled policy and are not changed by Performance or AI Learning.

## Candidate selection

Normal DailyX continues to call `filterHotConfidenceCandidates()`. Once Hot scoring is present, only `MEDIUM` and `HIGH` candidates are eligible. `LOW` is never promoted to fill a slot.

Role selection is a deterministic lexicographic ordering over existing evidence dimensions, not a new ranking score:

- reach: existing freshness, momentum, then existing Hot/exploitation order;
- trust: existing Brand Fit, originality, then existing order;
- depth: verified experience linkage, approved topic priority, monetization fit, then existing order.

The planner assigns distinct clusters when alternatives exist. It reuses a cluster only when the eligible candidate set has no alternative, retaining existing safety policy.

## Feedback loop

Observed Performance and Nightly Review references can create tomorrow's follow-up queries. Missing metrics remain unavailable. Learning remains evidence-backed input/candidate only in B1.5 and cannot mutate the Research budget, three-slot schedule, Hot threshold, Fact/Safety gates, or publication policy.

## Read-only runtime readiness

Automation status reports only safe configuration facts:

- `maxXPostsPerDay`
- `publishingEnabled`
- `xAutoPublish`
- `socialOperationMode`
- Buffer status as `CONFIGURED` or `NOT_CONFIGURED`
- whether `maxXPostsPerDay === 3`

No secret or credential value is returned. If the limit is not three, status reports `3-post operation not enabled`; it never changes the setting.

Three-post readiness reports slot count, eligible Hot candidate count, scheduled count, blocked count, and safe skip reason codes. Fewer than three eligible candidates is a valid fail-closed state. Quality, evidence, and duplicate prevention take priority over volume.

## AI authority

AI may decide:

- which bounded query intents to propose inside the existing Research policy;
- which unresolved evidence gaps deserve another query;
- the role-aware ordering among already eligible Hot candidates;
- whether readiness is insufficient and why.

AI may not decide:

- Hot Confidence thresholds or promotion of `LOW`;
- Research query/item budgets;
- slot time or role policy changes;
- Fact, Safety, Duplicate, Publish Eligibility, or Buffer final-gate bypasses;
- resend after an ambiguous Buffer result;
- autonomous strategy/policy mutation;
- secret/env changes, merge, deploy, paid Note publication, or investment trade.

## Future department reuse

The common Agenda contract supports `creator`, `fund`, `operations`, and `engineering`. B1.5 implements only the Creator/X adapter. Fund, Operations, and Engineering policies and runtime behavior are unchanged. Future adapters must reuse the same Research Platform and retain their existing Department policy budgets and human gates.
