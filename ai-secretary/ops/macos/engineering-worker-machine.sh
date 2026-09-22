#!/usr/bin/env bash
set -euo pipefail

repository="${ENGINEERING_REPOSITORY:-h1maekawa/ai-company}"
label="com.ai-company.engineering-worker"
plist="${HOME}/Library/LaunchAgents/${label}.plist"

usage() {
  echo "Usage: $0 <status|off|activate MACHINE_ID>" >&2
  exit 2
}

read_active() {
  if value="$(gh variable get ENGINEERING_ACTIVE_MACHINE --repo "$repository" 2>/dev/null)"; then
    printf '%s\n' "$value"
    return
  fi
  gh api "repos/${repository}/actions/variables/ENGINEERING_ACTIVE_MACHINE" --jq .value
}

set_active() {
  if gh variable set ENGINEERING_ACTIVE_MACHINE --repo "$repository" --body "$1" 2>/dev/null; then
    return
  fi
  if gh api "repos/${repository}/actions/variables/ENGINEERING_ACTIVE_MACHINE" >/dev/null 2>&1; then
    gh api --method PATCH "repos/${repository}/actions/variables/ENGINEERING_ACTIVE_MACHINE" -f name=ENGINEERING_ACTIVE_MACHINE -f value="$1" >/dev/null
  else
    gh api --method POST "repos/${repository}/actions/variables" -f name=ENGINEERING_ACTIVE_MACHINE -f value="$1" >/dev/null
  fi
}

local_machine_id() {
  if [[ -n "${ENGINEERING_MACHINE_ID:-}" ]]; then
    printf '%s\n' "$ENGINEERING_MACHINE_ID"
  elif [[ -f "$plist" ]]; then
    /usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:ENGINEERING_MACHINE_ID' "$plist" 2>/dev/null || true
  fi
}

validate_machine_id() {
  local candidate="$1"
  if [[ ! "$candidate" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ || "$candidate" == "none" ]]; then
    echo "Invalid machine ID. Use 1-64 letters, digits, dot, underscore, or hyphen; 'none' is reserved." >&2
    exit 2
  fi
}

case "${1:-}" in
  status)
    active="$(read_active)"
    local_id="$(local_machine_id)"
    if [[ -n "$local_id" && "$active" == "$local_id" ]]; then mode="ACTIVE"; else mode="STANDBY"; fi
    running="$(gh issue list --repo "$repository" --state open --label ai-running --limit 100 --json number,title --jq '.[] | "#\(.number) \(.title)"')"
    if launchctl print "gui/$(id -u)/${label}" >/dev/null 2>&1; then launch_status="loaded"; else launch_status="not loaded"; fi
    printf 'Configured active machine: %s\n' "$active"
    printf 'Local machine ID: %s\n' "${local_id:-UNCONFIGURED}"
    printf 'Worker mode: %s\n' "$mode"
    printf 'Open ai-running Issue: %s\n' "${running:-none}"
    printf 'LaunchAgent status: %s\n' "$launch_status"
    ;;
  off)
    set_active none
    echo "All Engineering Workers are now STANDBY."
    ;;
  activate)
    [[ $# -eq 2 ]] || usage
    validate_machine_id "$2"
    set_active "$2"
    echo "Engineering active machine: $2"
    ;;
  *) usage ;;
esac
