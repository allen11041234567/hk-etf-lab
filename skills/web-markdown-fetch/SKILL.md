---
name: web-markdown-fetch
description: Fetch web pages through markdown-conversion proxy services before using heavier scrapers. Use when a user asks to browse the web, read an article or page as markdown/text, or quickly extract readable content from a URL. Workflow: try `markdown.new/URL` first, then `defuddle.md/URL`, then `r.jina.ai/http://URL`. If those fail or return block/challenge HTML, fall back to Scrapling or the existing `playwright-scraper` skill for JS-heavy, protected, or interactive sites.
---

# Web Markdown Fetch

Fetch readable page content with the lightest method first.

## Workflow

1. Run `scripts/fetch_markdown.py <url-or-text> --json`.
2. Let the script extract the first URL if the input contains surrounding text.
3. Accept the first provider that returns substantial readable text.
4. Reject responses that are challenge pages, captcha pages, empty shells, or obviously blocked HTML.
5. If all providers fail:
   - use `playwright-scraper` for JS-heavy / anti-bot / login-dependent pages;
   - consider Scrapling when a dedicated scraping library is preferable.

Read `references/providers.md` only when you need provider-specific behavior or failure signs.

## Run

Basic usage:

```bash
python {baseDir}/scripts/fetch_markdown.py "https://developers.cloudflare.com/" --json
```

Input may also be a sentence containing a URL:

```bash
python {baseDir}/scripts/fetch_markdown.py "帮我读一下 https://example.com 这篇页面" --json
```

With Playwright fallback from the existing workspace skill:

```bash
python {baseDir}/scripts/fetch_markdown.py \
  "https://target.example/page" \
  --json \
  --playwright-script /root/.openclaw/workspace/skills/playwright-scraper/scripts/playwright-stealth.js
```

## Output

Expect JSON with:
- `ok`
- `provider`
- `target_url`
- `fetch_url` when a markdown proxy succeeded
- `title`
- `is_cached_snapshot`
- `summary`
- `attempts` with each tried provider and why it passed/failed
- `content` containing the returned markdown/text

## Rules

- Prefer the proxy order exactly as: `markdown.new` → `defuddle.md` → `r.jina.ai`.
- Do not jump to browser automation unless simpler providers fail or the task clearly requires JS/login interaction.
- Summarize long content instead of dumping entire pages into chat.
- Mention when `r.jina.ai` appears to return a cached snapshot.
- When a site is still blocked after all three providers, say so plainly and switch to a heavier scraper.
