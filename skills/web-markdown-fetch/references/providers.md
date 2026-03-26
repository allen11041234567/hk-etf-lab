# Providers

Use these providers in order:

1. `markdown.new/<url>`
   - Best first attempt for sites that already play well with Cloudflare-backed markdown rendering.
   - Good fit for many docs/blog pages.

2. `defuddle.md/<url>`
   - Second attempt when `markdown.new` does not return usable content.
   - Can still be blocked by some Cloudflare challenge pages.

3. `r.jina.ai/http://<url>`
   - Broad fallback that often works on ordinary pages.
   - May return cached snapshots.
   - Keep the original scheme when possible, e.g. `https://r.jina.ai/http://https://example.com`.

## Failure signs

Treat the attempt as failed when the returned body contains signs like:
- `Just a moment...`
- `Enable JavaScript and cookies to continue`
- Cloudflare challenge HTML
- Captcha or Access Denied pages
- Extremely short or empty bodies

## Last-resort options

If all three providers fail:

- Use `playwright-scraper` when the page needs JS rendering, interaction, login state, or anti-bot workarounds.
- Try Scrapling for difficult pages where simple HTTP prefixing is not enough.

Scrapling repo:
- `https://github.com/D4Vinci/Scrapling`
