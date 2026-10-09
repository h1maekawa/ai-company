# AI Company Canonical Architecture Audit

> Audit baseline: `main` at `1792725524aff8508dfdf13a3a3a510104f80298`
> Audited: 2026-10-09 (Asia/Tokyo)
> Governing SSOT: `docs/AI_COMPANY_MASTER.md`
> Rule: **AUDIT FIRST, FIX LATER**

This document is the detailed architecture audit supporting the Master SSOT. It records repository evidence only. It does not assert Production health, provider availability, current configuration, or data quality. `UNKNOWN` means the repository cannot prove the state.

No runtime implementation, store, schema, provider, Cron, secret, environment variable, Production data, publishing behavior, or Engineering Worker behavior was changed by this audit.

## 1. Canonical Lifecycle Matrix

| Lifecycle | Canonical Owner | Current Implementations | Domain Adapter / Legacy | Duplicate Risk | Status |
|---|---|---|---|---|---|
| Research | Company Research Platform and `CanonicalResearchArtifact` | `app/lib/company/research/*`; canonical artifacts are persisted in Execution Store runtime | Note research pipeline/store and Investment intelligence research are domain adapters with their own evidence shapes | Same source can exist in Company runtime and Note/Investment Vault stores without one cross-store identity | DUPLICATE_RISK |
| Knowledge | Formal files under `memory/knowledge/*`, guarded by Knowledge lifecycle/write policy and indexed by Knowledge Index | `app/lib/knowledge/*`, `app/lib/memory/knowledge.ts`, Supabase index repository | Inbox captures and Slack conversation memory are candidates/context, not formal Knowledge | No second formal owner found; candidate/context naming can be mistaken for Knowledge | CANONICAL |
| Opportunity | Domain-owned typed candidates; Company Revenue Opportunity for business and Investment Opportunity for securities analysis | `app/lib/company/opportunity/*`, `app/lib/investing/intelligence/*` | Creator demand/ranking enriches Revenue Opportunity; Investment remains separate domain semantics | Name overlap, but no evidence that the two stores claim the same fact | PARTIAL |
| Mission | `ExecutionState.missions` / `ExecutionMission` | `app/lib/company/execution/mission.ts`, `service.ts`, durable Execution Store | Daily planning tasks, DailyX plans, content plans, and Engineering tasks are domain schedules/work items, not canonical Mission truth | Legacy `PersonalMission` is extended by `ExecutionMission`; no independent persistent mission writer found | CANONICAL |
| Execution | Durable Execution Store plus Action Gateway for registered Company actions | `app/lib/company/execution/*`, Company runtime | DailyX, Note publishing, Knowledge, Slack, and Engineering use equivalent protected domain paths or legacy direct integrations | Gateway does not mediate all external mutations | PARTIAL |
| Result | Result remains domain-owned with canonical lineage references | Mission completion/history, PublishedContent, research artifacts/runs, Investment decisions, Engineering audit/PR | No common Result store; domain results are intentionally different | Ambiguous ownership for cross-domain Result projection and result IDs | PARTIAL |
| Performance | Canonical read model is `PlatformPerformanceProjection` | `app/lib/content/platform-intelligence/*` | `ContentPerformance` is primary adapter input; `PerformanceSnapshot` is fallback input; X Dashboard is a projection | Multiple writers and two metric representations can diverge outside the canonical adapter | DUPLICATE_RISK |
| Revenue | Company Revenue Ledger (`memory/personal/revenue/ledger.md`) | `app/lib/company/revenueStore.ts` | Content Monetization Ledger is channel attribution evidence; dashboards are projections | An unlinked `RevenueEvent` and a RevenueEntry can represent the same receipt and be summed separately | DUPLICATE_RISK |
| Learning | Candidate/decision stores remain domain-owned; shared platform analysis supplies canonical comparison primitives | Content Learning, Platform Intelligence experiments, Investment Learning, DailyGrowthReview, Company runtime learning | Growth reviews and investment/content candidates are adapters, not automatically effective policy | Multiple engines can create interpretations; approval semantics are not one shared contract | DUPLICATE_RISK |

