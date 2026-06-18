const LIVE_TTL_SECONDS = 30;
const STALE_TTL_SECONDS = 300;
const TARGET_URL = 'https://inav.ice.com/api/1/csop/application/index/quote?symbol=3121&language=en';

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function findRow(rows, label) {
  return (rows || []).find((row) => row.label === label) || null;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/csop-3121-quote/live`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/csop-3121-quote/stale`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const resp = await fetch(TARGET_URL, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      },
    });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const data = await resp.json();
    const quote = data?.quote || {};
    const rows = quote.rows || [];
    const nav = findRow(rows, 'INTRA_DAY_ESTIMATED_NAV_PER_UNIT');
    const price = findRow(rows, 'INTRA_DAY_MARKET_PRICE');
    const premium = findRow(rows, 'PREMIUM_DISCOUNT');

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      symbol: '3121',
      timeZone: quote.timeZone || 'Asia/Hong_Kong',
      estimatedNav: nav ? {
        value: nav.values?.[0] || null,
        date: nav.date || null,
        time: nav.time || null,
      } : null,
      marketPrice: price ? {
        value: price.values?.[0] || null,
        date: price.date || null,
        time: price.time || null,
      } : null,
      premiumDiscount: premium ? {
        value: premium.values?.[0] || null,
        date: premium.date || null,
        time: premium.time || null,
      } : null,
    };

    const body = JSON.stringify(payload);
    const liveResponse = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    const staleResponse = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
    context.waitUntil(Promise.all([
      cache.put(liveCacheKey, liveResponse.clone()),
      cache.put(staleCacheKey, staleResponse.clone()),
    ]));
    return liveResponse;
  } catch (error) {
    const stale = await cache.match(staleCacheKey);
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
