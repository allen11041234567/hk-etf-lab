const VALID_TYPES = new Set(['area', 'candle']);
const VALID_RANGES = new Set(['day', 'week', 'month']);
const ALLOWED_PAGE_PATHS = ['/insight/korea-tech-briefing.html'];

function pick(value, valid, fallback) {
  return valid.has(value) ? value : fallback;
}

function isAllowedRequest(request) {
  const url = new URL(request.url);
  const referer = request.headers.get('referer');
  const origin = request.headers.get('origin');
  const secFetchSite = request.headers.get('sec-fetch-site');
  const userAgent = request.headers.get('user-agent') || '';

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.origin !== url.origin) return false;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin !== url.origin) return false;
      if (!ALLOWED_PAGE_PATHS.includes(refererUrl.pathname)) return false;
    } catch {
      return false;
    }
  }

  if (!referer && !origin) {
    if (/Telegram|TelegramBot|WebView|Mobile/i.test(userAgent)) return true;
    if (!secFetchSite || ['same-origin', 'same-site', 'none'].includes(secFetchSite)) return true;
  }

  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) return false;
  return true;
}

export async function onRequestGet(context) {
  const { request } = context;
  if (!isAllowedRequest(request)) return new Response('forbidden', { status: 403 });

  const url = new URL(request.url);
  const code = /^\d{6}$/.test(url.searchParams.get('code') || '') ? url.searchParams.get('code') : '000660';
  const type = pick(url.searchParams.get('type') || 'area', VALID_TYPES, 'area');
  const range = pick(url.searchParams.get('range') || 'day', VALID_RANGES, 'day');
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
