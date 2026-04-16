const VALID_TYPES = new Set(['area', 'candle']);
const VALID_RANGES = new Set(['day', 'week', 'month']);

function pick(value, valid, fallback) {
  return valid.has(value) ? value : fallback;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const code = /^\d{6}$/.test(url.searchParams.get('code') || '') ? url.searchParams.get('code') : '000660';
  const type = pick(url.searchParams.get('type') || 'area', VALID_TYPES, 'area');
  const range = pick(url.searchParams.get('range') || 'day', VALID_RANGES, 'day');
  const upstreamUrl = `https://ssl.pstatic.net/imgfinance/chart/item/${type}/${range}/${code}.png?sidcode=${Date.now()}`;

  const upstream = await fetch(upstreamUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: 'https://finance.naver.com/',
      Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  if (!upstream.ok) {
    return new Response('chart unavailable', { status: 502 });
  }

  const headers = new Headers(upstream.headers);
  headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  headers.set('content-type', 'image/png');
  return new Response(upstream.body, { status: 200, headers });
}
