---
name: playwright-scraper
description: Scrape JavaScript-heavy or anti-bot-protected web pages with Playwright and stealth mode. Use when a normal HTTP fetch returns incomplete HTML, a site requires JS rendering, or you need browser-style page extraction for a specific URL.
---

# Playwright Scraper

Use this skill when a target page does not expose useful content through plain HTTP requests.

## Run

Use the bundled script:

```bash
node {baseDir}/scripts/playwright-stealth.js "<url>"
```

Optional flags:

```bash
node {baseDir}/scripts/playwright-stealth.js "<url>" --wait 5000 --timeout 30000
```

## Output

The script returns JSON with:
- `url`
- `title`
- `finalUrl`
- `content`
- `htmlLength`

## Notes

- Prefer this skill only when simpler fetch methods fail.
- Expect some sites to still block automated browsers.
- For large pages, summarize `content` instead of pasting everything.