The lifecycle is a company-wide contract, not a requirement to merge all domain semantics into one physical store. In particular, Business Opportunity and Investment Opportunity, DailyX execution and Company Mission execution, and Content Learning and Investment Learning should share lineage/approval contracts without being forced into identical schemas.

## 2. Component Classification

| Component | Classification | Architecture status | Evidence and decision |
|---|---|---|---|
| Company Research Platform | KEEP | CANONICAL | `company/research/types.ts`, `platform.ts`, and `intelligence/service.ts` define provider evidence and canonical artifacts |
| Note Research pipeline/store | KEEP_AS_ADAPTER | ADAPTER | owns X/Note trend, cluster, brief, and draft inputs; needs explicit mapping to canonical evidence identity |
| Investment intelligence research | KEEP_AS_ADAPTER | ADAPTER | market/news/fundamental evidence has domain-required fields and must remain fail-closed |
| Formal Knowledge lifecycle | KEEP | CANONICAL | `knowledge/lifecycle.ts` and `writePolicy.ts` separate Inbox from Human Managed Knowledge |
| Slack conversation memory | KEEP_AS_ADAPTER | ADAPTER | conversation context and candidate source only; never Formal Knowledge |
| Company Revenue Opportunity | KEEP | CANONICAL | business opportunity SSOT with evidence, coverage, lifecycle, and revenue linkage |
| Investment Opportunity | KEEP_AS_ADAPTER | ADAPTER | security-analysis semantics; not the same object as a business revenue opportunity |
| Execution Mission | KEEP | CANONICAL | only canonical Mission status/history in durable Execution Store |
| Planning `PlanTask` / ContentPlan / DailyXPlan | KEEP_AS_ADAPTER | ADAPTER | schedules and domain plans, not independent Mission truth |
| EngineeringTask state | KEEP_AS_ADAPTER | ADAPTER | isolated Engineering runtime with GitHub/PR lifecycle; not a Company Mission mirror |
| Action Gateway | KEEP | CANONICAL | default-deny Company action contract; only internal executors are registered |
| Direct X/Note publishing paths | MIGRATE_LATER | LEGACY | protected domain integrations exist outside Action Gateway; behavior must not change in A2 |
| PublishedContent | KEEP | CANONICAL | formal content result/lineage contract for X and Note; cross-platform coverage remains partial |
| PlatformPerformanceProjection | KEEP | CANONICAL | read model prevents snapshot double-count when primary ContentPerformance exists |
| ContentPerformance | KEEP_AS_ADAPTER | ADAPTER | provider-normalized X/Note primary performance input |
| PerformanceSnapshot | KEEP_AS_ADAPTER | ADAPTER | manual/import/API time-series fallback tied to PublishedContent |
| Company Revenue Ledger | KEEP | CANONICAL | append-only accounting SSOT with confirmation and correction/reversal semantics |
| Content Monetization Ledger | KEEP_AS_ADAPTER | DUPLICATE_RISK | attribution evidence; must reference Company Revenue ID when accounting fact exists |
| Content Learning store | KEEP_AS_ADAPTER | PARTIAL | candidate/approved state exists, but shared effective-learning contract is incomplete |
| Investment Learning store | KEEP_AS_ADAPTER | ADAPTER | domain horizon/outcome semantics and explicit human decision |
| DailyGrowthReview / ContentGrowthStrategy | MIGRATE_LATER | DUPLICATE_RISK | useful observations/strategy candidates, but authority relative to approved Learning is not singular |
| Home, dashboards, API aggregators, caches | KEEP_AS_ADAPTER | ADAPTER | read projections only; not duplicates unless they write back as truth |

No component is marked `DEPRECATE_LATER` in A2. Evidence is insufficient to justify deletion before the A3 store and migration audit.

## 3. Store Inventory

