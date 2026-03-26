---
name: scroll-comment-ocr
description: Extract comments and replies from scrolling comment-section screen recordings as fast raw OCR output. Use when a user provides a screen recording from a social feed, forum, stock app, or comment thread and wants fast high-recall text extraction with duplicates/noise allowed. Prioritize coverage and speed over cleanliness and structure. Best for requests like “comments + replies only”, “raw dump first”, “deliver within minutes”, and parallel chunked OCR workflows.
---

# Scroll Comment OCR

Extract text from scrolling comment videos fast. Optimize for **coverage first** and **speed first**.

## Workflow

### 1. Pick the right mode

Use this skill when the input is a screen recording of comments/replies and the user wants a fast rough dump.

Default output priorities:
- Keep comments/replies text
- Allow duplicates
- Allow OCR mistakes
- Allow some UI noise if that makes extraction faster
- Deliver batches early instead of waiting for perfect cleanup

### 2. Decide the target quality

Use one of these modes:

- **极速版**: raw dump only, minimal filtering, fastest delivery
- **补全版**: more frames, more OCR, still rough
- **整理版**: optional later pass; outside the 5-minute target

For urgent delivery, prefer **极速版**.

### 3. Recommend recording style

Before processing, tell the user to:
- keep comment text large on screen
- scroll in one direction only
- pause ~0.5–1.0s per screen
- avoid popups/keyboards/notifications
- record main comments and expanded replies in separate videos when possible

If the user already sent a video, continue with best effort.

### 4. Run the fast pipeline

Preferred pipeline:
1. Split video into 4–6 time chunks for parallel work when resources allow
2. Extract frames at 2–2.5 fps for the fast path
3. Filter out near-duplicate frames before OCR
4. Crop the comment text band instead of OCRing the whole screen
5. OCR each cropped frame
6. Merge outputs in time order
7. Send batches early; do not wait for perfect cleanup

## Minimal scripts

Use these bundled scripts as the default building blocks:

- `scripts/split_video.py` — split one video into equal time chunks
- `scripts/extract_frames.py` — extract frames with ffmpeg
- `scripts/filter_similar_frames.py` — drop near-duplicate consecutive frames before OCR
- `scripts/crop_comment_band.py` — crop likely comment area using presets
- `scripts/ocr_frames.py` — OCR frames/crops into raw txt or jsonl
- `scripts/merge_raw_dump.py` — merge chunk outputs in time order
- `scripts/run_openclaw_parallel.py` — Python orchestrator for chunked parallel processing

## Fast-path commands

### Split into 6 chunks

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/split_video.py input.mp4 output/chunks --parts 6
```

### Extract frames from one chunk

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/extract_frames.py output/chunks/part_01.mp4 output/frames_01 --fps 2
```

### Filter similar frames

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/filter_similar_frames.py output/frames_01 output/filtered_01 --threshold 8
```

### Crop likely comment band

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/crop_comment_band.py output/filtered_01 output/crops_01 --preset futu
```

When tuning Futu quickly, override the preset directly:

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/crop_comment_band.py output/filtered_01 output/crops_01 --preset futu --left 0.03 --top 0.19 --right 0.92 --bottom 0.86
```

### OCR to raw dump

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/ocr_frames.py output/crops_01 output/raw_01.txt --format txt
```

### Merge raw dumps

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/merge_raw_dump.py output/final.txt output/raw_01.txt output/raw_02.txt output/raw_03.txt
```

### One-command fast run

```bash
bash skills/scroll-comment-ocr/scripts/run_parallel_fast.sh input.mp4 output futu 6 2 /root/.openclaw/workspace/.venv-ocr/bin/python
```

### Python orchestrator

```bash
/root/.openclaw/workspace/.venv-ocr/bin/python skills/scroll-comment-ocr/scripts/run_openclaw_parallel.py input.mp4 output --preset futu --parts 4 --fps 2 --threshold 8
```

This writes `output/status.json` with:
- `progressPercent`
- `progressBar`
- `doneDurationSec` / `totalDurationSec`
- `etaSec`
- `currentPart`

## Runtime requirements

- `ffmpeg` and `ffprobe` must be available on PATH
- OCR scripts need Python with `rapidocr_onnxruntime` and `Pillow`
- In this workspace, prefer `/root/.openclaw/workspace/.venv-ocr/bin/python`

## Operational rules

- For “5 minutes or less” targets, do **not** do heavy dedupe or structural cleanup.
- Prefer batching partial results back to the user over waiting for the final merged file.
- If OCR dependencies are missing, surface that immediately and fall back to chunk/frame extraction so setup can continue without blocking.
- If the machine is resource-constrained, reduce parallelism from 6 to 4 before reducing fps.
- If the text is too small, tell the user the recording method is the main bottleneck, not OCR.
- For Futu recordings, prefer the tighter `futu` preset first; widen only if comments are being clipped.

## References

Read `references/recording-sop.md` when you need to coach the user on how to record for faster extraction.
