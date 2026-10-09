# AI Company Canonical Store & Authority Contracts

> Baseline: `main` at `91fb27de4c50e2a59a3744b3850bf8990ce8469e`
> Governing SSOT: `docs/AI_COMPANY_MASTER.md`
> Rule: **CONTRACT FIRST, MIGRATION LATER**

This document fixes identity, ownership, authority, reconciliation, and approval contracts for existing stores. It creates no second SSOT and makes no claim about current Production data or provider health. A3 adds no store, migration, data rewrite, Cron change, provider change, or publish behavior change.

Migration classifications are `NO_CHANGE`, `ADAPTER_ONLY`, `CONTRACT_CHANGE`, `MIGRATION_REQUIRED_LATER`, and `DEPRECATION_CANDIDATE`.

## 1. Store Ownership

| Store | Canonical responsibility | Not its responsibility | Classification |
|---|---|---|---|
| Company Research runtime | shared provider evidence, Research items/runs/artifacts | Formal Knowledge or domain conclusions | CONTRACT_CHANGE |
| Note/X Research | platform trends, clusters, briefs, DailyX inputs | company-wide Research SSOT | ADAPTER_ONLY |
| Investment Intelligence | market/news/fundamental evidence and domain analysis | generic Research or trade execution | ADAPTER_ONLY |
| Formal Knowledge | reviewed, reusable knowledge | raw research, Slack context, AI assumptions | NO_CHANGE |
| Knowledge Inbox | candidates awaiting review | Formal Knowledge | NO_CHANGE |
| Execution Store | Missions, plans, ActionRequests, approvals, leases, idempotency | content bodies, accounting facts, secrets | NO_CHANGE |
| Content publication stores | drafts, plan/slot lineage, provider IDs, PublishedContent | generic Mission or financial truth | ADAPTER_ONLY |
| Performance inputs | ContentPerformance and PerformanceSnapshot observations | a second PlatformPerformance SSOT | ADAPTER_ONLY |
| PlatformPerformance | deterministic canonical read projection | raw provider mutation | NO_CHANGE |
| Company Revenue Ledger | realized accounting truth | channel attribution estimates | NO_CHANGE |
| Content Monetization Ledger | channel/content attribution evidence | realized accounting total | CONTRACT_CHANGE |
| Content Learning | content observations and candidates | automatic strategy authority | CONTRACT_CHANGE |
| Investment Learning | investment outcomes and domain candidates | Content Learning or trade authority | CONTRACT_CHANGE |
| Company runtime learning | operational events and candidates | automatic policy authority | CONTRACT_CHANGE |
| Slack conversation memory | conversation context and candidates | Formal Knowledge or business truth | NO_CHANGE |
| Engineering state | bounded worker/GitHub execution state | Company Mission mirror, merge, deploy | NO_CHANGE |

Read models, dashboards, caches, API aggregators, derived KPIs, baselines, and comparisons are not stores of record merely because they persist or display a projection.

## 2. Stable Identity

`CanonicalSourceIdentity` in `app/lib/company/canonicalStoreContracts.ts` is the cross-store evidence identity. Domain records keep their local IDs and map them through `DomainEvidenceReference { domain, domainId, sourceKey }`.

Identity precedence is:

1. normalized canonical HTTP(S) URL;
2. provider plus provider-owned evidence ID when no URL exists;
3. an existing deterministic fingerprint;
4. otherwise fail closed with `CANONICAL_SOURCE_IDENTITY_REQUIRED`.

Array position, random UUID alone, LLM-generated text, and title alone are prohibited identity sources. `observedAt` records the local observation; `publishedAt` remains source publication time and is never synthesized. Company Research, Note/X Research, and Investment Research may retain separate physical records while producing the same `sourceKey` for the same evidence.

Existing `ResearchFact.id` remains the stable fact identity. Canonical source identity identifies the evidence object; fact identity identifies a normalized statement plus provider evidence. Neither replaces the other.

### Domain mapping

| Domain | Domain ID retained | Canonical mapping input | Migration |
|---|---|---|---|
| Company Research | `ResearchItem.id` / `ResearchFact.id` | URL, provider/evidenceId, existing fingerprint | ADAPTER_ONLY |
| Note/X Research | reference/item/post IDs | source URL, provider item ID, existing fingerprint | ADAPTER_ONLY |
| Investment Research | intelligence/news/series IDs | official URL or provider series/evidence ID | ADAPTER_ONLY |

