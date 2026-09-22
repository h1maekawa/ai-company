#!/usr/bin/env bash
set -euo pipefail

action="${1:-render}"
project_dir="${ENGINEERING_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
workspace_dir="${ENGINEERING_WORKSPACE_DIR:-$HOME/ai-company-worker}"
repo_dir="${ENGINEERING_REPO_DIR:-$(cd "$project_dir/.." && pwd)}"
template="$project_dir/ops/macos/com.ai-company.engineering-worker.plist.template"
target="$HOME/Library/LaunchAgents/com.ai-company.engineering-worker.plist"
rendered="${TMPDIR:-/tmp}/com.ai-company.engineering-worker.$$.plist"
worker_path="${ENGINEERING_WORKER_PATH:-$PATH}"
home_dir="$HOME"
agent_auth_mode="${ENGINEERING_AGENT_AUTH_MODE:-api_key}"
codex_home="${ENGINEERING_CODEX_HOME:-$workspace_dir/codex-home}"
machine_id="${ENGINEERING_MACHINE_ID:-}"

if [[ -z "$machine_id" ]]; then
  echo "ENGINEERING_MACHINE_ID is required (for example: home-mac or mobile-mac)." >&2
  exit 2
fi
if [[ ! "$machine_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ || "$machine_id" == "none" ]]; then
  echo "ENGINEERING_MACHINE_ID must be 1-64 safe identifier characters and must not be 'none'." >&2
  exit 2
fi

escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__PROJECT_DIR__|$(escape_sed "$project_dir")|g" \
  -e "s|__WORKSPACE_DIR__|$(escape_sed "$workspace_dir")|g" \
  -e "s|__REPO_DIR__|$(escape_sed "$repo_dir")|g" \
  -e "s|__MACHINE_ID__|$(escape_sed "$machine_id")|g" \
  -e "s|__PATH__|$(escape_sed "$worker_path")|g" \
  -e "s|__HOME_DIR__|$(escape_sed "$home_dir")|g" \
  -e "s|__AGENT_AUTH_MODE__|$(escape_sed "$agent_auth_mode")|g" \
  -e "s|__CODEX_HOME__|$(escape_sed "$codex_home")|g" \
  "$template" > "$rendered"

case "$action" in
  render)
    echo "Rendered non-secret LaunchAgent: $rendered"
    plutil -lint "$rendered"
    echo "Review it, then run this helper with 'install'."
    ;;
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$workspace_dir/logs"
    install -m 600 "$rendered" "$target"
    plutil -lint "$target"
    launchctl bootout "gui/$(id -u)/com.ai-company.engineering-worker" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$target"
    echo "Installed and started: $target"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/com.ai-company.engineering-worker" 2>/dev/null || true
    if [[ -f "$target" ]]; then mv "$target" "$target.disabled"; fi
    echo "Disabled. State and worktrees were retained at: $workspace_dir"
    ;;
  *) echo "Usage: $0 <render|install|uninstall>" >&2; exit 2 ;;
esac
