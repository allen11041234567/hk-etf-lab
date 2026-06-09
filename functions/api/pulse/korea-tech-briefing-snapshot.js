const CODES = '000660,005930';
const LIVE_TTL_SECONDS = 30;
const INVESTOR_TTL_SECONDS = 3600;

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
  const aggregateKey = new Request(`${url.origin}/__edge/pulse/korea-tech-briefing-snapshot/live`);
  const investorCacheKey = new Request(`${url.origin}/__edge/pulse/korea-tech-briefing-snapshot/investor`);

  try {
    const cached = await cache.match(aggregateKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const briefPromise = fetchJson(`${url.origin}/api/pulse/brief?codes=${CODES}`).catch(() => fetchJson(`${url.origin}/assets/data/korea-brief.json`));

    const investorPromise = (async () => {
      const cachedInvestor = await cache.match(investorCacheKey);
      if (cachedInvestor) return await cachedInvestor.json();
      const investor = await fetchJson(`${url.origin}/api/pulse/korea-investor-daily?codes=${CODES}`).catch(() => fetchJson(`${url.origin}/assets/data/korea-investor-daily.json`));
      const investorRes = new Response(JSON.stringify(investor), { headers: headers(`public, max-age=0, s-maxage=${INVESTOR_TTL_SECONDS}`, 'WARM') });
      context.waitUntil(cache.put(investorCacheKey, investorRes));
      return investor;
    })();

    const [brief, investor] = await Promise.all([briefPromise, investorPromise]);
    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      quotes: brief.quotes || [],
      marketSummary: investor.marketSummary || null,
      snapshots: investor.snapshots || [],
      sources: {
        brief: brief.source || brief.sources || 'brief',
        investor: investor.source || investor.sources || 'investor',
      },
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
