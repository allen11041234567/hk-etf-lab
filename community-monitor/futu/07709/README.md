# Futu 07709 Community Monitor

This folder stores a first-pass prototype for capturing Futu community discussion for `07709` in multiple daily windows and combining them into a daily report.

## Scripts

Run from `community-monitor/futu/07709/scripts/`.

### 1) Capture one window

```bash
node capture_futu_community.mjs 07709 1200 <email> <password>
```

Outputs:
- `../YYYY-MM-DD/raw/<slot>.txt`
- `../YYYY-MM-DD/normalized/<slot>.json`

### 2) Merge one day

```bash
node merge_daily.mjs YYYY-MM-DD
```

Output:
- `../YYYY-MM-DD/daily/merged.json`

### 3) Build report

```bash
node report_daily.mjs YYYY-MM-DD
```

Output:
- `../YYYY-MM-DD/reports/07709-YYYY-MM-DD-report.md`

## Suggested schedule

- 06:00
- 12:00
- 18:00
- 24:00

Capture each window, then run merge + report after the final window.

## Safety notes

- Read-only only; do not like/comment/post.
- Keep low frequency and gentle scrolling.
- Expect coverage to be high but not mathematically guaranteed full.
