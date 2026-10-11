# Backend connectivity review — 2026-10-11 JST

Scope: repository inspection on PR #164, not proof of deployed runtime. Production status returned HTTP 401 in the preceding read-only check. No production jobs were triggered.

| Area | Evidence | Finding / next action |
|---|---|---|
| Shared Research → DailyX | `note/research/run.ts`, `sharedEvidence.ts` | Fixed in #164: recent Creator evidence feeds existing URL reconciliation and Hot clustering. Requires deployment and a successful Department Research run. |
| Feedback → Research queries | `automation/dailyResearchAgenda.ts`, department-research route | Fixed: resolve cluster IDs into topic titles, exclude recently used feedback topics and sort recent windows. |
| Learning → reports | `nightlyGrowthReview.ts`, `weeklyReport.ts`, `status.ts` | Fixed: candidates were presented as applied strategy changes. Explicit application evidence is now required; absent legacy evidence is not treated as applied. |
| Research scheduling | `vercel.json`, `company/research/policies.ts` | Department Research runs 06:30 JST daily, normal Research 07:00, X planning 07:10. Operations policy says hourly but deployment invokes this route daily. Policy eligibility does not itself schedule execution. Requires a separate scheduling decision. |
| Department Research duration | department-research route and policies | Corrected in #164: allocate remaining collection time across departments and persist after each department. Deferred IDs are reported. In-flight interruption remains possible; no automatic retry of unknown external effects is introduced. |
| Morning Brief | `vercel.json` | Runs at 07:00 JST alongside normal Research; cannot assume it includes that concurrent run. Prior-day publication reconciliation must be checked from stored timestamps. |
| Instagram metrics | `content/platform-intelligence/adapters.ts` | Explicitly returns empty `not_configured`. Not an inactive implemented provider. CreativeSpec PR #163 is separate; generation, publication and measurement require their delivery phases. |
| X/Buffer performance | `automation/performanceSync.ts` and B1 readiness doc | Publication reconciliation and unavailable metrics paths exist. Current provider health, Canary sync and actual publication counts remain UNKNOWN until authenticated runtime reads succeed. |
| Note publication | architecture audit A2-F02; local runner architecture | Local execution and server-bound paid/high-risk approval require verification before enablement. Keep automatic publication disabled; do not start runner as a repair. |
| Investment | investment provider modules and architecture audit | Research/analysis adapters exist; configuration and freshness require runtime evidence. Automatic trade deliberately has no executor. This is an intended boundary. |
| Engineering | `engineering/worker.ts`, `docs/engineering-worker.md` | Separate worker process with human-ready intake. Repository code does not prove that the worker is running on the authorized machine. Do not auto-start it. |
| Slack / Knowledge | architecture audit sections 7, 12 | Signed event and candidate/promotion paths exist. Delivery, memory persistence and index health need runtime evidence. Formal human approval is intentional, not a missing wire. |
| Revenue / cost | architecture audit A2-F01, F07; store contracts | Accounting and attribution linkage needs dedicated reconciliation before automated ingestion. Do not merge ledgers or fabricate transactions as a connectivity repair. |

## Priority

1. Review and deploy #164 through the human-controlled flow; observe existing Research → DailyX and reconciliation without manually posting.
2. Department Research now allocates its remaining 45-second collection window across eligible departments and saves each completed department with the returned store version. The 60-second route retains a persistence margin. This is not a durable in-flight provider resume: interrupted unsaved departments remain unrecorded. Hourly policy versus daily invocation still requires a separate scheduling decision.
3. Obtain authenticated read-only runtime visibility for Canary, providers, Slack and worker heartbeat; unknown is not failed or healthy.
4. Continue Instagram creative/render/provider work after CreativeSpec review. Keep investment execution, paid Note, merge/deploy and formal Knowledge gates intact.

This is a targeted connectivity review informed by the architecture audit, not an exhaustive certification of every API or live integration.

## Autonomous daily continuity correction

Creator daily eligibility previously waited 24 hours after completion; a 06:30 run finishing at 06:30:45 would skip the next 06:30 invocation. Creator daily eligibility now resets at the next JST midnight. Same-day recorded runs remain suppressed, and other departments retain their interval policy. No cron schedule, publish threshold, or external-send retry policy changes.
