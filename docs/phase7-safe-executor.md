# Personal AI Company Phase 7 — Safe Executor

Base: `main`, verified commit `09fc76cfe40ef0996c402c3409dbe1d24fe0caeb` (PR #47, including Phase 6 via #46). No stacked Phase branch was used.

## Execution boundary

`POST /api/company/missions/:id/run` advances a stored mission through a bounded business-logic runner. Request bodies cannot supply agents, approval decisions, executable code, providers, credentials, or replacement payloads. The existing session middleware authenticates the API; the new mutation endpoints also check browser Origin.

The private registry contains only `MISSION_STATUS_UPDATE`, `INTERNAL_MEMORY_WRITE`, and `INTERNAL_REPORT_CREATE`. Both initial execution and approval resumption use the existing Phase 6 gateway. Its ordering and approval engine are unchanged. Security review occurs before registry dispatch. Approved requests bind their original payload; callers resume by request ID. Executed requests are idempotent.

Internal memory and report artifacts are append-only records in `memory/personal/company/execution.md`. Their logical paths are limited to one new Markdown filename beneath `memory/company-review/`, `memory/personal/agent-results/`, `memory/patterns/`, or `memory/organization-proposals/`. These records are not arbitrary filesystem/Vault writes and never enter core prompt memory automatically. Existing policy, profile, ledger and execution files cannot be selected as artifact targets. Sensitive/injection payloads are redacted when blocked.

Unknown requests are blocked by the gateway. A known but unregistered safe action reports `NO_EXECUTOR`; approved external actions report `DRY_RUN` and keep their request status `APPROVED`, with `APPROVED_NOT_EXECUTED: NO_EXECUTOR` as the reason. Neither can satisfy a required action step. R4 and Investment Agent trade requests cannot execute, including forged approval/risk metadata.

## Current deployment scope and requirement difference

Run requires an explicit local `VAULT_ROOT`, with GitHub-backed Vault and Vercel execution disabled. This prevents an internal executor from indirectly issuing a real GitHub write through the existing Vault backend. Production multi-instance execution needs a durable storage/lease adapter in a later phase. Existing read/CEO metadata APIs retain their existing storage backend.

The Phase 6 permission model has no Gmail permission projection. Therefore `GMAIL_SEND` remains **BLOCKED**, even if a caller presents an approved request; changing this would require changing Protected Core. The approved-external DRY RUN behavior is verified with `PUBLISH`. This differs from the literal Gmail example in required Test B and is deliberately not concealed by bypassing or weakening the gateway.

## Runner and recovery

Defaults are centralized in `runnerConfig.ts`: 10 steps, 2 retries, 2 replans, 30,000 ms total active execution time. Counters survive explicit Run requests. Overrides may only tighten limits. Waiting for CEO input does not consume a worker loop. Provider requests receive cancellation signals, and late results cannot mutate execution state. No permanent worker, scheduler, tool-executing LLM, or self-modification mechanism is introduced.

Each step checkpoints progress; NPC status is derived from backend mission state. Existing Phase 6 plans remain unchanged. Newly started missions receive a separate internal draft/report plan. Text generation uses the existing AI client with no tool access. Research is limited to supplied internal context, not a claim of live web research. A required skill without a Phase 7 execution handler stops safely.

Permission/R4/security failures block without retries. Review/step failures permit bounded replan. Rejection reasons are carried into generation context. Unchanged rejected payloads cannot be resubmitted. A new plan retains the old plan/history and generates fresh outputs. Completion requires complete steps, PASS review, complete approvals, executed required actions, and no blocking actions.

Local mutations use a filesystem lease plus an in-process lock. A crashed process leaves a lease and execution fails closed; an operator must verify that no process is running before removing the stale `.company-execution-lock` directory. Snapshot writes are atomic, and symlinks/corrupt state are rejected. Learning also has immutable per-event files under `memory/learning/`; existing audit events and artifact records cannot be edited or removed through the store API. This is application-level append-only storage, not a hardware/WORM guarantee against an OS administrator.

## Opportunities, revenue and learning

`POST /api/company/opportunities/:id/select` selects a recommended opportunity and creates/reuses its Money Quest. Starting the linked mission moves SELECTED to RUNNING. Only confirmed, positive, non-investment revenue linked by opportunity ID can move RUNNING to VALIDATED. Completion alone does not validate. Revenue correction/reversal is handled through the existing effective ledger view.

Learning records mission success/failure/block, approval decisions and original proposals/reasons, blocked actions, review failure, revenue, and validation. Trace/mission/opportunity/agent/skill/workflow attribution is preserved when known. Cost remains explicitly unknown when the provider does not report it. Review scores reflect the existing deterministic reviewer, not an invented human quality score.

The adapter feeds learning to the existing pattern/proposal pipeline, including repeated missing-agent evidence. It never updates prompts, creates agents/departments, or changes code. Revenue-hook failure returns `learningPending` while retaining the successfully recorded revenue; an operator can retry `syncRevenueLearning` from the ledger. No background retry worker is introduced.

Performance includes assigned/completed/failed/blocked missions, approval rejection rate, review pass rate, average recorded execution latency, and attributed revenue. Unknown rates/latency remain null. Contributions deduplicate revenue IDs and share each confirmed business revenue across known agent contributors without rounding the total upward. Company Health remains independent from game XP/level.

## UI

CEO Office keeps company health, growth, Money Quests, revenue, approvals and alerts prominent. Detailed financial/productivity information is collapsed. Board Room contains CEO decisions. NPC selection exposes workload, mission history, review performance and contribution. Mission details show plans, steps, action execution results, reviews, approvals, output records and revenue. Security Center adds No Executor/DRY RUN, R4, permission, injection and Protected Core indicators.

## Verification

- Untouched main: 1,028 checks passed, typecheck and production build passed.
- Phase 7: 1,059 checks passed (31 added), including architecture, QA, fund, content, maemichi, knowledge and grill.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Non-fatal webpack cache warnings may occur locally.
- Phase 6 gateway, approval engine and invariant-test contents are checked against their exact main hashes.
- Local browser/API test with an isolated Vault and mock AI: SELECTED → ACTIVE → four steps → PASS review → COMPLETED. Opportunity remained RUNNING without revenue. A test ¥500 revenue then produced VALIDATED, two ¥250 agent shares, and mission/revenue/validation learning events. Browser reported no application errors.
- Real-model output quality, production storage, and crash recovery under deployment conditions require operational validation. No real message, publication, trade, payment or broker integration was exercised or implemented.
