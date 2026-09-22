# Autonomous Engineering Worker Operations Guide

The Engineering Worker is a local, fail-closed runtime for human-approved GitHub issues. It is deliberately separate from `app/lib/company/runtime`: it may prepare a branch and pull request, but it cannot merge, deploy production, change protected security/financial paths, or create its own issues.

## Active / standby architecture

Any number of Macs may have the LaunchAgent loaded, but exactly one shared GitHub Repository Variable controls which machine may process tasks. Each Mac has an explicit, non-secret `ENGINEERING_MACHINE_ID`; hostname inference is intentionally forbidden. GitHub's `ENGINEERING_ACTIVE_MACHINE` is the single source of truth. A worker proceeds only when both values match.

For example, with `ENGINEERING_ACTIVE_MACHINE=home-mac`, `home-mac` is ACTIVE and `mobile-mac` is STANDBY. Setting the variable to the reserved value `none` makes every worker STANDBY. Missing local identity, a missing variable, GitHub authentication/lookup failure, `none`, or a mismatch all fail closed before issue access. Standby is recorded as a normal `STANDBY` result, not a worker error.

The worker rechecks authority at run start, immediately before claim and each Codex stage, after verification and review, before push and PR creation, throughout CI monitoring, before CI fixes, and before `READY_FOR_HUMAN_REVIEW`. A mid-run change stops with `ACTIVE_MACHINE_CHANGED`; no later push, PR, CI fix, or issue claim occurs. The existing cleanup contract releases `ai-running`, while local worktrees and useful changes remain intact.

## Safety contract

Only an open issue carrying both `ai-engineering` and human-applied `ai-ready` is eligible. `blocked` and `ai-running` issues are ignored. The worker may add/remove only the `ai-running` claim label; it never grants itself `ai-ready`.

Every task starts from `origin/main` in `ai/issue-<number>-<sanitized-title>`. Full local verification, diff review, and the security gate must pass before push and PR creation. CI success ends at `READY_FOR_HUMAN_REVIEW`; there is intentionally no merge or production-deploy adapter.

Protected paths include Action Gateway/R4 definitions, Fund Engine/HUMAN_ONLY definitions, authentication, migrations, GitHub workflow permissions, and the Engineering Worker itself. Any protected diff is blocked before commit/push.

## Prerequisites and clone

- macOS with Git, Node.js, npm, and GitHub CLI (`gh`)
- `gh auth login` using a dedicated least-privilege worker identity
- an installed coding-agent executable
- a dedicated local directory and a clean clone

Example (choose your own paths):

```bash
mkdir -p "$HOME/ai-company-worker"
git clone https://github.com/h1maekawa/ai-company.git "$HOME/ai-company-worker/repo"
cd "$HOME/ai-company-worker/repo/ai-secretary"
npm ci
```

Recommended fine-grained GitHub token permissions are repository Contents read/write (branches), Issues read/write, Pull requests read/write, and Actions read. Do not grant repository administration, environment-secret administration, organization administration, production deployment, or bypass/merge privileges. Keep tokens and agent credentials in OS credential stores; never put them in this repository, a committed `.env`, a launchd plist, or logs.

GitHub identity and coding-agent identity are separate. The parent worker uses the dedicated worker user's `gh auth` credential for GitHub operations. The coding-agent subprocess never receives `GH_TOKEN`, `GITHUB_TOKEN`, the parent HOME, or GitHub CLI configuration. Its single provider-approved API credential is loaded from the current user's macOS login Keychain immediately before execution.

## Configuration

Set these in the worker process environment or a local, uncommitted launcher:

