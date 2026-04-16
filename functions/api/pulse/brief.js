const DEFAULT_CODES = ['000660', '005930'];
const CODE_NAMES = {
  '005930': '三星电子',
  '000660': 'SK海力士',
};
const SNAPSHOT_TTL_SECONDS = 15;
const STALE_TTL_SECONDS = 180;
const ALLOWED_PAGE_PATHS = ['/insight/korea-tech-briefing.html'];

function normalizeCodes(raw) {
  if (!raw) return DEFAULT_CODES;
  const codes = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{6}$/.test(s));
  return codes.length ? [...new Set(codes)] : DEFAULT_CODES;
}

function mapDirection(rf) {
  if (rf === '2') return 'up';
  if (rf === '5') return 'down';
  return 'flat';
}

function blocked(message = 'forbidden') {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
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

function jsonHeaders(cacheControl, cacheState) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': cacheState,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  if (!isAllowedRequest(request)) return blocked();

  const url = new URL(request.url);
  const codes = normalizeCodes(url.searchParams.get('codes'));
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/brief/live?codes=${codes.join(',')}`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/brief/stale?codes=${codes.join(',')}`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const responses = await Promise.all(
      codes.map(async (code) => {
        const upstreamUrl = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(`SERVICE_ITEM:${code}`)}`;
        const upstream = await fetch(upstreamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
            Referer: 'https://finance.naver.com/',
            Accept: 'text/plain, application/json, */*',
          },
        });
        if (!upstream.ok) throw new Error(`upstream ${upstream.status} for ${code}`);
        const buffer = await upstream.arrayBuffer();
        const text = new TextDecoder('euc-kr').decode(buffer);
        return JSON.parse(text);
      })
    );

    const snapshotAt = Date.now();
    const pollingIntervalMs = Math.max(...responses.map((payload) => Number(payload?.result?.pollingInterval || 7000)));
    const serverTime = Math.max(...responses.map((payload) => Number(payload?.result?.time || snapshotAt)));
    const dataMap = new Map();

    for (const payload of responses) {
      const datas = payload?.result?.areas?.flatMap((area) => area.datas || []) || [];
      for (const item of datas) dataMap.set(item.cd, { item, payload });
    }

    const quotes = codes.map((code) => {
      const found = dataMap.get(code);
      if (!found) {
        return {
          code,
          name: CODE_NAMES[code] || code,
          market: null,
          direction: 'flat',
          current: 0,
          previousClose: 0,
          dayChange: 0,
          dayChangePercent: 0,
          open: 0,
          high: 0,
          low: 0,
          volume: 0,
          value: 0,
          fetchedAt: new Date(snapshotAt).toISOString(),
          localTradedAt: null,
          unavailable: true,
        };
      }

      const { item, payload } = found;
      const current = Number(item.nv ?? 0);
      const previousClose = Number(item.pcv ?? 0);
      const delta = Number(item.cv ?? current - previousClose);
      const ratio = Number(item.cr ?? 0);
      return {
        code: item.cd,
        name: CODE_NAMES[item.cd] || item.nm || item.cd,
        market: item.ms || null,
        direction: mapDirection(item.rf),
        current,
        previousClose,
        dayChange: delta,
        dayChangePercent: ratio,
        open: Number(item.ov ?? 0),
        high: Number(item.hv ?? 0),
        low: Number(item.lv ?? 0),
        volume: Number(item.aq ?? 0),
        value: Number(item.aa ?? 0),
        fetchedAt: new Date(snapshotAt).toISOString(),
        localTradedAt: payload?.result?.time ? new Date(payload.result.time).toISOString() : null,
      };
    });

    const body = JSON.stringify({
      ok: true,
      serverTime,
      snapshotAt,
      snapshotTtlSeconds: SNAPSHOT_TTL_SECONDS,
      staleTtlSeconds: STALE_TTL_SECONDS,
      quotes,
    });

    const liveResponse = new Response(body, {
      headers: jsonHeaders(`public, max-age=0, s-maxage=${SNAPSHOT_TTL_SECONDS}`, 'MISS'),
    });
    const staleResponse = new Response(body, {
      headers: jsonHeaders(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
    });

    context.waitUntil(Promise.all([
      cache.put(liveCacheKey, liveResponse.clone()),
      cache.put(staleCacheKey, staleResponse.clone()),
    ]));

    return liveResponse;
  } catch (error) {
    const stale = await cache.match(staleCacheKey);
    if (stale) {
      const headers = new Headers(stale.headers);
      headers.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: jsonHeaders('no-store', 'ERROR'),
    });
  }
}