| Store | Owns | Persistence | Writers | Readers | Canonical? | Action |
|---|---|---|---|---|---|---|
| Company Research runtime | Company Research items, runs, canonical artifacts | Durable Execution Store runtime | Research API/service, department research Cron | Research APIs, health, organization views | Yes for shared Research | KEEP; define cross-store identity in A3 |
| Note Research Store | references, inbox, clusters, briefs, drafts, history, metrics, DailyX plans/reviews | Vault Markdown/JSON under `memory/personal/note` | research Cron/APIs, DailyX, Slack actions, provider sync, human UI | X/Note automation, dashboards, learning | Domain adapter | KEEP_AS_ADAPTER |
| Investment Intelligence Store | daily intelligence, theme history, human decisions | Vault JSON under `memory/personal/fund` | investment scan Cron/provider sync, human decision API | Investment UI/brief/learning | Domain adapter | KEEP_AS_ADAPTER |
| Formal Knowledge | reviewed reusable Knowledge | Vault `memory/knowledge/*`; searchable index projection | promote/merge route through server-issued approval grant | Knowledge search, Research, Creator/Investment consumers | Yes | KEEP |
| Knowledge Inbox | raw capture and candidates | Vault `memory/personal/inbox/*` | capture API, workflows, AI organizer | Weekly Review, candidate UI | No; staging | KEEP_AS_ADAPTER |
| Slack Memory | conversation raw/summary, explicit decisions, task candidates | Vault AI-managed paths plus Execution Store job state | signed Slack events/actions and background memory job | Slack conversation, Morning Brief, Knowledge capture | No; context | KEEP_AS_ADAPTER |
| Execution Store | missions, plans, actions, approvals, runtime coordination, idempotency | durable production store; local development fallback | authenticated APIs, Company runtime/Cron, Slack approval, internal agents | Company runtime/UI/health and domain coordination | Yes | KEEP |
| Content Core | materials and content candidates | Vault `content-core.md` | Content APIs/providers/human UI | Note/X studios and conversion workflows | Domain canonical | KEEP_AS_ADAPTER |
| Content publication store | SocialDraft, Note queue, publishing history, PublishedContent | Vault Note research files | DailyX/Note APIs, Buffer reconciliation/provider sync, human UI | publishing, dashboards, metrics, revenue attribution | Domain canonical | KEEP |
| Performance file | ContentPerformance and PerformanceSnapshot | Vault `content-performance.md` | manual/API routes, X sync, Note metrics sync | platform adapter, dashboards, learning | Inputs to canonical read model | KEEP_AS_ADAPTER; writer ownership audit in A3 |
| PlatformPerformance | derived normalized records, baselines, comparisons | no independent store | deterministic adapter only | dashboards and shared learning | Canonical read model | KEEP |
| Company Revenue Ledger | confirmed business revenue/corrections/reversals | append-only Vault ledger | Company Revenue API/human-confirmed integrations | Company economics, opportunities, dashboards, learning | Yes | KEEP |
| Content Monetization Ledger | conversion and revenue attribution evidence | Vault `monetization-ledger.md` | Content Revenue API/manual/import/formal API | Content analytics and Platform adapter | No | KEEP_AS_ADAPTER; require linkage rules |
| Business Cost Ledger | confirmed business direct costs | append-only Vault ledger | human-confirmed Company cost routes | economics/opportunity projections | Yes for business cost | KEEP |
| Content Learning | content observations, recommendations, plans | Vault Note learning files | Learning API/engine and human decisions | Content planning/experiments | Domain adapter | KEEP_AS_ADAPTER |
| Investment Learning | decision reviews, outcome observations, learning decisions | append-only Vault files | Fund APIs/provider observations/human decision | Investment review/brief | Domain adapter | KEEP_AS_ADAPTER |
| Engineering State | Engineering task, lease, heartbeat, audits | isolated local worker state/artifacts plus GitHub | Engineering Worker and approved intake paths | worker/status UI/operator | Domain runtime | KEEP_AS_ADAPTER |

### Store rule conclusions

- Slack Memory is **Conversation Context**, not Formal Knowledge.
- Dashboard, Home attention, System Map, API aggregators, caches, baselines, comparisons, and derived KPI objects are projections and are not duplicate stores by themselves.
- The Execution Store holds handoff metadata, not formal content bodies, accounting entries, or provider secrets.
- A3 must document path, retention, versioning, writer authority, and linkage for every store above before proposing any migration.

## 4. Writer / Reader Audit

