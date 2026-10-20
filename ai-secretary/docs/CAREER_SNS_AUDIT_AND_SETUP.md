# Career / 就活SNS — Audit, Scope, and Local Setup

Status: local draft-only MVP. No migration, deployment, Buffer request, or external AI call is included.

## Repository audit

| Capability | Before this change | Current delivery |
|---|---|---|
| Shared content / Instagram | Content Core and Instagram `CreativeSpec`/templates exist; Instagram renderer, persistence, publishing, and metrics do not | Career is a separate division path, not mixed into Note Content Core or Instagram's Men’s Pick brand |
| Knowledge | Formal Knowledge/Vault lifecycle is human managed; Content Core has private materials | Career transcript chunks retain source IDs and a private-only evidence type in a dedicated local file |
| Local AI | Ollama client exists, but general routing permits configured cloud providers/fallbacks | Career generation uses deterministic local templates (`local-template-v1`), with no model/network call |
| Worker / speech | Existing Slack audio transcription calls OpenAI transcription | Not reused. Text transcript/note import is implemented; local Whisper is not present in this repository |
| X / Buffer | X has a Buffer GraphQL implementation configured with one `BUFFER_X_CHANNEL_ID`; current channel identity belongs to existing Creator operations | No Career publish adapter or Buffer request. X/Instagram channel identity is unverified for this brand |
| Storage / database | Note content stores use Vault Markdown/JSON; Supabase currently hosts selected repositories, not a generic content schema | Private Career JSON is written only through `VAULT_ROOT`, with division checks, atomic replacement, and owner-only file mode. No DB migration is applicable |
| Department UI | SNS navigation currently exposes X, Instagram, Note | Adds a dedicated Career route and department entry; existing department settings/data are not edited |

`git fetch origin` succeeded before work. Baseline was `c67699b` (origin/main). Initial worktree was clean. The master SSOT, architecture audit, and canonical store contracts were reviewed. No PR or unmerged branch inspection was available from local Git metadata; no GitHub PR search was performed.

## Delivered workflow

1. Paste a transcript or note in the authenticated Career screen. Raw audio upload and cloud transcription are absent.
2. The import stores source hash and text locally, chunks the text, and tags each item `personal_experience` with its source ID. Every item needs human experience verification before batch generation.
3. Privacy checks flag email, phone, named company/school, and some name patterns. Human edits can remove/generalize flagged details. This heuristic cannot prove anonymity.
4. Select seven unique topics and a Monday start date. Deterministic templates produce seven X drafts and seven Instagram drafts with five slides each (35 total), scheduled as a Japan-time preview. Repeating the same week request returns the existing batch.
5. Review and edit drafts, then approve posts individually using the authenticated session. Approval never queues or publishes.
6. KPI and publication state remain N/A until provider-backed data exists.

### Safe local setup

Use an isolated local Vault directory so Career records do not enter the GitHub-backed Vault:

```sh
cd ai-secretary
mkdir -p /path/to/private-vault
chmod 700 /path/to/private-vault
export VAULT_ROOT=/path/to/private-vault
unset GITHUB_OWNER GITHUB_REPO GITHUB_TOKEN
npm run dev
```

Open `/content/career` after signing in. `VAULT_ROOT` must be a private local path. The API refuses Career storage when all three GitHub Vault variables are configured. Do not use recordings containing third-party confidential information without permission. Career generation does not require Ollama or external credentials.

Run verification with:

```sh
npm run typecheck
npm run test:career
```

Dry-run is the only mode: draft generation has no publishing switch and there is no Career Buffer adapter. The existing Buffer settings/channel list are intentionally not read or changed. Before any future reservation work, a human must verify the X and Instagram account handles and Buffer channel IDs for the Career brand. The Instagram publishing API/media requirements are not implemented or relied on here.

## Demonstration output (synthetic, not stored)

Use seven unique evidence topics such as interview reflection, application essay, self-analysis, company research, internship, a setback, and selection preparation. Selecting seven verified-safe items for Monday `2026-10-26` yields 14 draft records: seven X texts and seven Instagram carousels of five slides each. First slot preview: `2026-10-26 19:00 Asia/Tokyo`; last slot: `2026-11-01 19:00 Asia/Tokyo`. Every record is `divisionId=career`, `status=draft`, has no approval, and has no provider ID. This synthetic demo does not assert any personal outcome or company fact.

## Remaining work / blockers

- Local Whisper import and audio retention/deletion controls are not implemented. Text-only import is the MVP path.
- This repository has no career-specific durable database contract; JSON persistence requires persistent local `VAULT_ROOT`. Ephemeral serverless deployments are unsupported by this store.
- Heuristic PII and overflow checks require human review and are not exhaustive; visual font metrics vary by device.
- Editing is functional for text and slides, but done through browser prompts rather than a rich editor.
- Career-specific channel binding verification, Buffer schedule adapter, queue/idempotency, reconciliation, publication metrics, and performance learning are not implemented. Publish stays disabled.
- Existing Buffer GraphQL code only demonstrates the current X integration. It does not establish current official Instagram carousel API compatibility or account/channel identity.
- PR, affiliate disclosures, and sponsor approval flow are not enabled; sponsored records fail the current approval gate.
- No production schema migration, deployment, or public account action was made.