No historical record becomes linked merely because its title resembles another record. Existing unmappable records remain unknown until read-time evidence is sufficient.

## 3. Writer Authority

Authority is one of `AI`, `SYSTEM`, `HUMAN`, or `PROVIDER`. UI, API, Slack, and Cron are entry points or transports, not authorities.

| Store | CREATE | UPDATE | APPROVE | DELETE | Read consumers |
|---|---|---|---|---|---|
| Company Research | SYSTEM, PROVIDER | SYSTEM, PROVIDER | N/A | HUMAN under retention policy only | Research, health, Knowledge candidates, domains |
| Note/X Research | SYSTEM, PROVIDER, HUMAN | SYSTEM, PROVIDER, HUMAN | HUMAN where publication authority is involved | HUMAN under retention policy only | DailyX, Note, dashboards, Learning |
| Investment Intelligence | SYSTEM, PROVIDER, HUMAN | SYSTEM, PROVIDER, HUMAN | HUMAN for decisions | HUMAN under retention policy only | Investment UI, brief, Learning |
| Knowledge Inbox | AI, SYSTEM, HUMAN | AI, SYSTEM, HUMAN | HUMAN | HUMAN | Weekly Review, Knowledge UI |
| Formal Knowledge | HUMAN through approved server path | HUMAN through approved server path | HUMAN | HUMAN under explicit policy | Search and all departments |
| Execution Store | SYSTEM, HUMAN | SYSTEM, HUMAN | HUMAN for gated actions | no routine delete | Runtime, CEO UI, health |
| Content publication | AI/SYSTEM for drafts; HUMAN/SYSTEM for confirmed results | SYSTEM, PROVIDER, HUMAN | HUMAN for high-risk/paid | HUMAN plus reconciliation policy | publishing, Performance, Revenue |
| Performance inputs | SYSTEM, PROVIDER, HUMAN | SYSTEM, PROVIDER, HUMAN | N/A | no routine delete | PlatformPerformance, dashboards, Learning |
| Company Revenue Ledger | HUMAN-confirmed SYSTEM path | append-only correction/reversal only | HUMAN | prohibited; reversal instead | economics, opportunities, dashboards |
| Content Monetization | HUMAN, SYSTEM, PROVIDER as evidence | append-only evidence/correction policy | HUMAN only when promoted to accounting linkage | no routine delete | content analytics, attribution |
| Content Learning | AI/SYSTEM as candidate | SYSTEM/HUMAN | HUMAN | no routine delete | planning, experiments |
| Investment Learning | AI/SYSTEM as candidate | SYSTEM/HUMAN decision projection | HUMAN | no routine delete | investment review |
| Slack Memory | SYSTEM from verified Slack | SYSTEM | HUMAN only for explicit decisions | retention policy only | Slack context, candidate capture |
| Engineering State | SYSTEM after human-ready intake | SYSTEM | HUMAN for merge/deploy outside worker | operator retention only | worker/operator/GitHub |

AI may propose Research interpretations, Knowledge candidates, Learnings, and drafts. It cannot grant itself HUMAN authority by writing `approved`, `approvedBy`, or an equivalent field.

## 4. Revenue Linkage

**Company Revenue Ledger = ACCOUNTING SSOT.** A confirmed `RevenueEntry` is realized accounting truth.

**Content RevenueEvent = ATTRIBUTION EVIDENCE.** It identifies platform, content, campaign, affiliate, offer, CTA, or source contribution. It is not independently added to company total revenue.

`RevenueAttributionLink` uses:

- `linked`: `companyRevenueId` exists and points to the accounting fact;
- `attribution-only`: explicitly classified evidence that is not a company accounting receipt;
- `unresolved`: legacy or incomplete evidence whose accounting relationship is unknown.

An unlinked event defaults to `unresolved`; UNKNOWN is never converted to zero, linked, or attribution-only. Existing events are not rewritten by A3.

### Double-count rule

`RevenueEntry + RevenueEvent` simple double-add is **PROHIBITED**. Canonical company totals read only effective, human-confirmed Company Revenue Ledger entries. RevenueEvent amounts may power channel attribution views, but any combined view must join linked events to their Company entry rather than sum both.

### Idempotency