| Area | Authorized writers found | Main readers | Writer conclusion |
|---|---|---|---|
| Research | department research Cron, interactive Research API, provider adapters, Note research Cron/API, investment scan | Research UI, DailyX, Investment, health, Knowledge capture | Multiple legitimate domain writers; canonical identity across stores is missing |
| Knowledge Inbox | same-origin capture API, workflows, Slack promotion adapter, AI organizer | Weekly Review and Knowledge UI | AI can create candidates only |
| Formal Knowledge | `/api/knowledge/promote` and merge path through internally issued ApprovalGrant | search/index and departments | Human-managed write boundary is structurally enforced; request-to-human identity depends on authenticated UI perimeter |
| Execution | Company Mission APIs, runtime Cron, internal agents, Slack approval path | Company UI, health, autonomous runtime | CAS/lease/idempotency protections are canonical |
| Content | DailyX Cron, content/publishing APIs, signed Slack actions, Buffer/metrics reconciliation, human UI | X/Note UI, Performance/Learning | Broad writer set; all modify domain content state rather than Mission truth |
| Performance | X sync Cron, analytics/manual endpoints, Note provider sync, human import | canonical adapter, dashboards, learning | Multiple writers share one file; needs an ownership/update policy |
| Revenue | Company Revenue API writes accounting ledger; Content Revenue API writes attribution ledger | company economics and content analytics | Two write paths are intentional but linkage is optional, creating duplicate accounting risk |
| Learning | content engine/API, DailyGrowthReview Cron, investment API, Company runtime learning | recommendations, experiments, reviews | Candidate approval is domain-specific; no global effective-learning authority |
| Slack Memory | verified Slack event/action plus background memory job | Slack context, candidate promotion, Morning Brief | Slack is an interface/context writer, never canonical business truth |
| Engineering | Engineering Worker after `ai-engineering` + `ai-ready`, plus human-confirmed intake APIs | operator UI, GitHub, CI | isolated external executor; no merge/deploy operation |

Human UI and Slack are entrypoints, not authorities by themselves. Authority comes from authentication/signature checks, same-origin protections, policy flags, server-side state, idempotency, and domain human-gate contracts.

## 5. External Mutation Audit

| Mutation | Entry Point | Gateway class | Gate | Executor | Audit / idempotency | Risk |
|---|---|---|---|---|---|---|
| X Buffer draft/schedule | `/api/note/publishing/buffer`, DailyX Cron, signed Slack action | EQUIVALENT_PROTECTED_PATH | publishing/xAutoPublish flags, safety repair, limits, duplicate claim; DailyX adds Publish Eligibility | Buffer GraphQL client | publishing history, draft lineage, claim/idempotency | Medium: external mutation bypasses Action Gateway but has domain guards |
| Note draft/publish job | `/api/note/publishing/note` | LEGACY_BYPASS | flags and `canQueueNotePublication`; client-supplied `approvedBy` is not authority | local Playwright runner consumes job | queue/history and claimOnce | High for future enablement: paid/high-risk human identity is not proven at queue entry |
| Knowledge promotion/merge | `/api/knowledge/promote` from Weekly Review | EQUIVALENT_PROTECTED_PATH | internal ApprovalGrant; merge preview token; Human Managed write policy | Knowledge lifecycle/Vault | candidate state, file/index; no generic ActionRequest | Low |
| Company revenue entry | `/api/company/revenue` | EQUIVALENT_PROTECTED_PATH | Production mutation guard, explicit `confirmedByHuman`, validation | Revenue Store | append-only, Execution Store idempotency | Low |
| Content revenue evidence | `/api/content/revenue` | LEGACY_BYPASS | accepted source enum only; no explicit same-origin/idempotency/human confirmation in route | Content Monetization Store | event ID only | Medium: duplicate or forged attribution evidence can be written within authenticated perimeter |
| Mission create/start/run/complete/cancel | Company mission APIs/runtime Cron | GATEWAY_NATIVE for actions; Mission mutations use Execution service | same-origin/auth, transition rules, lease/CAS/idempotency, approvals | internal registered executors only | mission history + execution records | Low |
| Slack action | `/api/integrations/slack/actions` | EQUIVALENT_PROTECTED_PATH | Slack signature; authorized user for Company approvals; R3/R4 cannot be Slack-approved | domain handlers / Execution service | claim/idempotency and CEO decision records | Medium: legacy content actions execute outside Action Gateway |
| Engineering issue/branch/PR | approved intake + Engineering Worker | EQUIVALENT_PROTECTED_PATH | human `ai-ready`, active machine, protected diff, verification, security review | isolated worker + GitHub adapter | worker audit, artifacts, GitHub/CI state | Medium external executor, bounded by no-main/no-merge/no-deploy rules |
| Investment trade | no entrypoint | GATEWAY_NATIVE prohibition | `INVESTMENT_TRADE` R4 and no executor | none | invariant tests | P0 boundary enforced |
| Payment / Ad spend | Action types only | GATEWAY_NATIVE prohibition in practice | R3 approval required, but no executor registered | none | ActionRequest if proposed | No executable repository path found |
| Credential change | Action type only | GATEWAY_NATIVE prohibition | R4 and no executor | none | invariant tests | P0 boundary enforced |

