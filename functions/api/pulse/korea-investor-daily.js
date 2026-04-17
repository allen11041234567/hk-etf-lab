const DEFAULT_CODES = ['000660', '005930'];
const CODE_NAMES = {
  '005930': '三星电子',
  '000660': 'SK海力士',
};
const LIVE_TTL_SECONDS = 1800;
const STALE_TTL_SECONDS = 43200;

function normalizeCodes(raw) {
  if (!raw) return DEFAULT_CODES;
  const codes = raw.split(',').map((s) => s.trim()).filter((s) => /^\d{6}$/.test(s));
  return codes.length ? [...new Set(codes)] : DEFAULT_CODES;
}

function parseSignedNumber(text = '') {
  const cleaned = String(text).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fmtTrend(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum > 0) return '近5日净流入';
  if (sum < 0) return '近5日净流出';
  return '近5日基本持平';
}

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

async function fetchHtml(url, referer) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: referer,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`upstream ${resp.status} for ${url}`);
  const buf = await resp.arrayBuffer();
  return new TextDecoder('euc-kr').decode(buf);
}

function extractForeignRate(html) {
  const m = html.match(/외인소진율<\/em>\s*<span class="blind">[^<]*<\/span>\s*<em[^>]*>([^<]+)<\/em>/i)
    || html.match(/foreignRate[^\n]*value":"([^"]+)"/i);
  return m?.[1]?.trim() || null;
}

function extractRows(html) {
  const tableStart = html.indexOf('<div id="content"');
  const chunk = tableStart >= 0 ? html.slice(tableStart) : html;
  const rows = [...chunk.matchAll(/<tr>\s*<th scope="row">([^<]+)<\/th>\s*<td><em>([^<]+)<\/em><\/td>\s*<td>[\s\S]*?<\/td>\s*<td>[\s\S]*?<em[^>]*>\s*([+\-]?[0-9,]+)\s*<\/em>[\s\S]*?<\/td>\s*<td>[\s\S]*?<em[^>]*>\s*([+\-]?[0-9,]+)\s*<\/em>/gi)];
  return rows.map((m) => ({
    date: m[1].trim(),
    close: m[2].trim(),
    foreignNet: parseSignedNumber(m[3]),
    institutionNet: parseSignedNumber(m[4]),
  }));
}

async function fetchMobileIntegration(code) {
  const referer = `https://m.stock.naver.com/domestic/stock/${code}/total`;
  const resp = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: referer,
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!resp.ok) throw new Error(`mobile integration ${resp.status} for ${code}`);
  return await resp.json();
}

async function buildInvestorSnapshot(code) {
  const mainUrl = `https://finance.naver.com/item/main.naver?code=${code}`;
  const [mainHtml, integration] = await Promise.all([
    fetchHtml(mainUrl, 'https://finance.naver.com/'),
    fetchMobileIntegration(code).catch(() => null),
  ]);
  const rows = extractRows(mainHtml).slice(0, 5);
  const today = rows[0] || { date: null, foreignNet: 0, institutionNet: 0 };
  const foreign5d = rows.map((r) => r.foreignNet);
  const institution5d = rows.map((r) => r.institutionNet);
  const totalInfos = integration?.totalInfos || [];
  const foreignRate = totalInfos.find((x) => x.code === 'foreignRate')?.value || extractForeignRate(mainHtml);
  return {
    code,
    name: CODE_NAMES[code] || code,
    tradeDate: today.date,
    foreignHoldingRate: foreignRate || null,
    foreignNetToday: today.foreignNet,
    institutionNetToday: today.institutionNet,
    foreign5dTrend: fmtTrend(foreign5d),
    institution5dTrend: fmtTrend(institution5d),
    foreign5dNet: foreign5d.reduce((a, b) => a + b, 0),
    institution5dNet: institution5d.reduce((a, b) => a + b, 0),
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const codes = normalizeCodes(url.searchParams.get('codes'));
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/korea-investor-daily/live?codes=${codes.join(',')}`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/korea-investor-daily/stale?codes=${codes.join(',')}`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const snapshots = await Promise.all(codes.map((code) => buildInvestorSnapshot(code)));
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      snapshots,
    });
    const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
    context.waitUntil(Promise.all([
      cache.put(liveKey, liveRes.clone()),
      cache.put(staleKey, staleRes.clone()),
    ]));
    return liveRes;
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
