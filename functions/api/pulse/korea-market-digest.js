const LIVE_TTL_SECONDS = 900;
const STALE_TTL_SECONDS = 14400;
const CACHE_VERSION = 'v1';

const FEEDS = [
  {
    name: 'Google News',
    category: '韩国市场',
    url: 'https://news.google.com/rss/search?q=KOSPI+OR+Korea+market+OR+Samsung+Electronics+OR+SK+Hynix+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩国半导体',
    url: 'https://news.google.com/rss/search?q=Korea+semiconductor+OR+memory+chip+OR+SK+Hynix+OR+Samsung+chip+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩元与宏观',
    url: 'https://news.google.com/rss/search?q=South+Korea+won+OR+Bank+of+Korea+OR+Korean+exports+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
];

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function stripCdata(text = '') {
  return String(text).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeXml(text = '') {
  return stripCdata(String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"));
}

function stripTags(text = '') {
  return decodeXml(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

function extractItems(xml, category) {
  const out = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of matches.slice(0, 12)) {
    const title = stripTags(firstTag(block, 'title'));
    const link = stripTags(firstTag(block, 'link'));
    const pubDate = stripTags(firstTag(block, 'pubDate'));
    const description = stripTags(firstTag(block, 'description'));
    const source = stripTags(firstTag(block, 'source')) || 'News';
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      time: pubDate,
      source,
      category,
      summary: description || title,
    });
  }
  return out;
}

function normalizeText(s = '') {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  let score = 0;
  if (/sk hynix|hynix/.test(text)) score += 5;
  if (/samsung/.test(text)) score += 5;
  if (/korea|korean|kospi|kosdaq/.test(text)) score += 4;
  if (/chip|semiconductor|memory/.test(text)) score += 4;
  if (/won|bank of korea|export/.test(text)) score += 3;
  if (/etf/.test(text)) score += 1;
  return score;
}

async function fetchFeed(feed) {
  const resp = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`feed ${resp.status} for ${feed.name}`);
  const xml = await resp.text();
  return extractItems(xml, feed.category);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    for (const result of results) {
      if (result.status === 'fulfilled') items.push(...result.value);
    }

    const seen = new Set();
    const deduped = items.filter((item) => {
      const key = normalizeText(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, 12);

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      itemCount: deduped.length,
      items: deduped,
    });

    const liveRes = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS'),
    });
    const staleRes = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
    });

    context.waitUntil(Promise.all([
      cache.put(liveKey, liveRes.clone()),
      cache.put(staleKey, staleRes.clone()),
    ]));
    return liveRes;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: h });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: headers('no-store', 'ERROR'),
    });
  }
}
