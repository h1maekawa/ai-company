# AI Company Master SSOT

> Status: active architecture and delivery SSOT  
> Baseline: `main` at `6776ba7`  
> Last reviewed: 2026-10-09 (Asia/Tokyo)

This document defines the product architecture, delivery priority, shared systems, human gates, and protected boundaries for AI Company. It describes code capability, not unverified Production health. Runtime state must come from the relevant health, execution, provider, and deployment evidence.

Every implementation must read this document before design or code changes. If code and this document conflict, do not silently create a second architecture: confirm the current implementation, record the discrepancy, and update both through a reviewed PR.

## Vision

AI Company is a Product OS in which departments reuse shared evidence, execution, accounting, performance, and learning foundations. The CEO focuses on important decisions, approvals, and direction changes while routine, authorized work is observable and auditable.

The durable operating loop is:

```text
External World
  → Research
  → Knowledge
  → Opportunity
  → Mission
  → Execution
  → Result
  → Performance
  → Revenue
  → Learning
  → Next Opportunity
```

This is a canonical lifecycle, not permission for every stage to run automatically. Evidence quality, policy, authority, and human gates remain binding at every transition.

## Priority Order

The following order is fixed until this SSOT is deliberately revised:

1. AI Company Product Foundation
2. SNS Business: Instagram and X automation
3. Investment Business
4. Slack Conversation UX
5. Other expansion: LINE, TikTok, multi-account SNS, advanced video, and similar work

Before accepting new scope, ask:

1. Is this Product Foundation?
2. Does this complete SNS automation?
3. Does this complete Investment Business?

If all answers are no, defer by default.

## Architecture

### Shared lifecycle ownership

| Stage | Canonical responsibility | Current primary implementation |
|---|---|---|
| Research | sourced, fresh, traceable evidence | `app/lib/company/research`, domain adapters under `app/lib/note/research` and `app/lib/investing` |
| Knowledge | candidate-to-formal knowledge lifecycle | Knowledge/Vault services and index; formal promotion requires review |
| Opportunity | evidence-backed business or investment candidate | `app/lib/company/opportunity`, investment intelligence |
| Mission | accepted work with owner and outcome | `app/lib/company/execution/mission.ts` |
| Execution | plan, action, approval, idempotency, lease, audit | `app/lib/company/execution`, durable runtime store |
| Result | typed mission or publication outcome | execution completion and domain result stores |
| Performance | measured outcome with missing distinct from zero | shared platform performance plus provider adapters |
| Revenue | append-only confirmed revenue/cost facts | Revenue Ledger and Business Cost Ledger |
| Learning | evidence-backed candidate, comparison, decision | shared platform learning and domain adapters |
| Next Opportunity | learning-informed candidate, never fabricated certainty | Opportunity Engine and ranking services |

Departments must not create competing Research, Performance, Revenue, or Learning truth stores. A platform-specific adapter is allowed when it maps provider data into the canonical model and does not become a second source of truth.

### Department boundaries

| Department | Purpose | Boundary |
|---|---|---|
| Creator / SNS | X, Instagram, and Note content operations | platform-specific creative strategy; shared research, performance, revenue, and learning |
| Investment | market research, opportunity analysis, portfolio intelligence | analysis and GO/WAIT/PASS only; no automatic trade |
| Operations / CEO | health, attention, approvals, and business status | projections over canonical stores; Home is not a parallel store |
| Engineering | scoped implementation and verification | protected changes, merge, and deploy remain human-gated |
| Planning | mission and schedule projection | does not own mission truth |
| Knowledge | reusable formal knowledge | raw research or conversation is not automatically formal knowledge |

### SNS platform rule

X and Instagram share Research, Facts, Sources, Canonical Brief, Brand, Revenue, Performance Model, and Learning Framework. They retain platform-specific hooks, copy, visual treatment, CTA, format, posting time, winning patterns, and strategy.

## Core Systems and SSOT