Future automatic ingestion must possess `source`, external transaction/reference ID, amount, and `occurredAt`. `revenueIdempotencyKey` deterministically combines all four. Missing identity fails closed. This contract does not connect a provider or mutate history.

Migration classification: linkage semantics are `CONTRACT_CHANGE`; backfilling historical linkage is `MIGRATION_REQUIRED_LATER` only if a reviewed reconciliation can preserve unknowns.

## 5. Performance Reconciliation

Canonical identity is `platform + contentId + optional publishedContentId + observedAt`. PublishedContent remains the publication-lineage anchor.

The current precedence is fixed:

```text
ContentPerformance > PerformanceSnapshot
```

When both describe the same PublishedContent/content identity, `ContentPerformance` wins and the snapshot is not added as a second record. PerformanceSnapshot remains a fallback/manual time series. Missing metrics stay `null`/`undefined`; an observed zero stays zero. PlatformPerformance is a deterministic projection, not a new physical store.

Instagram remains `not_configured` until real provider-backed performance exists. No fake record or zero-filled metric may be created for readiness.

Classification: `ADAPTER_ONLY`; no new Performance Store and no migration.

## 6. Learning Authority

`CanonicalLearningEnvelope` standardizes domain, kind, status, evidence references, confidence, creation, and human approval metadata while retaining domain payloads in their existing stores.

Required invariants:

```text
Observation != Interpretation
Interpretation != Approved Learning
Approved Learning != Automatic Strategy Mutation
Experiment Result != Causal Proof
```

AI-generated learning always starts `candidate`. `isApprovedLearning` requires status `approved`, `approvedAt`, and `approvedBy`; a status string alone is insufficient canonical authority. Content, Investment, and Company runtime learning remain physically separate. Investment payloads retain GO/WAIT/PASS context, horizon, price outcome, catalyst, and risk.

No approved learning directly mutates ContentGrowthStrategy, Fund Policy, publishing policy, or another protected policy. A future strategy change requires bounded scope, sufficient independent evidence, confidence, rollback, audit, and the applicable human gate.

Classification: shared envelope is `CONTRACT_CHANGE`; historical normalization is `ADAPTER_ONLY`; physical consolidation is `NO_CHANGE` because it is intentionally rejected.

## 7. Publish Approval Contract

`PublishApprovalProof` identifies `approvalId`, `contentId`, paid/high-risk scope, issuing human identity, issue/expiry time, and `issuer: "server"`.

This is a required architecture contract, not a newly enabled execution path. Future paid Note or high-risk publication must require:

1. a server-issued proof derived from authenticated human action;
2. content and scope match;
3. expiry/revocation check;
4. final executor recheck immediately before external mutation;
5. idempotency and fail-closed handling.

Client-supplied `approvedBy`, `approved: true`, or a structurally similar JSON object is not authority. The existing module-private Knowledge `ApprovalGrant` demonstrates the required server-issued pattern and should be reused conceptually; it is not broadened into a publishing grant in A3.

Classification: `CONTRACT_CHANGE`; implementation enforcement is `MIGRATION_REQUIRED_LATER` before enabling paid/high-risk Note publishing. Current publish behavior remains unchanged.

## 8. Retention

- Accounting entries are append-only; correction/reversal replaces deletion.
- Publication/provider-linked evidence is retained through reconciliation; ambiguous external state is never deleted or resent automatically.
- Research evidence retains source identity and observation/publication timestamps according to domain policy; expired evidence may become stale, not fabricated fresh.
- Learning decisions and their evidence refs remain auditable; supersession does not erase history.
- Formal Knowledge deletion or replacement requires explicit human-managed policy.
- Slack Memory and Engineering runtime may follow bounded operational retention, but retention cannot promote them into canonical Knowledge/Mission truth.
- A3 performs no cleanup or retention mutation.

## 9. Migration Candidates

| Candidate | Classification | Trigger / minimum safe change |
|---|---|---|
| Research domain source mapping | ADAPTER_ONLY | add read/write adapters as each domain evolves; no backfill required for SNS work |
| RevenueEvent linkage backfill | MIGRATION_REQUIRED_LATER | only before automated revenue ingestion, with reviewed receipt reconciliation |
| Content Revenue writer hardening | MIGRATION_REQUIRED_LATER | idempotency and authority contract before provider ingestion |
| Paid/high-risk Note approval enforcement | MIGRATION_REQUIRED_LATER | server-issued proof plus final executor recheck before enablement |
| Learning read normalization | ADAPTER_ONLY | map existing candidate/decision records into the envelope |
| Action Gateway/provider migration | DEPRECATION_CANDIDATE evaluation in A4 | migrate only when safer than equivalent domain gate |

