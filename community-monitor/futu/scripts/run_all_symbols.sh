#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./run_all_symbols.sh <slot>"
  exit 1
fi

SLOT="$1"
BASE_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
CONFIG="$BASE_DIR/config.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing config: $CONFIG"
  exit 1
fi

SYMBOLS=$(node -e "const fs=require('fs');const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const s of cfg.symbols||[]) console.log(s.symbol)" "$CONFIG")

while IFS= read -r SYMBOL; do
  [[ -z "$SYMBOL" ]] && continue
  SCRIPT_DIR="$BASE_DIR/$SYMBOL/scripts"
  if [[ -x "$SCRIPT_DIR/run_slot.sh" ]]; then
    echo "== Running $SYMBOL $SLOT =="
    (cd "$SCRIPT_DIR" && ./run_slot.sh "$SLOT")
  else
    echo "Skip $SYMBOL: missing run_slot.sh"
  fi
done <<< "$SYMBOLS"