`LEGACY_BYPASS` here means the mutation is outside the generic Action Gateway and lacks an equivalent complete authority contract at the inspected entrypoint. It does not mean the route is publicly unauthenticated; global middleware and deployment configuration are separate perimeter controls.

## 6. Action Gateway Audit

### GATEWAY_NATIVE

- Company ActionRequest review, approval, execution, and audit under `app/lib/company/execution`.
- Unknown actions default to R4/block.
- R2 and R3 require approval; R4 remains non-executable after approval.
- Only internal actions have registered executors. No publish, GitHub write, payment, ad spend, credential, or investment trade executor exists.
- External content cannot directly create an executable ActionRequest.

### EQUIVALENT_PROTECTED_PATH

- Formal Knowledge promotion/merge.
- Company Revenue Ledger entry.
- Engineering Worker GitHub mutation.
- Slack Company approval.
- X publishing, where the domain safety, publish eligibility, policy switches, idempotency, and provider reconciliation form a specialized gate.

### LEGACY_BYPASS

- Note publish-job enqueue does not prove the approving human identity server-side and is not Action Gateway-native.
- Content Revenue evidence POST is a separate mutable ledger entrypoint without the Company Revenue route's confirmation/idempotency contract.
- Some signed Slack content actions call Buffer/domain stores directly.

### UNKNOWN

- Whether every external consumer of queued Note jobs independently verifies paid/high-risk approval before browser publication cannot be proven from the inspected server route alone.
- Production middleware/session configuration and current provider permissions require runtime evidence and are not inferred here.

## 7. Human Gate Audit

| Human Gate | State | Repository evidence | Finding |
|---|---|---|---|
| Investment Trade | ENFORCED | R4 action, no executor, Investment APIs record decisions/transactions only | No automatic trade path found |
| Production Merge | ENFORCED | Engineering Worker cannot merge and marks PR ready for human review | Merge remains external human action |
| Production Deploy | ENFORCED | Worker security rejects production deploy automation; no deploy executor | Current runtime deploy authority is outside worker |
| High Risk Publish | PARTIAL | X has Fact/Safety/Eligibility guards; generic PUBLISH is R3, but legacy publisher paths bypass Gateway | Domain gates exist; one uniform high-risk authority contract does not |
| Paid Note | PARTIAL | Note publish flags and article approval checks exist; `approvedBy` is not verified authority at queue entry | Must be hardened before enabling auto publish |
| Formal Knowledge Promotion | ENFORCED | Human Managed write policy and server-issued ApprovalGrant | Formal Knowledge cannot be auto-written by candidate flow |
| Protected Core Mutation | ENFORCED | R4 plus Engineering protected-path security | Worker blocks protected diffs |
| Credentials | ENFORCED | R4/no executor; Engineering credentials isolated and redacted | No product mutation path found |
| Payment | ENFORCED | R3 but no registered executor | Proposal can exist; execution cannot |
| Ad Spend | ENFORCED | R3 but no registered executor | Proposal can exist; execution cannot |

No gate is marked safe based on current environment flags. The states above describe repository enforcement only.

## 8. Provider Audit

