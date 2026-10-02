# Slack Conversation Memory v1

## Architecture and authority

Slack Events keeps signature verification, the PR #124 1:1-DM gate and event deduplication. `withSlackConversationMemory` runs **inside** the existing background lifetime; the HTTP ACK does not await Vault IO. The sanitized user turn is queued durably and attempted before application processing. An AsyncLocalStorage context lets the common `postToSlack` sender record successful plain/Block Kit replies without capturing unrelated channel notifications. Research and generated drafts retain references to their existing canonical artifacts.

Editorial Context remains the existing 48-hour Redis working memory. The canonical long-term conversation is a Vault Markdown artifact, not Execution State or the Knowledge Index. Execution State contains only outstanding sanitized jobs and aggregate counters; successful jobs are removed. No DB migration, OAuth scope, secret, new scheduler or paid API is required.

## Storage

| Record | Location / behavior |
| --- | --- |
| Raw conversation | `memory/conversations/slack/YYYY/MM/YYYY-MM-DD-{channel}-{root or thread_ts}.md`; day is Asia/Tokyo |
| Decision | `memory/decisions/slack/{normalized-fingerprint}.md`; explicit evidence only |
| Task candidate | `memory/planning/task-candidates/slack-{normalized-fingerprint}.md`; serialized canonical `InboxItem`, `approvalStatus: pending` |
| Knowledge candidate | Existing `captureKnowledgeCandidate` → `memory/personal/inbox/cap-{hash}.md`, `captured` |

Decision paths intentionally use content-addressed names instead of the suggested dated names: normalized exact duplicates across days/conversations resolve to one artifact. Source dates, evidence, save reason and source event IDs are retained. Candidate paths and conversations link in both directions. Human-owned documents are not automatically overwritten. Only these narrow new machine-owned prefixes were added to the existing write policy.

Task candidates are **not** enqueued into an executable plan, mission, calendar, trading, publication or purchasing workflow. Formal Knowledge still requires the existing Human Gate. The existing Knowledge Index scans `memory/knowledge/`, so raw conversations and Inbox candidates are not automatically indexed.

The human-readable Markdown includes the original user/assistant text, audio file ID/name/MIME and transcript, summaries, source metadata, redaction flag and artifact links. A versioned trailing encoded JSON comment enables lossless parsing when user text itself contains Markdown fences. This encoding is **not encryption**. Audio binaries/private download URLs are never copied. Permalink is nullable; there is no extra Slack API/scope requirement.

## Extraction and cost

V1 uses deterministic, extractive rules with typed structured output, not an LLM. It adds no model cost and does not change provider/fallback policy. Triggers: five unprocessed user turns, an explicit decision/action/preference, an evidence-backed confirmed AuthorViewpoint, or 30 minutes of inactivity. Inactivity is processed on the **next existing runtime Cron/DM maintenance invocation**, not a new 30-minute timer.

Summary is at most eight recent literal user-statement excerpts (240 characters each). Original turns are never truncated/replaced. Categories are a fixed enum; tags reuse category names and are capped at eight. Decisions/actions/preferences cite literal user evidence and event IDs. Questions, uncertainty, quoted examples and hypotheses are conservatively excluded. This is deliberately a narrow Japanese-rule extractor: it can miss paraphrases and does not perform semantic equivalence or infer unstated intentions. Normalized exact dedupe is used; semantic dedupe/retraction handling is future work.

## Idempotency and concurrency

- User ID: `user:{event_id}`; fallback uses channel + Slack timestamp.
- Assistant ID: originating event + successful reply sequence, with `reply_to_event_id` and Slack response timestamp.
- Artifact append checks IDs even after Slack event dedupe expires.
- `updateVaultFile` reapplies transformations after GitHub SHA conflicts, serializes same-path writes in a process (including local fallback), and skips unchanged writes.
- Existing distributed Execution Store leases serialize per-conversation analysis. Optimistic Execution State versions protect unrelated runtime work.
- Candidate fingerprints are stable; Knowledge Capture accepts an optional idempotency key without changing existing callers. Partial promotion retries reuse existing files and complete backlinks.

## Failure and privacy