| Canonical store | What it owns | What it must not own |
|---|---|---|
| Research Store | provider items, freshness, reliability, run health, canonical research artifacts | formal knowledge or unsupported conclusions |
| Knowledge Store | reviewed reusable knowledge and index metadata | raw external instructions or unreviewed assumptions |
| Execution Store | missions, plans, action requests, approvals, content handoff metadata, runtime coordination | formal content bodies, accounting ledgers, provider secrets |
| Content stores | drafts, publication lineage, provider IDs, publication state | generic missions or financial truth |
| Platform Performance | canonical measurements, availability, baselines, comparisons | fabricated zeroes for missing metrics |
| Revenue Ledger | append-only confirmed revenue facts | investment P/L or estimates presented as realized revenue |
| Business Cost Ledger | append-only, human-confirmed business costs | inferred costs or investment purchase amounts |
| Learning | observations, hypotheses, experiments, candidates, decisions | silent policy or strategy mutation |

Rules:

- Prefer an existing store. Add a new store only after documenting why the current model cannot represent the data.
- A projection, dashboard, cache, or provider response is not a new SSOT.
- Production mutation requires the durable store and version/lease protections defined by the runtime.
- Missing, unavailable, unknown, and zero are distinct values.
- IDs and lineage must be preserved across every handoff.

## Canonical Artifacts

Departments exchange typed artifacts rather than unstructured copied prose.

| Artifact | Minimum contract | Status |
|---|---|---|
| `ResearchArtifact` / `CanonicalResearchArtifact` | evidence IDs, sources, facts, interpretation, unknowns, freshness, routing | Implemented |
| `CanonicalContentBrief` | brand, platform, purpose, sourced facts, constraints, CTA, commercial relation | Planned canonical contract; existing content types are partial |
| `Opportunity` | evidence, coverage, expected value availability, score basis, status | Implemented for revenue and investment domains; cross-domain normalization partial |
| `Mission` | owner, outcome, status, trace, authority | Implemented |
| `PublishedContent` | plan/slot lineage, provider ID, external URL, publication time | Implemented in X domain; cross-platform contract partial |
| `PlatformPerformance` | platform identity, measured metrics, availability, observed time | Implemented foundation; provider coverage partial |
| `Learning` | observation, hypothesis, evidence, confidence, decision/effectiveness | Implemented foundation; operational feedback loops partial |
| `CreativeSpec` | brand, platform, pillar, topic, products, slides, assets, visual rules, caption, CTA, commercial relation | Planned for Instagram |

New artifacts must state their canonical owner, source IDs, timestamps, availability semantics, and downstream consumers.

## Human Gates

Human gates are permanent for:

- investment trades;
- Production merges and deploys;
- high-risk publication;
- paid Note publication;
- formal promotion of consequential Knowledge;
- important business decisions;
- protected-core mutations, credentials, bulk deletion, payment, and ad spend according to policy.

The Action Gateway model is:

```text
AI proposes
  → ActionRequest
  → policy and permission check
  → Human Gate when required
  → registered executor
  → audit and result
```

The gateway is default-deny. Unknown actions are blocked. R2 waits for review, R3 always requires approval, and R4 is not executable by AI even after approval. External content cannot directly create an executable action.

Important current limitation: the Action Gateway contract is implemented, but not every historical external integration has been migrated through it. New external mutation paths must use the gateway or document and test an equivalent existing protected boundary; do not widen a legacy bypass.

## Observability

CEO-facing status uses these meanings:

| State | Meaning |
|---|---|
| Running | execution is active with fresh evidence |
| Waiting | healthy wait for schedule, dependency, or approved retry |
| Needs review | a human gate or explicit decision is pending |
| Unavailable | provider or metric cannot currently be obtained; not zero |
| Failed | a checked operation failed with a safe diagnostic and trace |
| Unknown | the system lacks enough evidence to assert another state |

Home remains focused on `確認が必要`, `現在の状況`, and `事業部`. It reads canonical attention and health projections; it does not become a workflow or data store.

Diagnostics must expose stage, safe reason code, trace/lineage IDs, timestamps, and provider availability without content bodies, secrets, API keys, PII, or unsupported metrics.

