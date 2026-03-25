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

SYMBOL="$(cd .. && basename "$PWD")"

capture_once() {
  if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then
    node capture_futu_community.mjs "$SYMBOL" "$SLOT" "$EMAIL" "$PASSWORD"
  else
    node capture_futu_community.mjs "$SYMBOL" "$SLOT"
  fi
}

attempt=1
max_attempts=2
until capture_once; do
  if [[ "$attempt" -ge "$max_attempts" ]]; then
    exit 1
  fi
  echo "capture attempt $attempt failed for slot $SLOT, retrying..." >&2
  attempt=$((attempt + 1))
  sleep 8
done

node report_slot.mjs "$TODAY" "$SLOT" "$SYMBOL"
node render_full_report.mjs "$TODAY" "$SLOT"
