#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
service="${ENGINEERING_KEYCHAIN_SERVICE:-ai-company-engineering-worker}"
account="${ENGINEERING_KEYCHAIN_ACCOUNT:-${ENGINEERING_AGENT_CREDENTIAL_NAME:-OPENAI_API_KEY}}"

case "$action" in
  install|rotate)
    echo "macOS Keychain will securely prompt for the $account credential."
    echo "The value is not accepted as an argument and is not written to a file."
    /usr/bin/security add-generic-password -U -a "$account" -s "$service" -T /usr/bin/security -w
    echo "Credential stored in the current user's login Keychain."
    ;;
  verify)
    if /usr/bin/security find-generic-password -a "$account" -s "$service" -w >/dev/null; then
      echo "PASS credential is available (value hidden)."
    else
      echo "FAIL credential is unavailable." >&2
      exit 1
    fi
    ;;
  remove)
    /usr/bin/security delete-generic-password -a "$account" -s "$service" >/dev/null
    echo "Credential removed from the current user's Keychain."
    ;;
  *)
    echo "Usage: $0 <install|verify|rotate|remove>" >&2
    exit 2
    ;;
esac
