const SOURCE_URL = 'https://www.trumpstruth.org/?sort=desc&per_page=12&removed=include';
const CACHE_SECONDS = 120;
const STALE_SECONDS = 600;

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function decodeHtml(str = '') {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x20;/g, ' ')
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(str = '') {
  return decodeHtml(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function extractPosts(html) {
  const statusesBlock = html.match(/<div class="statuses">([\s\S]*?)<div class="pagination controls__pagination">/i)?.[1] || html;
  const chunks = statusesBlock.split(/<div class="status"\s+data-status-url=/i).slice(1);
  return chunks.slice(0, 12).map((chunk) => {
    const statusUrl = chunk.match(/^"([^"]+)"/)?.[1]?.trim() || null;
    const permalink = chunk.match(/class="status-info__meta-item">([^<]+)<\/a>\s*<\/div>/i)?.[1]?.trim() || null;
    const originalUrl = chunk.match(/href="(https:\/\/truthsocial\.com\/@realDonaldTrump\/[^"]+)"[^>]*class="status__external-link"/i)?.[1] || null;
    const avatar = chunk.match(/<img src="([^"]+)"[^>]*class="status-info__avatar"/i)?.[1] || null;
    const contentHtml = chunk.match(/<div class="status__content">([\s\S]*?)<\/div>/i)?.[1] || '';
    const content = stripTags(contentHtml);
    const createdAtText = permalink || null;
    const createdAt = createdAtText ? new Date(createdAtText).toISOString() : null;
    return {
      status_url: statusUrl,
      url: originalUrl,
      avatar,
      created_at: createdAt,
      created_at_text: createdAtText,
      content,
      content_html: contentHtml,
    };
  }).filter((post) => post.content || post.url);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const resHeaders = new Headers(cached.headers);
      resHeaders.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: resHeaders });
    }

    const upstream = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const html = await upstream.text();
    const posts = extractPosts(html);
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: posts.length,
      source: 'trumpstruth.org',
      posts,
    });

    const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${CACHE_SECONDS}`, 'MISS') });
    const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_SECONDS}`, 'WARM') });
    context.waitUntil(Promise.all([
      cache.put(liveKey, liveRes.clone()),
      cache.put(staleKey, staleRes.clone()),
    ]));
    return liveRes;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const resHeaders = new Headers(stale.headers);
      resHeaders.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: resHeaders });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: headers('no-store', 'ERROR'),
    });
  }
}
