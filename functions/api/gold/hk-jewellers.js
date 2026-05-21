const SNAPSHOT_TTL_SECONDS = 1800;
const SOURCE_URL = 'https://www.hkgoldking.com/?lang=zh';
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';

const TARGET_SHOPS = [
  { key: 'chow_tai_fook', name: '周大福' },
  { key: 'chow_sang_sang', name: '周生生' },
  { key: 'lukfook', name: '六福' },
];

function asNumber(text) {
  const cleaned = String(text || '').replace(/HK\$/i, '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePayload(html) {
  const dateMatch = html.match(/香港最新飾金價\s*(?:<[^>]*>\s*)?\((\d{4}-\d{2}-\d{2})\)/i);
  const updatedMatch = html.match(/最後更新時間:\s*([^<\n]+)/i);
  const cards = [...html.matchAll(/<div class="card">\s*<div class="card-header">\s*([^<]+?)\s*<\/div>\s*<div class="card-body">([\s\S]*?)<\/div>\s*<\/div>/gi)];

  const shops = TARGET_SHOPS.map((target) => {
    const found = cards.find((match) => String(match[1] || '').replace(/\s+/g, '') === target.name);
    if (!found) {
      return {
        key: target.key,
        name: target.name,
        buy_hkd_tael: null,
        sell_hkd_tael: null,
        source: 'hkgoldking-html',
        source_url: SOURCE_URL,
      };
    }

    const body = found[2] || '';
    const sell = body.match(/賣出價:\s*<strong>\s*(HK\$[\d,]+|等待更新)\s*<\/strong>/i)?.[1] || null;
    const buy = body.match(/買入價:\s*<strong>\s*(HK\$[\d,]+|等待更新)\s*<\/strong>/i)?.[1] || null;

    return {
      key: target.key,
      name: target.name,
      buy_hkd_tael: buy && buy !== '等待更新' ? asNumber(buy) : null,
      sell_hkd_tael: sell && sell !== '等待更新' ? asNumber(sell) : null,
      source: 'hkgoldking-html',
      source_url: SOURCE_URL,
    };
  });

  return {
    ok: shops.some((shop) => shop.buy_hkd_tael || shop.sell_hkd_tael),
    source: 'hkgoldking-html',
    source_url: SOURCE_URL,
    fetched_via: 'direct-html',
    date: dateMatch?.[1] || null,
    updated_at: updatedMatch?.[1]?.trim() || null,
    unit: 'HKD/tael',
    shops,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/__snapshot/gold/hk-jewellers`);
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
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const html = await upstream.text();
    const payload = parsePayload(html);
    if (!payload.ok) throw new Error('failed to parse jeweller prices from source html');

    payload.snapshot_at = new Date().toISOString();
    payload.snapshot_ttl_seconds = SNAPSHOT_TTL_SECONDS;

    const body = JSON.stringify(payload, null, 2);
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
      source: 'hkgoldking-html',
      source_url: SOURCE_URL,
      error: error instanceof Error ? error.message : String(error),
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
