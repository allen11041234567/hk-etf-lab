const LIVE_TTL_SECONDS = 300;
const STALE_TTL_SECONDS = 1800;
const CACHE_VERSION = 'v5';
const SNAPSHOT_URL = 'https://hketf-lab.pages.dev/assets/data/korea-market-digest.json';

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
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

    const upstream = await fetch(SNAPSHOT_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)' } });
    if (!upstream.ok) throw new Error(`snapshot ${upstream.status}`);
    const body = await upstream.text();
    const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
    context.waitUntil(Promise.all([cache.put(liveKey, liveRes.clone()), cache.put(staleKey, staleRes.clone())]));
    return liveRes;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: h });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: headers('no-store', 'ERROR') });
  }
}
