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

escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__PROJECT_DIR__|$(escape_sed "$project_dir")|g" \
  -e "s|__WORKSPACE_DIR__|$(escape_sed "$workspace_dir")|g" \
  -e "s|__REPO_DIR__|$(escape_sed "$repo_dir")|g" \
  -e "s|__PATH__|$(escape_sed "$worker_path")|g" \
  -e "s|__HOME_DIR__|$(escape_sed "$home_dir")|g" \
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