```bash
export ENGINEERING_REPOSITORY=h1maekawa/ai-company
export ENGINEERING_MACHINE_ID=home-mac
export ENGINEERING_WORKSPACE_DIR="$HOME/ai-company-worker"
export ENGINEERING_REPO_DIR="$HOME/ai-company-worker/repo"
export ENGINEERING_AGENT_COMMAND=codex
export ENGINEERING_AGENT_ARGS_JSON='["exec","-"]'
export ENGINEERING_AGENT_CREDENTIAL_NAME=OPENAI_API_KEY
export ENGINEERING_KEYCHAIN_SERVICE=ai-company-engineering-worker
export ENGINEERING_KEYCHAIN_ACCOUNT=OPENAI_API_KEY
export ENGINEERING_WORKER_ENABLED=true
export ENGINEERING_DRY_RUN=true
```

Optional bounded controls: `ENGINEERING_MAX_TASKS_PER_DAY` (default 3), `ENGINEERING_MAX_AGENT_RUNS_PER_TASK` (6), `ENGINEERING_MAX_FIX_ATTEMPTS` (3), `ENGINEERING_MAX_CI_FIX_ATTEMPTS` (2), `ENGINEERING_MAX_CHANGED_FILES` (30), `ENGINEERING_MAX_DIFF_LINES` (2000), `ENGINEERING_LEASE_MS` (30 minutes), and `ENGINEERING_POLL_INTERVAL_MS` (60 seconds). Concurrency is fixed at one in this foundation.

The service/account values are non-secret identifiers. Supported credential names are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`; only the configured one is injected. Do not export the API key from `.zshrc` or `.bash_profile`.

The agent command is one executable, while `ENGINEERING_AGENT_ARGS_JSON` is a JSON string array. Issue title/body is passed over stdin inside explicit untrusted-data delimiters; it is never interpolated into a shell command. The child gets the worktree as cwd, an isolated HOME under that worktree, and an allowlisted environment without GitHub credentials.

## ChatGPT authentication mode

For a single-user local macOS worker, use Codex ChatGPT OAuth without injecting an API key:

```bash
export ENGINEERING_AGENT_AUTH_MODE=chatgpt
export ENGINEERING_CODEX_HOME="$HOME/ai-company-worker/codex-home"
mkdir -p "$ENGINEERING_CODEX_HOME"
chmod 700 "$ENGINEERING_CODEX_HOME"
cat > "$ENGINEERING_CODEX_HOME/config.toml" <<'EOF'
forced_login_method = "chatgpt"
cli_auth_credentials_store = "keyring"
EOF
CODEX_HOME="$ENGINEERING_CODEX_HOME" codex login
CODEX_HOME="$ENGINEERING_CODEX_HOME" codex login status
```

In `chatgpt` mode the Codex launcher receives the real macOS HOME only so Security.framework can resolve the login Keychain. Commands launched by Codex do not inherit that HOME. They execute with an isolated worktree HOME and an explicit environment allowlist configured via Codex `shell_environment_policy` arguments. Do not symlink `~/Library/Keychains` into a worktree.

The coding-agent process receives `CODEX_HOME` but no provider API key, GitHub token, or OAuth token. The existing `api_key` mode remains available for server/CI use and continues to use the macOS Keychain provider.

## Credential lifecycle

The helper invokes the macOS `security` secure prompt with `-w` as its final option. The secret is entered into that prompt, not passed as a command argument or stored in shell history/a file.

```bash
cd "$ENGINEERING_REPO_DIR/ai-secretary"

# Initial install (secure Keychain prompt)
bash ops/macos/manage-engineering-credential.sh install

# Availability only; never prints the value
bash ops/macos/manage-engineering-credential.sh verify

# Replace the value using another secure prompt
bash ops/macos/manage-engineering-credential.sh rotate

