const DEFAULT_CODES = ['000660', '005930'];
const CODE_NAMES = {
  '005930': '三星电子',
  '000660': 'SK海力士',
};
const SNAPSHOT_TTL_SECONDS = 30;
const STALE_TTL_SECONDS = 300;

function normalizeCodes(raw) {
  if (!raw) return DEFAULT_CODES;
  const codes = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{6}$/.test(s));
  return codes.length ? [...new Set(codes)] : DEFAULT_CODES;
}

function mapDirection(rf) {
  if (rf === '2' || rf === 'RISE') return 'up';
  if (rf === '5' || rf === 'FALL') return 'down';
  return 'flat';
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/,/g, '').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function applyDirection(value, direction) {
  const n = Math.abs(parseNumber(value));
  if (direction === 'down') return -n;
  if (direction === 'up') return n;
  return parseNumber(value);
}

async function fetchPollingQuote(code) {
  const upstreamUrl = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(`SERVICE_ITEM:${code}`)}`;
  const upstream = await fetch(upstreamUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: 'https://finance.naver.com/',
      Accept: 'text/plain, application/json, */*',
    },
  });
  if (!upstream.ok) throw new Error(`polling ${upstream.status} for ${code}`);
  const buffer = await upstream.arrayBuffer();
  const text = new TextDecoder('euc-kr').decode(buffer);
  const payload = JSON.parse(text);
  const item = payload?.result?.areas?.flatMap((area) => area.datas || []).find((entry) => entry.cd === code);
  if (!item) throw new Error(`polling empty for ${code}`);
  return { payload, item };
}

async function fetchMobileJson(path, referer) {
  const resp = await fetch(`https://m.stock.naver.com${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: referer,
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!resp.ok) throw new Error(`mobile ${resp.status} for ${path}`);
  return await resp.json();
}

async function fetchMobileQuote(code) {
  const referer = `https://m.stock.naver.com/domestic/stock/${code}/total`;
  const [basic, integration] = await Promise.all([
    fetchMobileJson(`/api/stock/${code}/basic`, referer),
    fetchMobileJson(`/api/stock/${code}/integration`, referer),
  ]);
  return { basic, integration };
}

function buildQuoteFromSources(code, snapshotAt, pollingResult, mobileResult) {
  const pollingItem = pollingResult?.item;
  const pollingPayload = pollingResult?.payload;
  const basic = mobileResult?.basic;
  const integration = mobileResult?.integration;
  const totalInfos = integration?.totalInfos || [];
  const infoMap = Object.fromEntries(totalInfos.map((row) => [row.code, row.value]));

  const market = pollingItem?.ms || basic?.marketStatus || null;
  const direction = mapDirection(pollingItem?.rf || basic?.compareToPreviousPrice?.name || basic?.compareToPreviousPrice?.text || '');
  const current = parseNumber(pollingItem?.nv ?? basic?.closePrice ?? infoMap.closePrice ?? infoMap.tradePrice);
  const previousClose = parseNumber(pollingItem?.pcv ?? basic?.previousClosePrice ?? infoMap.lastClosePrice);
  const dayChange = applyDirection(pollingItem?.cv ?? basic?.compareToPreviousClosePrice ?? (current - previousClose), direction);
  const dayChangePercent = applyDirection(pollingItem?.cr ?? basic?.fluctuationsRatio ?? infoMap.fluctuationsRatio, direction);
  const open = parseNumber(pollingItem?.ov ?? basic?.openPrice ?? infoMap.openPrice);
  const high = parseNumber(pollingItem?.hv ?? basic?.highPrice ?? infoMap.highPrice);
  const low = parseNumber(pollingItem?.lv ?? basic?.lowPrice ?? infoMap.lowPrice);
  const volume = parseNumber(pollingItem?.aq ?? basic?.accumulatedTradingVolume ?? infoMap.accumulatedTradingVolume);
  const value = parseNumber(pollingItem?.aa ?? basic?.accumulatedTradingValue ?? infoMap.accumulatedTradingValue);
  const localTs = pollingPayload?.result?.time || basic?.localTradedAt || null;

  if (!current && !previousClose && !open && !high && !low) {
    return {
      code,
      name: CODE_NAMES[code] || basic?.stockName || integration?.stockName || code,
      market,
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
      source: 'unavailable',
    };
  }

  return {
    code,
    name: CODE_NAMES[code] || basic?.stockName || integration?.stockName || pollingItem?.nm || code,
    market,
    direction,
    current,
    previousClose,
    dayChange,
    dayChangePercent,
    open,
    high,
    low,
    volume,
    value,
    fetchedAt: new Date(snapshotAt).toISOString(),
    localTradedAt: localTs ? new Date(localTs).toISOString() : null,
    source: pollingItem ? 'polling+mobile' : 'mobile',
  };
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

    const perCodeResults = await Promise.all(
      codes.map(async (code) => {
        const [polling, mobile] = await Promise.allSettled([
          fetchPollingQuote(code),
          fetchMobileQuote(code),
        ]);
        return {
          code,
          polling: polling.status === 'fulfilled' ? polling.value : null,
          mobile: mobile.status === 'fulfilled' ? mobile.value : null,
        };
      })
    );

    const snapshotAt = Date.now();
    const pollingIntervalMs = Math.max(
      7000,
      ...perCodeResults.map((entry) => Number(entry.polling?.payload?.result?.pollingInterval || 7000))
    );
    const serverTime = Math.max(
      snapshotAt,
      ...perCodeResults.map((entry) => {
        const pollingTs = Number(entry.polling?.payload?.result?.time || 0);
        const mobileTs = entry.mobile?.basic?.localTradedAt ? new Date(entry.mobile.basic.localTradedAt).getTime() : 0;
        return Math.max(pollingTs, mobileTs, snapshotAt);
      })
    );

    const quotes = perCodeResults.map(({ code, polling, mobile }) => buildQuoteFromSources(code, snapshotAt, polling, mobile));

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