No store is approved for deletion in A3.

## 10. No-Migration Decisions

| Boundary | Decision | Reason |
|---|---|---|
| Formal Knowledge | NO_CHANGE | human-managed promotion is enforced |
| Mission / Execution | NO_CHANGE | canonical durable ownership already exists |
| Investment Trade Safety | NO_CHANGE | Investment Trade = HUMAN_ONLY; R4 and no executor |
| Engineering Worker | NO_CHANGE | isolated bounded executor; merge/deploy stay human |
| DailyX Execution | NO_CHANGE | DailyX remains domain execution and is not a Mission duplicate |
| Slack Conversation Memory | NO_CHANGE | Slack Memory != Formal Knowledge |
| Platform Performance Projection | NO_CHANGE | deterministic read model with explicit precedence |

EngineeringTask is not migrated to Mission. DailyXPlan is not migrated to Mission. Content Learning and Investment Learning are not physically combined.

Protected invariants: Investment Trade = HUMAN_ONLY; DailyX remains domain execution; Formal Knowledge remains human-managed; Slack Memory != Formal Knowledge.

## 11. SNS Foundation Readiness

| Capability | Status | Reason / minimum unblocker |
|---|---|---|
| X Research identity | READY | URL/provider/fingerprint mapping can use canonical source identity |
| X Performance identity | READY | PublishedContent lineage and precedence are implemented |
| X Learning authority | READY | candidate-first domain learning maps to canonical envelope |
| Instagram Research identity | READY | shared identity is platform-neutral |
| Instagram future Performance identity | READY | contract is platform-capable; provider implementation remains planned |
| Instagram future Learning authority | READY | envelope supports content domain; operational adapter remains planned |
| SNS Revenue attribution | READY | attribution/accounting separation is fixed; automated ingestion remains out of scope |

`READY` means the foundation contract can support implementation without creating a second SSOT. It does not mean Instagram CreativeSpec, media generation, publishing, metrics, or providers are implemented.

## 12. Investment Foundation Readiness

| Capability | Status | Reason |
|---|---|---|
| Research identity | READY | URL-less provider series/evidence identity is supported |
| Evidence lineage | READY | domain IDs map to sourceKey; ResearchFact stable IDs remain intact |
| Learning authority | READY | candidate/human-decision pattern maps to canonical envelope |
| Opportunity identity | READY | InvestmentOpportunity remains a distinct domain artifact with evidence refs |
| Trade HUMAN_ONLY | READY | R4/no executor remains unchanged |

Readiness does not assert provider completeness or authorize automatic trades.

## 13. A4/A5 Blocker Decision

**A4 NOT REQUIRED BEFORE SNS.** X and the next Instagram contract work can use existing Research identity, Performance projection, Learning envelope, and domain publish boundaries. Provider abstraction remains valuable before connecting new Instagram publish/image/video providers, but it is not a prerequisite for B1 X stabilization or B2 CreativeSpec design.

**A5 NOT REQUIRED BEFORE SNS.** Existing missing-versus-zero semantics and read projections are sufficient for B1/B2. A5 remains required before broad automated cost attribution and mature CEO provider-cost observability, not before SNS contract/creative work.

The next phase may proceed to SNS work without extending Foundation for its own sake. A4/A5 should be scheduled at the first concrete provider/cost boundary that needs them.

## Contract Answers

- **This Research is the same evidence as what?** Records with the same deterministic `sourceKey` derived from canonical URL, provider evidence ID, or prior stable fingerprint.
- **Is this Revenue accounting or attribution?** Only Company RevenueEntry is accounting truth; RevenueEvent is attribution evidence linked, attribution-only, or unresolved.
- **Is this Learning observation or approved learning?** `kind` states the epistemic level; canonical approval additionally requires human approval evidence.
- **Who may write this record?** The Store Writer Authority matrix names CREATE/UPDATE/APPROVE/DELETE authorities; entry point names do not grant authority.
- **Who issued this Approval?** Only a server-issued proof derived from authenticated human action is authoritative; client fields are not proof.