| Capability | Interface | Providers / implementation | Abstraction | Status |
|---|---|---|---|---|
| ResearchProvider | `company/research/types.ts` | web, RSS, GitHub, internal telemetry, mission history, existing Creator Research, fund watchlist/official source adapter | explicit provider interface and normalized result | ABSTRACTED |
| LLMProvider | `callAI` provider selector, not a formal class interface | Gemini, Groq, local Ollama, bounded auto fallback | common call surface but provider-specific env/error behavior remains in application client | PARTIAL_ABSTRACTION |
| PublishProvider | no cross-platform interface | Buffer X client and local Note browser-job flow | provider coupling inside Note/X publishing domain | DIRECT_PROVIDER_COUPLING |
| MetricsProvider | result contracts in X/Buffer/Note metric adapters | X API, Buffer metrics, Note runner/manual import | normalized to `ContentPerformance`, but no single registry/interface | PARTIAL_ABSTRACTION |
| ImageProvider | none | none | no implementation | NOT_IMPLEMENTED |
| VideoProvider | none | none | no implementation | NOT_IMPLEMENTED |
| Investment Data Provider | `MarketDataProvider` plus intelligence provider modules | Yahoo, Stooq fallback, FRED, SEC, SerpAPI/news where configured | market data abstracted; macro/fundamental/news interfaces are fragmented | PARTIAL_ABSTRACTION |

Provider runtime health is `UNKNOWN` in this audit. Repository presence does not mean configured or available.

## 9. SNS Architecture Audit

### X

| X capability | Canonical lifecycle placement | Current owner |
|---|---|---|
| Research / Hot evidence | Research | Note/X research adapter backed by provider evidence |
| DailyXPlan | domain Execution plan | Note research store; intentionally not forced into generic Mission engine |
| Draft | pre-result content state | SocialDraft store |
| Fact / Safety / Duplicate / Publish Eligibility | Execution policy gates | X automation and publishing domain |
| Buffer schedule/publish/reconciliation | external mutation + Result | Buffer client, publishing history, SocialDraft/PublishedContent lineage |
| Performance | Performance adapter input | ContentPerformance/provider adapters → PlatformPerformance projection |
| Growth review / learning | Learning candidate | DailyGrowthReview, Content Learning, Platform experiments |

DailyX is a bounded domain execution pipeline. It should keep its scheduling semantics. A3/A4 should align lineage and authority contracts, not force it into the generic Mission runner.

### Instagram

Repository-confirmed current state:

- Brand foundation and platform policy exist.
- Platform Performance adapter returns `not_configured` with no records.
- `CreativeSpec`, carousel/reel generator, ImageProvider, VideoProvider, Instagram PublishProvider, and Instagram MetricsProvider are **NOT_IMPLEMENTED / PLANNED** on this baseline.

No Instagram result, metric, publishing capability, or provider health is inferred.

### Note

Note uses domain drafts, article sessions, publish queue, local browser execution, metrics normalization, monetization evidence, and content learning. Paid/high-risk publication remains `PARTIAL` until the queue-to-executor authority proof is explicit and server-bound.

## 10. Investment Architecture Audit

- Market Regime, securities opportunities, sector/theme intelligence, watchlist, portfolio, decisions, and learning are Investment domain artifacts.
- `InvestmentOpportunity` is not the Company `RevenueOpportunity`; merging their stores would erase distinct semantics.
- Provider data is evidence-first and missing values remain missing.
- GO/WAIT/PASS records human analysis decisions; they do not execute trades.
- Transaction Ledger records already-executed facts and is not an order executor.
- Investment Learning uses price observations, horizons, candidates, and explicit human learning decisions. It must not mutate Fund Policy automatically.

Classification: Investment intelligence and learning are `KEEP_AS_ADAPTER`; trade prohibition and Human-only decisions are `KEEP` safety boundaries.

## 11. Engineering Architecture Audit

The Engineering lifecycle is:

```text
Requirement / human-confirmed intake
→ GitHub Issue
→ ai-engineering + ai-ready
→ isolated Worker claim and lease
→ plan
→ implementation
→ full verification
→ security review
→ branch push
→ PR
→ CI
→ READY_FOR_HUMAN_REVIEW
→ Human Merge outside the Worker
```

