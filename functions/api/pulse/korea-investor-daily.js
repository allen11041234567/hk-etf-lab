const DEFAULT_CODES = ['000660', '005930'];
const CODE_NAMES = {
  '005930': '三星电子',
  '000660': 'SK海力士',
};
const LIVE_TTL_SECONDS = 1800;
const STALE_TTL_SECONDS = 43200;
const CACHE_VERSION = 'v2';

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

function parsePercent(text = '') {
  const cleaned = String(text).replace(/[%,]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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
  const rows = [...html.matchAll(/<tr[^>]*onMouseOver="mouseOver\(this\)"[\s\S]*?<td[^>]*class="tc"[^>]*><span[^>]*>([^<]+)<\/span><\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([^<]+)<\/span><\/td>[\s\S]*?<td[^>]*class="num"[^>]*>[\s\S]*?<span[^>]*>([+\-]?[0-9.,%]+)<\/span>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([+\-]?[0-9.,%]+)<\/span><\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([0-9,]+)<\/span><\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([+\-]?[0-9,]+)<\/span>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([+\-]?[0-9,]+)<\/span>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([0-9,]+)<\/span><\/td>[\s\S]*?<td[^>]*class="num"[^>]*><span[^>]*>([0-9.]+%)<\/span>/gi)];
  return rows.map((m) => ({
    date: m[1].trim(),
    close: m[2].trim(),
    pct: m[4].trim(),
    volume: parseSignedNumber(m[5]),
    institutionNet: parseSignedNumber(m[6]),
    foreignNet: parseSignedNumber(m[7]),
    foreignShares: parseSignedNumber(m[8]),
    foreignRateText: m[9].trim(),
    foreignRateValue: parsePercent(m[9]),
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

async function fetchPriceSeries(code) {
  const referer = `https://m.stock.naver.com/domestic/stock/${code}/total`;
  const resp = await fetch(`https://m.stock.naver.com/api/stock/${code}/price`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: referer,
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!resp.ok) throw new Error(`mobile price ${resp.status} for ${code}`);
  return await resp.json();
}

function volumeTrendText(todayVolume, prevAvgVolume) {
  if (!todayVolume || !prevAvgVolume) return '量能暂无结论';
  const ratio = todayVolume / prevAvgVolume;
  if (ratio >= 1.5) return `较近5日均量明显放大（${ratio.toFixed(1)}x）`;
  if (ratio >= 1.1) return `较近5日均量小幅放大（${ratio.toFixed(1)}x）`;
  if (ratio <= 0.7) return `较近5日均量明显缩量（${ratio.toFixed(1)}x）`;
  if (ratio <= 0.9) return `较近5日均量小幅缩量（${ratio.toFixed(1)}x）`;
  return `较近5日均量基本持平（${ratio.toFixed(1)}x）`;
}

function week52PositionText(current, low52, high52) {
  const c = parseSignedNumber(current);
  const lo = parseSignedNumber(low52);
  const hi = parseSignedNumber(high52);
  if (!c || !lo || !hi || hi <= lo) return '52周位置暂无结论';
  const pct = ((c - lo) / (hi - lo)) * 100;
  return `处于52周区间 ${pct.toFixed(0)}% 位置`;
}

async function fetchUsdKrwSummary() {
  const html = await fetchHtml('https://finance.naver.com/marketindex/', 'https://finance.naver.com/');
  const m = html.match(/marketindexCd=FX_USDKRW[\s\S]*?<span class="value">([^<]+)<\/span>[\s\S]*?<span class="change">\s*([^<]+)<\/span>[\s\S]*?<span class="blind">([^<]+)<\/span>/i);
  if (!m) return null;
  return {
    value: m[1].trim(),
    change: m[2].trim(),
    direction: m[3].trim(),
  };
}

async function fetchIndexBasic(code) {
  const resp = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Referer: 'https://m.stock.naver.com/',
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!resp.ok) throw new Error(`index ${resp.status} for ${code}`);
  return await resp.json();
}

async function buildInvestorSnapshot(code) {
  const mainUrl = `https://finance.naver.com/item/main.naver?code=${code}`;
  const [mainHtml, integration, prices] = await Promise.all([
    fetchHtml(mainUrl, 'https://finance.naver.com/'),
    fetchMobileIntegration(code).catch(() => null),
    fetchPriceSeries(code).catch(() => []),
  ]);
  const rows = extractRows(mainHtml).slice(0, 5);
  const today = rows[0] || { date: null, foreignNet: 0, institutionNet: 0, foreignRateValue: null, foreignRateText: null, volume: 0 };
  const yesterday = rows[1] || { foreignRateValue: null };
  const foreign5d = rows.map((r) => r.foreignNet);
  const institution5d = rows.map((r) => r.institutionNet);
  const totalInfos = integration?.totalInfos || [];
  const foreignRate = totalInfos.find((x) => x.code === 'foreignRate')?.value || today.foreignRateText || extractForeignRate(mainHtml);
  const low52 = totalInfos.find((x) => x.code === 'lowPriceOf52Weeks')?.value;
  const high52 = totalInfos.find((x) => x.code === 'highPriceOf52Weeks')?.value;
  const closePrice = integration?.stockName ? (prices?.[0]?.closePrice || rows[0]?.close) : rows[0]?.close;
  const prevVolumes = (prices || []).slice(1, 6).map((x) => parseSignedNumber(x.accumulatedTradingVolume)).filter(Boolean);
  const prevAvgVolume = prevVolumes.length ? prevVolumes.reduce((a,b)=>a+b,0) / prevVolumes.length : 0;
  const foreignRateDelta = today.foreignRateValue != null && yesterday.foreignRateValue != null
    ? Number((today.foreignRateValue - yesterday.foreignRateValue).toFixed(2))
    : null;
  return {
    code,
    name: CODE_NAMES[code] || code,
    tradeDate: today.date,
    foreignHoldingRate: foreignRate || null,
    foreignHoldingRateDelta: foreignRateDelta,
    foreignNetToday: today.foreignNet,
    institutionNetToday: today.institutionNet,
    foreign5dTrend: fmtTrend(foreign5d),
    institution5dTrend: fmtTrend(institution5d),
    foreign5dNet: foreign5d.reduce((a, b) => a + b, 0),
    institution5dNet: institution5d.reduce((a, b) => a + b, 0),
    week52Position: week52PositionText(closePrice, low52, high52),
    volumeTrend: volumeTrendText(today.volume, prevAvgVolume),
  };
}

function semiTemperatureText(snapshots) {
  const changes = snapshots.map((s) => s.foreignNetToday || 0);
  const pos = changes.filter((x) => x > 0).length;
  const neg = changes.filter((x) => x < 0).length;
  if (pos === snapshots.length) return '半导体龙头资金面整体偏强';
  if (neg === snapshots.length) return '半导体龙头资金面整体偏弱';
  return '半导体龙头资金面分化';
}

async function buildMarketSummary(snapshots) {
  const [kospi, kosdaq, usdkrw] = await Promise.all([
    fetchIndexBasic('KOSPI').catch(() => null),
    fetchIndexBasic('KOSDAQ').catch(() => null),
    fetchUsdKrwSummary().catch(() => null),
  ]);
  return {
    kospi: kospi ? { price: kospi.closePrice, changePct: kospi.fluctuationsRatio, direction: kospi.compareToPreviousPrice?.name || '' } : null,
    kosdaq: kosdaq ? { price: kosdaq.closePrice, changePct: kosdaq.fluctuationsRatio, direction: kosdaq.compareToPreviousPrice?.name || '' } : null,
    usdkrw,
    semiconductorTone: semiTemperatureText(snapshots),
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const codes = normalizeCodes(url.searchParams.get('codes'));
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/korea-investor-daily/${CACHE_VERSION}/live?codes=${codes.join(',')}`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/korea-investor-daily/${CACHE_VERSION}/stale?codes=${codes.join(',')}`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const snapshots = await Promise.all(codes.map((code) => buildInvestorSnapshot(code)));
    const marketSummary = await buildMarketSummary(snapshots);
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      snapshots,
      marketSummary,
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