# Remove this MacBook's local copy
bash ops/macos/manage-engineering-credential.sh remove
```

Also revoke or rotate the provider-side API key when retiring or losing the MacBook. Keychain removal only removes the local copy.

## First run and commands

Start with diagnostics and dry run:

```bash
cd "$ENGINEERING_REPO_DIR/ai-secretary"
npm run engineering:doctor
ENGINEERING_DRY_RUN=true npm run engineering:once
```

Dry run may fetch/normalize an issue and produce a plan artifact, but does not mutate issues, create a branch, push, or open a PR. Then enable a single live run:

```bash
ENGINEERING_DRY_RUN=false npm run engineering:once
```

Operational commands:

```bash
npm run engineering:daemon
npm run engineering:status
npm run test:engineering
```

State is atomically written under `$ENGINEERING_WORKSPACE_DIR/state`; audit logs are JSONL under `logs`; plans/reviews are under `artifacts`; task worktrees are under `worktrees`. Secret-shaped values and known credential environment values are redacted before persistence. Never post raw logs or model reasoning to GitHub.

## macOS launchd

Use the per-user LaunchAgent template; a system LaunchDaemon and `sudo` are unnecessary and would broaden privileges. Review the generated plist before loading it:

```bash
cd "$ENGINEERING_REPO_DIR/ai-secretary"
ENGINEERING_PROJECT_DIR="$ENGINEERING_REPO_DIR/ai-secretary" \
ENGINEERING_WORKSPACE_DIR="$ENGINEERING_WORKSPACE_DIR" \
ENGINEERING_MACHINE_ID=home-mac \
bash ops/macos/install-engineering-worker.sh render

ENGINEERING_MACHINE_ID=home-mac bash ops/macos/install-engineering-worker.sh install
```

On the mobile Mac use the same commands with `ENGINEERING_MACHINE_ID=mobile-mac`. The ID is stored in the plist because it is not a secret. Both LaunchAgents may remain loaded.

Use the operator helper to inspect or change the shared control plane:

```bash
bash ops/macos/engineering-worker-machine.sh status
bash ops/macos/engineering-worker-machine.sh off
bash ops/macos/engineering-worker-machine.sh activate home-mac
bash ops/macos/engineering-worker-machine.sh activate mobile-mac
```

Safe switching protocol:

1. Run `bash ops/macos/engineering-worker-machine.sh off`.
2. Use `status` and confirm there is no open `ai-running` issue. If there is one, confirm that the old worker has stopped and reconcile its preserved state/worktree.
3. Run `activate <target-machine>`.
4. The target starts on its next poll; an old machine waking later remains STANDBY.

Do not use `worker-state.json`, worktrees, audit logs, artifacts, or LaunchAgent state as a global lock. They are machine-local. The GitHub variable is the shared authority.

The helper never embeds secrets. Run `engineering:doctor` as the same dedicated macOS user before installation; it verifies both `gh auth` and Keychain retrieval with a launchd-compatible minimal environment that does not load shell profiles. View status with `launchctl print "gui/$(id -u)/com.ai-company.engineering-worker"`. Disable/uninstall with `bash ops/macos/install-engineering-worker.sh uninstall`; durable state/worktrees are retained for recovery and must be removed manually after review.

## Recovery and kill switch

Create `$ENGINEERING_WORKSPACE_DIR/state/STOP` for a machine-local emergency halt (checked before each task and during CI monitoring), or set `ENGINEERING_WORKER_ENABLED=false` and restart/stop the LaunchAgent. `STOP` is independent of the shared GitHub active-machine control: either stop condition prevents work. Remove the file only after review. A stale lease is not blindly resumed: the task is moved to `BLOCKED` with `STALE_LEASE_REQUIRES_RECONCILIATION`, the claim label is released, and a human must compare local branch/worktree/PR state before retrying. `engineering:status` shows the issue, branch, last step, attempts, PR, failure reason, and heartbeat.

For recovery, first keep the kill switch off, inspect status and `$ENGINEERING_WORKSPACE_DIR`, then check the GitHub issue/branch/PR. Preserve useful changes, remove only a confirmed-abandoned worktree with normal Git worktree commands, and re-enable the issue only after reconciling state. The worker never falls back to pushing `main`.