Engineering Task state is stored in the isolated Engineering runtime and GitHub, not duplicated as an independently mutable Company Mission. Company Execution Store contains handoff metadata for approved company/skill improvement requests. This is a deliberate adapter boundary.

The Worker is an external mutation executor but is not an Action Gateway executor. Its equivalent protected path includes human `ai-ready`, active-machine gating, protected-path review, credential isolation, no main push, no merge, and no Production deploy.

## 12. Slack / Human Interface Audit

- Slack requests require signature verification.
- Company approval actions also require an authorized Slack user and cannot approve R3/R4.
- Slack conversation memory is contextual memory, not Formal Knowledge.
- Slack-derived Knowledge remains an Inbox candidate until Formal Knowledge promotion.
- Slack CEO decisions are evidence/audit records; they do not create a second Mission, Revenue, or Knowledge SSOT.
- Legacy content buttons can mutate content stores or invoke Buffer directly after signature/idempotency/domain safety checks. They are equivalent domain paths, not Action Gateway-native.
- Slack is a Human Interface and transport adapter, never a new SSOT.

## 13. Duplicate Risks and Findings

```ts
type ArchitectureFinding = {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  lifecycleStage: string;
  title: string;
  evidence: string[];
  currentOwner?: string;
  classification: "KEEP" | "KEEP_AS_ADAPTER" | "MIGRATE_LATER" | "DEPRECATE_LATER" | "INVESTIGATE";
  recommendedAction: string;
  blocking: boolean;
};
```

### A2-F01 — Revenue attribution can exist without accounting linkage

- Severity: **high**
- Lifecycle: Revenue
- Evidence: `content/monetization/store.ts` stores `RevenueEvent`; `company/revenueStore.ts` stores confirmed accounting entries; `companyRevenueId` is optional.
- Current owner: Company Revenue Ledger for accounting; Content Ledger for attribution.
- Classification: **MIGRATE_LATER**
- Recommendation: A3 must define uniqueness/linkage and reconciliation so an event cannot be treated as separate realized revenue when it represents an existing Company entry.
- Blocking: **false** for A2; **true before automated revenue ingestion**.

### A2-F02 — Paid Note publication authority is not server-bound at queue entry

- Severity: **high**
- Lifecycle: Execution / Result
- Evidence: `/api/note/publishing/note` accepts optional `approvedBy`; flags and article state are checked, but no server-issued approval identity is required in that route.
- Current owner: Note publishing queue and local runner.
- Classification: **MIGRATE_LATER**
- Recommendation: retain auto-publish disabled; design a server-bound approval proof and final executor recheck in a separate safety PR.
- Blocking: **true before enabling paid/high-risk Note auto publication**.

### A2-F03 — Research evidence has multiple durable domain identities

- Severity: **medium**
- Lifecycle: Research
- Evidence: Company Research items/artifacts live in Execution runtime; Note Research and Investment Intelligence persist separate source/fingerprint/evidence shapes.
- Current owner: Company Research for shared artifacts; domain stores for specialized research.
- Classification: **MIGRATE_LATER**
- Recommendation: A3 should define canonical source identity, provenance mapping, and retention without moving data yet.
- Blocking: **false**.

### A2-F04 — Performance inputs have overlapping metric representations

- Severity: **medium**
- Lifecycle: Performance
- Evidence: `ContentPerformance` and `PerformanceSnapshot` share metrics; `adaptPlatformPerformance` explicitly gives ContentPerformance precedence and skips matching snapshots.
- Current owner: PlatformPerformance projection.
- Classification: **KEEP_AS_ADAPTER**
- Recommendation: preserve the adapter precedence; A3 should inventory writers and require shared content/publication identity for all records.
- Blocking: **false**; canonical adapter currently prevents double count.

### A2-F05 — Learning authority is fragmented across approved domain records and strategy reviews

- Severity: **medium**
- Lifecycle: Learning
- Evidence: Content Learning, DailyGrowthReview/ContentGrowthStrategy, PlatformExperiment, InvestmentLearning, and Company runtime learning use different approval/effectiveness semantics.
- Current owner: domain learning stores; shared platform analysis is read-model logic.
- Classification: **MIGRATE_LATER**
- Recommendation: define one canonical Learning envelope and effective/approved semantics while retaining domain payloads.
- Blocking: **false**, because current tests prevent automatic policy mutation.