Before either Vault or outbox persistence, redact credentials (including configured token/secret values), Bearer/API-key/password/cookie/private-key patterns and private/signed URLs. Block capture reads display text only, never interactive action values or the full payload. Logs contain status/job IDs rather than conversation text or secrets. GitHub file GET/PUT requests have an eight-second timeout.

Jobs attempt at most three deliveries, with two-minute retry spacing and crash recovery. Authenticated, authority-validated `personal-company-runtime` Cron maintenance runs independently of the model canary/autonomous-work gates; DM completion also drains a bounded job. Only jobs exhausted after three attempts appear in Home attention. A temporarily failed save does not suppress Slack replies. Failed analysis/promotion never removes raw text. A failed Slack send is not falsely recorded as a successful assistant response.

Inactivity jobs coalesce per conversation and defer while a conversation is still active. A newer scheduled payload is not deleted when an older leased payload completes. Successful payloads are removed; failed payloads remain for operator recovery. The queue has a 1,000-job cap. If both the Execution Store and Vault are unavailable (or the outbox is full and Vault also fails), there is no third durable store: the system emits `MEMORY_WRITE_AND_OUTBOX_FAILED`, continues replying and cannot guarantee retention for that turn. Credentials redaction is defense in depth, not a guarantee for every possible secret format; do not intentionally send secrets to Slack.

## Operations

Inspect `ExecutionState.slackMemory.jobs` via the existing authorized operator tooling. Operational fields include attempts, lastError code, source event, conversation path, fingerprint, status and nextAttemptAt. Do not print job payloads in logs/tickets. Metrics: receivedConversations, receivedTurns, rawSaves, saveFailures, derivedAnalyses, decisionsExtracted, tasksExtracted, knowledgeCandidates, retryCount. Counters are operational, not billing-grade exactly-once accounting.

For an exhausted job, first repair the underlying Vault/Execution Store access or ownership issue. A human operator can reset the **specific reviewed job** to pending with attempts zero and a current nextAttemptAt using the version-checked store; then run existing authenticated maintenance. Do not clear the whole Execution State. Recheck raw artifacts and backlinks. There is intentionally no new retry/delete UI or automatic reset of exhausted jobs.

## Validation and rollout

Run `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`. There is no lint script in this repository. The added QA suite intercepts all GitHub/Slack/Redis IO; production messages and Vault contents are not touched. Existing DM/editorial, Knowledge, architecture and Vault tests remain in the full regression suite.

This change is **PR only**: no merge, production deploy, secret changes, OAuth changes or history backfill. Once separately approved and deployed, smoke-test a harmless DM, a thread, audio transcription, a decision/preference and a pending task; inspect Vault originals/backlinks and verify that no formal Knowledge or executable task was created. Yesterday-summary adapter/search UI and historical Slack import are deferred optional scope.

## Slack CEO Operating System additions

The authenticated `/api/cron/morning-brief` route runs at `22:00 UTC` (`07:00 Asia/Tokyo`). It composes only unresolved action-required items from the existing Notification events, Home Attention and Revenue Opportunity stores. Individual notifications already sent are labeled as still-unresolved summaries rather than presented as new. Every available detail link is converted from the existing relative route using `APP_BASE_URL` and must remain same-origin. A daily Execution Store idempotency record and distributed lease prevent duplicate sends. Slack delivery failure does not mark the day complete, so a later authenticated retry remains possible.

Source-article controls are validated `http`/`https` URL buttons and do not require an action handler. Missing, malformed and non-web URLs produce no button. `Save For Later` now writes a bounded, idempotent reading queue to `memory/personal/note/saved-for-later.md` using the existing Vault update/concurrency path. The unused `selectNewsItem` and `editText` action IDs were removed; an architecture test requires every declared legacy action to have a handler.

Successful low-risk Slack approval creates a content-addressed CEO Decision artifact under `memory/decisions/slack/`. It records the actual approval, subject, timestamp and Slack provenance. Because Slack approval currently has no reason field, the reason is explicitly left blank rather than inferred. Existing server-side authorization, R0–R2 limit, approval policy and idempotency remain authoritative; R3/R4 still require the application detail screen.
