// gold-live-goldprice-today-v1
const SNAPSHOT_TTL_SECONDS = 30;
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';
const FIXED_USDHKD = 7.85;
const YONGFENG_ADDON_USD = 0.5;
const SOURCE_URL = 'https://goldprice.today/api.php?data=live';

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/__snapshot/gold/live`);
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-snapshot-cache', 'HIT');
      headers.set('access-control-allow-origin', '*');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const upstream = await fetch(SOURCE_URL, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json,text/plain,*/*',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const payload = await upstream.json();

    const spotUsdOz = asNumber(payload?.USD?.ounce);
    const spotHkdOz = asNumber(payload?.HKD?.ounce);
    if (spotUsdOz === null) throw new Error('Missing USD ounce in goldprice.today payload');

    const yongfengUsdOz = spotUsdOz + YONGFENG_ADDON_USD;
    const yongfengHkdOz = yongfengUsdOz * FIXED_USDHKD;

    const responsePayload = {
      ok: true,
      source: 'goldprice.today',
      source_url: SOURCE_URL,
      spot_usd_oz: spotUsdOz,
      spot_hkd_oz: spotHkdOz,
      yongfeng_usd_oz: yongfengUsdOz,
      fx_mode: 'fixed',
      fx_usdhkd: FIXED_USDHKD,
      yongfeng_hkd_oz: yongfengHkdOz,
      yongfeng_addon_usd: YONGFENG_ADDON_USD,
      parsed_from: 'USD.ounce',
      upstream_hkd_field: spotHkdOz,
      updated_at: new Date().toISOString(),
      snapshot_ttl_seconds: SNAPSHOT_TTL_SECONDS,
    };

    const body = JSON.stringify(responsePayload, null, 2);
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
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      fx_usdhkd: FIXED_USDHKD,
      yongfeng_addon_usd: YONGFENG_ADDON_USD,
    }, null, 2), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  }
}