### A2-F06 — External mutation policy is split between Gateway and equivalent domain gates

- Severity: **medium**
- Lifecycle: Execution
- Evidence: Action Gateway has only internal executors; Buffer, Knowledge, Revenue, Slack, and Engineering use direct domain paths.
- Current owner: Action Gateway for Company actions; domain services for legacy integrations.
- Classification: **INVESTIGATE**
- Recommendation: A3/A4 should inventory authority equivalence and select migrations based on safety value; do not force all pipelines into one executor.
- Blocking: **false**.

### A2-F07 — Content Revenue evidence writer lacks canonical ledger protections

- Severity: **medium**
- Lifecycle: Revenue
- Evidence: `/api/content/revenue` validates source but does not visibly enforce same-origin, idempotency, or human confirmation like `/api/company/revenue`.
- Current owner: Content Monetization Ledger.
- Classification: **MIGRATE_LATER**
- Recommendation: separate attribution capture from accounting confirmation and add a canonical linkage/idempotency contract in a future PR.
- Blocking: **false** while it remains evidence only.

### A2-F08 — Result has no shared minimal envelope

- Severity: **low**
- Lifecycle: Result
- Evidence: mission completion, PublishedContent, research runs, Investment decisions, and Engineering audits expose unrelated lineage fields.
- Current owner: domain stores.
- Classification: **INVESTIGATE**
- Recommendation: define a minimal reference envelope only if cross-domain observability requires it; do not create a new Result database.
- Blocking: **false**.

No repository evidence was found for two independent investment trade executors, two formal Knowledge owners, or two independent canonical Mission status stores.

## 14. Recommended Foundation Changes

Maximum five, ordered by priority. These are future PRs, not changes made by A2.

1. **P0 Safety — Bind paid/high-risk Note publication to server-issued human approval.** Recheck the proof immediately before the browser executor acts; keep `noteAutoPublish=false` until completed.
2. **P1 SSOT Integrity — Define RevenueEntry ↔ RevenueEvent linkage and reconciliation.** Company Revenue remains accounting truth; channel records remain attribution evidence; prevent the same receipt from being counted twice.
3. **P1 SSOT Integrity — Publish the A3 store/writer contract.** Specify identities, retention, write authority, versioning, and reconciliation for Research and Performance inputs without migrating Production data.
4. **P1 SSOT Integrity — Define a canonical Learning envelope/effectiveness contract.** Preserve domain-specific Investment and Content payloads; prevent strategy reviews from silently becoming approved policy.
5. **P2 Provider / Execution Abstraction — Classify every external integration as Gateway-native or equivalent protected.** Migrate only paths where the generic contract materially improves safety; keep DailyX and Engineering domain execution semantics.

No P3-only cleanup is recommended ahead of these integrity and safety items.

## 15. A3 Handoff

Phase A3 should produce a store-by-store Migration / Deprecation Plan, not perform the migration itself unless separately authorized. It must answer:

- What is each durable path/schema and its canonical owner?
- What stable identity links Company Research, Note Research, and Investment evidence?
- Which writers may create versus update versus approve each record?
- How are ContentPerformance and PerformanceSnapshot reconciled by publication/content ID?
- How must RevenueEvent reference RevenueEntry, and how are legacy unlinked events handled without rewriting history?
- Which Learning records are observations, interpretations, candidates, approved learnings, experiments, or strategy changes?
- Which direct mutations need Action Gateway migration, and which should remain equivalent protected domain paths?
- Which stores require retention/deprecation documentation but no migration?

A3 must not infer Production contents, delete legacy data, rewrite history, or create a migration merely to make schemas look uniform.

## Audit Conclusion

The repository has clear canonical foundations for Formal Knowledge, Mission/Execution, accounting Revenue, and the Platform Performance read model. Domain adapters are appropriate for DailyX, Investment Intelligence, Engineering, and Slack context. The material risks are optional Revenue linkage, incomplete paid Note authority proof, fragmented Research identity, overlapping Performance inputs, and fragmented Learning approval semantics. These are audit findings for A3 and later safety PRs; A2 changes no runtime behavior.
