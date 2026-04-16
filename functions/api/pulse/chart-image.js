const VALID_TYPES = new Set(['area', 'candle']);
const VALID_RANGES = new Set(['day', 'week', 'month']);
function pick(value, valid, fallback) {
  return valid.has(value) ? value : fallback;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const code = /^\d{6}$/.test(url.searchParams.get('code') || '') ? url.searchParams.get('code') : '000660';
  const requestedType = pick(url.searchParams.get('type') || 'area', VALID_TYPES, 'area');
  const range = pick(url.searchParams.get('range') || 'day', VALID_RANGES, 'day');
  const type = requestedType === 'area' && range === 'month' ? 'candle' : requestedType;
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__edge/pulse/chart?code=${code}&type=${type}&range=${range}`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/chart/stale?code=${code}&type=${type}&range=${range}`);

  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { status: cached.status, headers: cached.headers });

  const upstreamUrl = `https://ssl.pstatic.net/imgfinance/chart/item/${type}/${range}/${code}.png?sidcode=${Date.now()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Referer: 'https://finance.naver.com/',
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const headers = new Headers(upstream.headers);
    headers.set('cache-control', 'public, max-age=60, s-maxage=300');
    headers.set('content-type', 'image/png');
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    const response = new Response(upstream.body, { status: 200, headers });
    context.waitUntil(Promise.all([
      cache.put(cacheKey, response.clone()),
      cache.put(staleKey, response.clone()),
    ]));
    return response;
  } catch {
    const stale = await cache.match(staleKey);
    if (stale) return new Response(stale.body, { status: 200, headers: stale.headers });
    return new Response('chart unavailable', { status: 502 });
  }
}
