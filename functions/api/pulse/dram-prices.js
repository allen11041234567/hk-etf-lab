const LIVE_TTL_SECONDS = 600;
const STALE_TTL_SECONDS = 172800;

const CONTRACT_URL = 'https://www.trendforce.com.tw/price/dram/dram_contract';
const SPOT_URL = 'https://www.trendforce.com.tw/price/dram/dram_spot';
const UA = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function stripTags(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#9650;/g, '▲')
    .replace(/&#9660;/g, '▼')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeChange(raw) {
  const text = stripTags(raw).replace(/\s*%/g, '%').trim();
  if (!text) return '--';
  if (text.includes('▲')) return text.replace(/▲\s*/g, '▲ ').trim();
  if (text.includes('▼')) return text.replace(/▼\s*/g, '▼ ').trim();
  if (text.includes('—')) return text.replace(/—\s*/g, '— ').trim();
  return text;
}

function parseLastUpdate(html) {
  const m = html.match(/<div class="price-last-update">\s*<p>([^<]+)<\/p>/i);
  return m ? stripTags(m[1]) : '--';
}

function parseTableRows(html, kind) {
  const tableMatch = html.match(/<table class="price-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) throw new Error(`price table not found for ${kind}`);
  const tbody = tableMatch[1];
  const rows = [];
  for (const tr of tbody.match(/<tr>[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (kind === 'contract') {
      if (cells.length < 6) continue;
      rows.push({
        item: stripTags(cells[0]),
        high: stripTags(cells[1]),
        low: stripTags(cells[2]),
        avg: stripTags(cells[3]),
        avgChange: normalizeChange(cells[4]),
        lowChange: normalizeChange(cells[5]),
      });
    } else {
      if (cells.length < 7) continue;
      rows.push({
        item: stripTags(cells[0]),
        high: stripTags(cells[3]),
        low: stripTags(cells[4]),
        avg: stripTags(cells[5]),
        avgChange: normalizeChange(cells[6]),
      });
    }
  }
  return rows;
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.trendforce.com.tw/',
    },
  });
  if (!resp.ok) throw new Error(`upstream ${resp.status} for ${url}`);
  return await resp.text();
}

function buildPayload(contractHtml, spotHtml) {
  const contract = {
    sourceUrl: CONTRACT_URL,
    label: 'DRAM合约价',
    lastUpdate: parseLastUpdate(contractHtml),
    rows: parseTableRows(contractHtml, 'contract'),
  };
  const spot = {
    sourceUrl: SPOT_URL,
    label: 'DRAM现货价',
    lastUpdate: parseLastUpdate(spotHtml),
    updateHint: '站内按北京时间 11:00 / 15:00 作为对外刷新标记',
    rows: parseTableRows(spotHtml, 'spot'),
  };
  if (!contract.rows.length || !spot.rows.length) {
    throw new Error('parsed rows empty');
  }
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    siteRefreshLabel: '北京时间 11:00 / 15:00',
    retentionRule: '如源站无新数据或抓取失败，则保留上一版数据',
    contract,
    spot,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/dram-prices/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/dram-prices/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const [contractHtml, spotHtml] = await Promise.all([
      fetchHtml(CONTRACT_URL),
      fetchHtml(SPOT_URL),
    ]);
    const body = JSON.stringify(buildPayload(contractHtml, spotHtml));

    const live = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS'),
    });
    const stale = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
    });
    context.waitUntil(Promise.all([
      cache.put(liveKey, live.clone()),
      cache.put(staleKey, stale.clone()),
    ]));
    return live;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: h });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: headers('no-store', 'ERROR'),
    });
  }
}
