const LIVE_TTL_SECONDS = 30;
const CODES = '005930,000660,009150,402340,005380,105560,012330,034020,006400,028260';

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { Accept: 'application/json, text/plain, */*' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.json();
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const aggregateKey = new Request(`${url.origin}/__edge/pulse/kospi-top10-snapshot/live`);

  try {
    const cached = await cache.match(aggregateKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const [brief, csop] = await Promise.all([
      fetchJson(`${url.origin}/api/pulse/brief?codes=${CODES}`),
      fetchJson(`${url.origin}/api/pulse/csop-3121-quote`),
    ]);

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      snapshotTtlSeconds: LIVE_TTL_SECONDS,
      quotes: brief.quotes || [],
      csop3121: csop || null,
    };

    const body = JSON.stringify(payload);
    const res = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    context.waitUntil(cache.put(aggregateKey, res.clone()));
    return res;
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: headers('no-store', 'ERROR'),
    });
  }
}
