const LIVE_TTL_SECONDS = 900;
const STALE_TTL_SECONDS = 14400;
const CACHE_VERSION = 'v2';

const FEEDS = [
  {
    name: 'Yonhap',
    category: '韩国快讯',
    url: 'https://news.google.com/rss/search?q=site:en.yna.co.kr+(Korea+OR+KOSPI+OR+Samsung+OR+SK+Hynix)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Korea Herald',
    category: '市场与公司',
    url: 'https://news.google.com/rss/search?q=site:koreaherald.com+(Korea+market+OR+KOSPI+OR+Samsung+OR+SK+Hynix)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩国半导体',
    url: 'https://news.google.com/rss/search?q=(SK+Hynix+OR+Samsung+Electronics+OR+Korea+semiconductor+OR+memory+chip)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩股与韩元',
    url: 'https://news.google.com/rss/search?q=(KOSPI+OR+KOSDAQ+OR+South+Korea+won+OR+Bank+of+Korea)+when:2d&hl=en-US&gl=US&ceid=US:en',
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

function extractItems(xml, category, feedName) {
  const out = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of matches.slice(0, 12)) {
    const title = stripTags(firstTag(block, 'title'));
    const link = stripTags(firstTag(block, 'link'));
    const pubDate = stripTags(firstTag(block, 'pubDate'));
    const description = stripTags(firstTag(block, 'description'));
    const source = stripTags(firstTag(block, 'source')) || feedName || 'News';
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

function pickSource(item) {
  const text = `${item.source} ${item.title}`.toLowerCase();
  if (text.includes('yonhap') || text.includes('yna')) return 'Yonhap';
  if (text.includes('korea herald')) return 'Korea Herald';
  if (text.includes('reuters')) return 'Reuters';
  if (text.includes('cnbc')) return 'CNBC';
  return item.source || 'News';
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
  let score = 0;
  if (/yonhap|yna/.test(text)) score += 5;
  if (/korea herald/.test(text)) score += 4;
  if (/reuters|cnbc/.test(text)) score += 3;
  if (/sk hynix|hynix/.test(text)) score += 5;
  if (/samsung/.test(text)) score += 5;
  if (/korea|korean|kospi|kosdaq/.test(text)) score += 4;
  if (/chip|semiconductor|memory/.test(text)) score += 4;
  if (/won|bank of korea|export/.test(text)) score += 3;
  return score;
}

function toBeijingTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

function zhTitle(title = '') {
  let s = String(title);
  const replacements = [
    [/South Korea/gi, '韩国'],
    [/Korea/gi, '韩国'],
    [/Korean/gi, '韩国'],
    [/Samsung Electronics/gi, '三星电子'],
    [/Samsung/gi, '三星'],
    [/SK Hynix/gi, 'SK海力士'],
    [/Hynix/gi, '海力士'],
    [/KOSPI/gi, '韩国综合指数'],
    [/KOSDAQ/gi, '韩国创业板指数'],
    [/Bank of Korea/gi, '韩国央行'],
    [/won/gi, '韩元'],
    [/semiconductor/gi, '半导体'],
    [/memory chip/gi, '存储芯片'],
    [/memory/gi, '存储'],
    [/chip/gi, '芯片'],
    [/shares/gi, '股价'],
    [/stock/gi, '股票'],
    [/market/gi, '市场'],
    [/exports/gi, '出口'],
    [/export/gi, '出口'],
    [/surge/gi, '走强'],
    [/rise/gi, '上升'],
    [/rises/gi, '上升'],
    [/falls/gi, '回落'],
    [/fall/gi, '回落'],
    [/jumps/gi, '走高'],
    [/jump/gi, '走高'],
    [/rally/gi, '走强'],
    [/slump/gi, '走弱'],
  ];
  for (const [pattern, replacement] of replacements) s = s.replace(pattern, replacement);
  s = s.replace(/\s*[-|–—]\s*[^-|–—]+$/, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
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
  return extractItems(xml, feed.category, feed.name);
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
    }).sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, 18).map((item) => ({
      ...item,
      source: pickSource(item),
      time: toBeijingTime(item.time),
      zhTitle: zhTitle(item.title),
    }));

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
