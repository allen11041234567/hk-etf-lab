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

### 2) Build one slot report immediately

```bash
node report_slot.mjs YYYY-MM-DD 1200
```

Output:
- `../YYYY-MM-DD/reports/07709-YYYY-MM-DD-1200-report.md`

### 3) Run one slot end-to-end

Recommended: store credentials in `../credentials.json`:

```json
{
  "email": "your@email.com",
  "password": "your-password"
}
```

Then run:

```bash
./run_slot.sh 1200
```

You can still override credentials ad hoc:

```bash
./run_slot.sh 1200 <email> <password>
```

Outputs:
- `../YYYY-MM-DD/raw/<slot>.txt`
- `../YYYY-MM-DD/normalized/<slot>.json`
- `../YYYY-MM-DD/reports/07709-YYYY-MM-DD-<slot>-report.md`

### 4) Merge one day (optional)

```bash
node merge_daily.mjs YYYY-MM-DD
```

Output:
- `../YYYY-MM-DD/daily/merged.json`

### 5) Build day report (optional)

```bash
node report_daily.mjs YYYY-MM-DD
```

Output:
- `../YYYY-MM-DD/reports/07709-YYYY-MM-DD-report.md`

## Suggested schedule

- 06:00 → run one slot + produce 06:00 report
- 12:00 → run one slot + produce 12:00 report
- 18:00 → run one slot + produce 18:00 report
- 24:00 → run one slot + produce 24:00 report

Daily merge/report is optional if you still want an end-of-day combined view.

## Multi-symbol mode

A shared config lives at:

```bash
community-monitor/futu/config.json
```

And a shared runner lives at:

```bash
community-monitor/futu/scripts/run_all_symbols.sh
```

Example:

```bash
cd community-monitor/futu/scripts
./run_all_symbols.sh 1200
```

This will iterate through all configured symbols and call each symbol's `run_slot.sh`.

## Safety notes

- Read-only only; do not like/comment/post.
- Keep low frequency and gentle scrolling.
- Expect coverage to be high but not mathematically guaranteed full.
