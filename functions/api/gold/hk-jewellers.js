const SNAPSHOT_TTL_SECONDS = 1800;
const SOURCE_URL = 'https://www.hkgoldking.com/?lang=zh';
const FETCH_URLS = [
  SOURCE_URL,
  'https://r.jina.ai/http://www.hkgoldking.com/?lang=zh',
  'https://r.jina.ai/http://www.hkgoldking.com/',
];
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';
const FALLBACK_SNAPSHOT = {
  ok: true,
  source: 'hkgoldking-fallback',
  source_url: SOURCE_URL,
  fetched_via: 'embedded-fallback',
  date: '2026-05-21',
  updated_at: '2026-05-21 12:00:23',
  unit: 'HKD/tael',
  stale: true,
  shops: [
    { key: 'chow_tai_fook', name: '周大福', buy_hkd_tael: 41090, sell_hkd_tael: 51360, source: 'hkgoldking-fallback', source_url: SOURCE_URL },
    { key: 'chow_sang_sang', name: '周生生', buy_hkd_tael: 41090, sell_hkd_tael: 51360, source: 'hkgoldking-fallback', source_url: SOURCE_URL },
    { key: 'lukfook', name: '六福', buy_hkd_tael: 41591, sell_hkd_tael: 51356, source: 'hkgoldking-fallback', source_url: SOURCE_URL },
  ],
};

const SHOPS = [
  { key: 'chow_tai_fook', name: '周大福', aliases: ['周大福'] },
  { key: 'chow_sang_sang', name: '周生生', aliases: ['周生生'] },
  { key: 'lukfook', name: '六福', aliases: ['六福'] },
];

function asNumber(text) {
  const n = Number(String(text || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseShop(markdown, aliases) {
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:\\n|$)[\\s\\S]{0,120}?賣出價:\\s*\\*\\*HK\\$(\\d[\\d,]*)\\*\\*[\\s\\S]{0,80}?買入價:\\s*\\*\\*HK\\$(\\d[\\d,]*)\\*\\*`, 'i');
    const m = markdown.match(re);
    if (m) {
      return {
        sell_hkd_tael: asNumber(m[1]),
        buy_hkd_tael: asNumber(m[2]),
      };
    }
  }
  return null;
}

function parsePayload(markdown) {
  const updatedAt = markdown.match(/最後更新時間:\s*([0-9:\- ]{10,19})/i)?.[1]?.trim() || null;
  const pageDate = markdown.match(/香港最新飾金價\s*\((\d{4}-\d{2}-\d{2})\)/)?.[1] || null;
  const shops = SHOPS.map((shop) => {
    const found = parseShop(markdown, shop.aliases);
    return {
      key: shop.key,
      name: shop.name,
      buy_hkd_tael: found?.buy_hkd_tael ?? null,
      sell_hkd_tael: found?.sell_hkd_tael ?? null,
      source: 'hkgoldking',
      source_url: SOURCE_URL,
    };
  });
  return {
    ok: shops.some((s) => s.buy_hkd_tael || s.sell_hkd_tael),
    source: 'hkgoldking',
    source_url: SOURCE_URL,
    fetched_via: 'markdown.new',
    date: pageDate,
    updated_at: updatedAt,
    unit: 'HKD/tael',
    shops,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/__snapshot/gold/hk-jewellers`);
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-snapshot-cache', 'HIT');
      headers.set('access-control-allow-origin', '*');
      return new Response(cached.body, { status: cached.status, headers });
    }

    let markdown = '';
    let fetchedVia = null;
    let lastError = null;

    for (const fetchUrl of FETCH_URLS) {
      try {
        const upstream = await fetch(fetchUrl, {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,text/markdown,text/plain;q=0.9,*/*;q=0.8',
          },
        });
        if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
        const text = await upstream.text();
        const candidate = parsePayload(text);
        if (candidate.ok) {
          markdown = text;
          fetchedVia = fetchUrl;
          break;
        }
        throw new Error('parse failed');
      } catch (error) {
        lastError = error;
      }
    }

    if (!markdown) {
      throw new Error(lastError instanceof Error ? lastError.message : 'failed to fetch jeweller prices');
    }

    const payload = parsePayload(markdown);
    if (!payload.ok) throw new Error('failed to parse jeweller prices');
    payload.snapshot_at = new Date().toISOString();
    payload.snapshot_ttl_seconds = SNAPSHOT_TTL_SECONDS;
    payload.fetched_via = fetchedVia;

    const body = JSON.stringify(payload, null, 2);
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${SNAPSHOT_TTL_SECONDS}`,
      'access-control-allow-origin': '*',
      'x-snapshot-cache': 'MISS',
    });
    const response = new Response(body, { headers });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const fallback = {
      ...FALLBACK_SNAPSHOT,
      fallback_reason: error instanceof Error ? error.message : String(error),
      snapshot_at: new Date().toISOString(),
      snapshot_ttl_seconds: SNAPSHOT_TTL_SECONDS,
    };
    return new Response(JSON.stringify(fallback, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=0, s-maxage=${SNAPSHOT_TTL_SECONDS}`,
        'access-control-allow-origin': '*',
        'x-snapshot-cache': 'FALLBACK',
      },
    });
  }
}
