const DEFAULT_CODES = ['005930', '000660'];
const CODE_NAMES = {
  '005930': '三星电子',
  '000660': 'SK海力士',
};
const SNAPSHOT_TTL_SECONDS = 15;

function normalizeCodes(raw) {
  if (!raw) return DEFAULT_CODES;
  const codes = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{6}$/.test(s));
  return codes.length ? [...new Set(codes)] : DEFAULT_CODES;
}

function formatSignedNumber(value) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function mapDirection(rf) {
  if (rf === '2') return 'up';
  if (rf === '5') return 'down';
  return 'flat';
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const codes = normalizeCodes(url.searchParams.get('codes'));
  const query = codes.map((code) => `SERVICE_ITEM:${code}`).join('|');
  const upstreamUrl = `https://polling.finance.naver.com/api/realtime?query=${encodeURIComponent(query)}`;
  const cacheKey = new Request(`${url.origin}/__snapshot/naver/realtime?codes=${codes.join(',')}`);
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-snapshot-cache', 'HIT');
      headers.set('access-control-allow-origin', '*');
      return new Response(cached.body, {
        status: cached.status,
        headers,
      });
    }

    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Referer: 'https://finance.naver.com/',
        Accept: 'text/plain, application/json, */*',
      },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `upstream ${upstream.status}` }),
        {
          status: 502,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
          },
        }
      );
    }

    const buffer = await upstream.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const text = decoder.decode(buffer);
    const payload = JSON.parse(text);
    const datas = payload?.result?.areas?.flatMap((area) => area.datas || []) || [];
    const snapshotAt = Date.now();

    const quotes = datas.map((item) => {
      const current = Number(item.nv ?? 0);
      const previousClose = Number(item.pcv ?? 0);
      const delta = Number(item.cv ?? current - previousClose);
      const ratio = Number(item.cr ?? 0);
      const volume = Number(item.aq ?? 0);
      return {
        code: item.cd,
        name: CODE_NAMES[item.cd] || item.nm || item.cd,
        sourceName: item.nm || null,
        market: item.ms || null,
        direction: mapDirection(item.rf),
        current,
        previousClose,
        dayChange: delta,
        dayChangeText: formatSignedNumber(delta),
        dayChangePercent: ratio,
        open: Number(item.ov ?? 0),
        high: Number(item.hv ?? 0),
        low: Number(item.lv ?? 0),
        volume,
        value: Number(item.aa ?? 0),
        fetchedAt: new Date(snapshotAt).toISOString(),
        localTradedAt: payload?.result?.time ? new Date(payload.result.time).toISOString() : null,
      };
    });

    const body = JSON.stringify(
      {
        ok: true,
        source: 'Naver Finance',
        pollingIntervalMs: Number(payload?.result?.pollingInterval || 7000),
        serverTime: payload?.result?.time || snapshotAt,
        snapshotAt,
        snapshotTtlSeconds: SNAPSHOT_TTL_SECONDS,
        cacheMode: 'shared-edge-snapshot',
        quotes,
      },
      null,
      2
    );

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
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        },
      }
    );
  }
}
