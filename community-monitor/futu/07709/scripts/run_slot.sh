#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./run_slot.sh <slot> [email] [password]"
  exit 1
fi

SLOT="$1"
EMAIL="${2:-}"
PASSWORD="${3:-}"
TODAY="$(date -u +%F)"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then
  node capture_futu_community.mjs 07709 "$SLOT" "$EMAIL" "$PASSWORD"
else
  node capture_futu_community.mjs 07709 "$SLOT"
fi
node report_slot.mjs "$TODAY" "$SLOT"