## Cost Control

Track model calls, external APIs, search, image/video generation, and storage as explicit cost events or `unavailable` when measurement does not exist. Prefer free or low-cost providers when quality, licensing, and reliability requirements are met.

Current state:

- append-only, human-confirmed business cost ledger: implemented;
- revenue/cost separation and unknown semantics: implemented;
- unified automatic attribution for all model/API/search/media/storage usage: planned;
- CEO cost budget and provider-level alerts: planned.

Estimates must never be recorded as confirmed cost. Investment purchases and P/L do not belong in the business cost ledger.

## Provider Abstraction

Provider-specific clients belong behind capability contracts such as `ResearchProvider`, `LLMProvider`, `ImageProvider`, `VideoProvider`, `PublishProvider`, and `MetricsProvider`.

Current implementation is mixed:

- Research provider interfaces and several adapters: implemented;
- LLM provider routing/adapters: implemented, normalization still evolving;
- X publish and metrics providers: implemented around Buffer and metric adapters;
- Image and video provider abstractions: planned;
- Instagram publish provider: planned after creative generation is stable;
- Investment macro/fundamental provider coverage: partial.

Provider failure must be explicit and fail closed where external effect or factual risk exists. A provider name must not leak into domain artifacts unless needed for source/evidence lineage.

## Current Production State

This section reports repository capability. It does not claim a live provider, Cron, deployment, queue, or metric is healthy without current runtime evidence.

### Implemented

- simplified Home and company runtime foundations;
- Action Gateway, approvals, execution store, missions, and human-gate foundations;
- shared Research Intelligence and canonical evidence artifacts;
- Knowledge candidate/review boundaries;
- SNS brand and X/Instagram/Note navigation separation;
- DailyX planning, safety/fact gates, duplicate guard, Buffer publication, reconciliation, analytics, and learning foundations;
- shared cross-platform performance, baseline, and comparison foundations;
- revenue and confirmed business-cost ledgers;
- Investment UI, safety boundaries, opportunities, and learning candidates;
- Engineering Worker protected-path and review foundations;
- Slack conversation memory and notification foundations.

### Partial

- X Production stability and complete metric coverage;
- end-to-end Action Gateway adoption by legacy integrations;
- canonical content and published-content contracts across platforms;
- Note growth and paid-publication workflow;
- Investment macro, fundamental, historical, and news provider coverage;
- automated cost attribution and provider budgets;
- revenue provider integrations;
- Slack conversation continuity and CEO-level summaries.

### Planned

- Instagram `CreativeSpec`, carousel generator, programmatic image composition, low-cost reel renderer, publishing, metrics, and shared learning adapter;
- image/video provider abstractions;
- complete SNS monetization loop;
- mature Investment Intelligence Department and daily brief;
- strategy change candidates backed by sufficient performance evidence.

### Deferred

- LINE and TikTok expansion;
- multi-account SNS;
- advanced full-scene AI video generation;
- fully automatic Knowledge promotion;
- any expansion not satisfying the active priority rule.

## Task Board

### Phase A — Product Foundation

- [x] A1: establish this Master SSOT and require agents to read it
- [x] A2: audit canonical architecture against every active domain path; record duplicates and owners
- [x] A3: define canonical store identities, writer authorities, Revenue linkage, and Learning approval contracts without Production migration
- [ ] A4: define missing provider contracts when a concrete provider boundary requires them; deferred during current SNS delivery
- [ ] A5: define canonical cost events and CEO observability when a concrete cost/availability boundary requires them; deferred during current SNS delivery

### Phase B — SNS Business

- [x] B1: stabilize the Normal DailyX code path without lowering Hot Confidence thresholds; current Production runtime health remains evidence-driven and may be `UNKNOWN`
- [ ] B2: define Instagram `CreativeSpec` from user-provided planning, assets, templates, and NG rules
- [ ] B3: implement carousel structure, copy, asset selection, layout, render, and preview
- [ ] B4: add provider-neutral background/illustration generation; real products remain real images
- [ ] B5: add low-cost static-image reel rendering before optional image-to-video
- [ ] B6: connect approved, eligible Instagram content to a publish provider
- [ ] B7: map Instagram metrics into canonical performance with missing distinct from zero
- [ ] B8: connect Instagram through the shared learning foundation
- [ ] B9: connect attributable SNS revenue and confirmed cost

