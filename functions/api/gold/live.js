// gold-live-explicit-v2
const SNAPSHOT_TTL_SECONDS = 30;
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';
const FIXED_USDHKD = 7.85;
const YONGFENG_ADDON_USD = 0.5;
const T1QQ_URL = 'https://api.t1qq.com/api/v1/tool/daygold';

function findNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

function collectCandidates(node, path = [], out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, idx) => collectCandidates(item, [...path, String(idx)], out));
    return out;
  }
  if (node && typeof node === 'object') {
    const entries = Object.entries(node);
    const labelText = ['name', 'title', 'label', 'market', 'type', 'desc', 'description']
      .map((k) => node[k])
      .filter(Boolean)
      .join(' ');
    const combinedPath = [...path, labelText].join(' ').toLowerCase();
    const directFields = ['price', 'current', 'last', 'latest', 'value', 'sell', 'buy', 'now'];
    for (const field of directFields) {
      const v = findNumeric(node[field]);
      if (v !== null) out.push({ value: v, path: `${combinedPath} ${field}`.trim() });
    }
    for (const [k, v] of entries) collectCandidates(v, [...path, k], out);
    return out;
  }
  const n = findNumeric(node);
  if (n !== null) out.push({ value: n, path: path.join(' ').toLowerCase() });
  return out;
}

function pickSpotUsd(payload) {
  const explicit = findNumeric(payload?.data?.LondonSpotGoldMarket?.price);
  if (explicit !== null) {
    return {
      value: explicit,
      path: 'data.LondonSpotGoldMarket.price',
    };
  }

  const candidates = collectCandidates(payload);
  const ranked = candidates
    .filter((item) => /(伦敦|london|xau|gold)/i.test(item.path))
    .map((item) => {
      let score = 0;
      if (/(伦敦|london)/i.test(item.path)) score += 6;
      if (/(现货|spot)/i.test(item.path)) score += 4;
      if (/(gold|xau)/i.test(item.path)) score += 3;
      if (/(price|current|last|latest|value|now)/i.test(item.path)) score += 2;
      if (/(buy|sell)/i.test(item.path)) score -= 1;
      if (item.value > 1500 && item.value < 10000) score += 3;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const apiKey = env.T1QQ_API_KEY || url.searchParams.get('key') || '';
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

    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, config_missing: true, error: 'Missing T1QQ_API_KEY', fx_usdhkd: FIXED_USDHKD, yongfeng_addon_usd: YONGFENG_ADDON_USD }, null, 2), {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        },
      });
    }

    const upstreamUrl = `${T1QQ_URL}?key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json,text/plain,*/*',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const payload = await upstream.json();
    const picked = pickSpotUsd(payload);
    if (!picked) throw new Error('London spot gold explicit field missing in upstream payload');
    const spotUsdOz = Number(picked.value);
    const yongfengUsdOz = spotUsdOz + YONGFENG_ADDON_USD;
    const yongfengHkdOz = yongfengUsdOz * FIXED_USDHKD;
    const responsePayload = {
      ok: true,
      source: 't1qq',
      source_url: T1QQ_URL,
      spot_usd_oz: spotUsdOz,
      yongfeng_usd_oz: yongfengUsdOz,
      fx_mode: 'fixed',
      fx_usdhkd: FIXED_USDHKD,
      yongfeng_hkd_oz: yongfengHkdOz,
      yongfeng_addon_usd: YONGFENG_ADDON_USD,
      parsed_from: picked.path,
      upstream_market: payload?.data?.LondonSpotGoldMarket?.market ?? null,
      upstream_date: payload?.data?.LondonSpotGoldMarket?.date ?? null,
      upstream_time: payload?.data?.LondonSpotGoldMarket?.updateTime ?? null,
      updated_at: new Date().toISOString(),
      raw_code: payload?.code ?? null,
      raw_msg: payload?.msg ?? null,
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
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), fx_usdhkd: FIXED_USDHKD, yongfeng_addon_usd: YONGFENG_ADDON_USD }, null, 2), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  }
}
