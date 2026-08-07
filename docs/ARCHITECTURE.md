# AI Company Architecture

## Responsibility boundaries

| Layer | Source of Truth | Owns | Must not own |
| --- | --- | --- | --- |
| CODE (`ai-company`) | Git source | UI, API, orchestration, validation, Store/Adapter, stable safety rules | current brand copy, personal records, live queue state |
| VAULT (`ai-company-vault`) | `memory/` | identity, policies, knowledge, decisions, historical records and human-readable application data | active session, current queue, temporary job state |
| STATE | Redis/runtime | active secretary, inbox/pipeline, session, cache, locks and jobs | long-term decisions and business policy |

The runtime ContextBus uses Redis as its source of truth. Its JSON file is only a
local mirror/fallback. `memory/context/current-bus.md` is retained legacy
documentation and is never loaded as current runtime state.

## Memory tiers

- Tier 1 / Core: small stable summaries loaded for normal chat.
- Tier 2 / Working: current research, drafts, pipeline and watchlists loaded by the owning Store only when required.
- Tier 3 / Archive: daily plans, old drafts, logs and chat history retrieved only by explicit lookup.

`app/lib/memory/manifest.ts` defines these boundaries. Recursive archive loading
must not be added to normal secretary scopes.

## Departments and prompts

Secretary definitions, Hub nodes, scopes, registry and router must use the same
secretary IDs. Code prompts contain stable role, security and output rules.
Mutable brand, KPI, policy and personal rules come from Vault.

The old creator workflow is integrated into `personal-note`; the legacy page
redirects to `/note`.

## Artifact lifecycle

`Research → Viewpoint / Decision → Draft → Published / Result → Learning`

Artifacts use stable IDs, `ownerDepartment`, optional related departments and
parent/child IDs. Cross-department use is a reference, never a copied record.
Research is not a personal opinion, an AI draft is not a public statement, and
only an explicitly published artifact is treated as the owner's public output.

## External integrations

Vault access is selected inside the Vault adapter: GitHub API in configured
deployments, filesystem locally. Local access requires `VAULT_ROOT`; no personal
absolute path is a code default. Redis owns runtime state. Google Calendar,
Slack and publishing integrations remain behind their existing API/store
boundaries and must preserve human approval and authentication checks.