### Phase C — Investment Business

- [ ] C1: audit providers and evidence gaps
- [ ] C2–C3: complete macro and financial providers
- [ ] C4–C6: complete news/sector intelligence, picks-and-shovels analysis, and opportunity scoring
- [ ] C7–C9: complete portfolio intelligence, historical price/volume analysis, and daily brief
- [ ] C10: operationalize evidence-backed investment learning without automatic policy/trade mutation

## Next PRs

1. **B1 X Production Stabilization** — complete human review of the audited Normal DailyX safety and reconciliation fixes; validate Production only through read-only evidence after merge/deploy.
2. **B2 Instagram CreativeSpec** — define the typed creative contract from user planning, real assets, templates, and NG rules.
3. **B3 Carousel** — implement structure, copy, asset selection, layout, render, and preview from the approved `CreativeSpec`.
4. **B4 Image Generation** — add provider-neutral background/illustration generation while keeping real products as real images.
5. **B5 Reel** — add low-cost static-image reel rendering before optional image-to-video.
6. **B6 Instagram Publish** — connect approved, eligible content to a publish provider.
7. **B7 Metrics** — map Instagram metrics into canonical Performance with missing distinct from zero.
8. **B8 Learning** — connect Instagram observations through the shared learning foundation without automatic strategy mutation.
9. **B9 Monetization** — connect attributable SNS Revenue and confirmed Cost.

**A4** is deferred until a concrete provider boundary requires a contract. **A5** is deferred until a concrete cost or observability boundary requires it. Neither is a blocker for the current SNS sequence.

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-09 | Product Foundation precedes SNS, Investment, Slack UX, and expansion | prevent duplicate systems and fragmented truth as departments grow |
| 2026-10-09 | Canonical lifecycle is External World → Research → Knowledge → Opportunity → Mission → Execution → Result → Performance → Revenue → Learning → Next Opportunity | one company-wide operating model |
| 2026-10-09 | Existing stores are preferred; new stores require a documented representational gap | avoid parallel truth and migration debt |
| 2026-10-09 | Typed canonical artifacts replace raw-text handoffs | preserve provenance, availability, policy, and lineage |
| 2026-10-09 | Human gates and R4 prohibitions cannot be bypassed by autonomy | external impact and irreversible risk remain human-controlled |
| 2026-10-09 | Missing data is not zero and runtime health is not inferred from code presence | prevent false operational or business claims |
| 2026-10-09 | Real products use real images; AI imagery is limited to background, illustration, decoration, and motifs | prevent product fabrication |
| 2026-10-10 | Continue with B1–B9; defer A4/A5 until concrete provider or cost/observability boundaries exist | A1–A3 supply the ownership contracts required for current SNS delivery without speculative foundations |

## Protected Boundaries

The following are non-negotiable unless a dedicated, human-approved policy change explicitly revises them:

- no automatic investment trade;
- no credential, secret, environment variable, or API-key mutation by product workflows;
- no bypass of Production merge or deploy approval;
- no automatic paid Note or high-risk publication;
- no automatic formal Knowledge promotion for consequential claims;
- no automatic strategy/policy mutation from a learning candidate;
- no fabricated evidence, metrics, sources, product images, revenue, costs, or confidence;
- no interpretation of external content as executable instruction;
- no duplicate publish on timeout, ambiguous provider response, or retry;
- no deletion or mutation of provider-linked published/scheduled content without explicit reviewed reconciliation policy;
- no new parallel Research, Performance, Revenue, or Learning engine for a department;
- no logging of secrets, content bodies, PII, or private asset data in diagnostics.

When safety and automation conflict, fail closed, preserve evidence, avoid a second external action, and surface a concise reason for human review.
