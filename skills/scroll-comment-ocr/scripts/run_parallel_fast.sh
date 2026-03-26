#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: run_parallel_fast.sh <video.mp4> <workdir> <preset> [parts] [fps] [python_bin]" >&2
  exit 1
fi

VIDEO="$1"
WORKDIR="$2"
PRESET="$3"
PARTS="${4:-6}"
FPS="${5:-2}"
PYBIN="${6:-/root/.openclaw/workspace/.venv-ocr/bin/python}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$WORKDIR/chunks" "$WORKDIR/raw"
"$PYBIN" "$SCRIPT_DIR/split_video.py" "$VIDEO" "$WORKDIR/chunks" --parts "$PARTS"

process_part() {
  local part="$1"
  local base
  base="$(basename "$part" .mp4)"
  "$PYBIN" "$SCRIPT_DIR/extract_frames.py" "$part" "$WORKDIR/${base}_frames" --fps "$FPS"
  "$PYBIN" "$SCRIPT_DIR/filter_similar_frames.py" "$WORKDIR/${base}_frames" "$WORKDIR/${base}_filtered" --threshold 8 >/dev/null
  "$PYBIN" "$SCRIPT_DIR/crop_comment_band.py" "$WORKDIR/${base}_filtered" "$WORKDIR/${base}_crops" --preset "$PRESET"
  "$PYBIN" "$SCRIPT_DIR/ocr_frames.py" "$WORKDIR/${base}_crops" "$WORKDIR/raw/${base}.txt" --format txt
}

export PYBIN SCRIPT_DIR WORKDIR PRESET FPS
export -f process_part
find "$WORKDIR/chunks" -name 'part_*.mp4' | sort | xargs -I{} -P "$PARTS" bash -lc 'process_part "$@"' _ {}

"$PYBIN" "$SCRIPT_DIR/merge_raw_dump.py" "$WORKDIR/final_raw_dump.txt" "$WORKDIR"/raw/part_*.txt
echo "$WORKDIR/final_raw_dump.txt"
