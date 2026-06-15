const LIVE_TTL_SECONDS = 20;
const STALE_TTL_SECONDS = 300;
const TARGET_URL = 'https://finance.yahoo.co.jp/quote/285A.T';

function jsonHeaders(cacheControl, cacheState) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': cacheState,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function parseNumber(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, '').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function textMatch(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
}

function extractMetric(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}[\\s\\S]{0,700}?_DataListItem__value_[^>]*>([^<]+)</span>(?:[\\s\\S]{0,120}?_DataListItem__suffix_[^>]*>([^<]+)</span>)?(?:[\\s\\S]{0,120}?_DataListItem__date_[^>]*>\\((?:<!-- -->)?([^<]+))?`, 'i');
  const m = html.match(pattern);
  if (!m) return { value: null, suffix: null, time: null };
  return { value: m[1] || null, suffix: m[2] || null, time: m[3] || null };
}

function extractPriceBoard(html) {
  const blockMatch = html.match(/_CommonPriceBoard__priceBlock[\s\S]{0,1600}?_CommonPriceBoard__mainFooter/i);
  const block = blockMatch ? blockMatch[0] : html;
  const price = textMatch(block, /_CommonPriceBoard__price_[^>]*>[\s\S]*?_StyledNumber__value_[^>]*>([^<]+)</i);
  const change = textMatch(block, /_PriceChangeLabel__primary_[^>]*>[\s\S]*?_StyledNumber__value_[^>]*>([^<]+)</i);
  const changePercent = textMatch(block, /_PriceChangeLabel__secondary_[^>]*>[\s\S]*?_StyledNumber__value_[^>]*>([^<]+)<\/span>[\s\S]*?_StyledNumber__suffix_[^>]*>%/i);
  const priceTime = textMatch(block, /<time>([^<]+)<\/time>/i);
  const code = textMatch(html, /_CommonPriceBoard__code_[^>]*>([^<]+)</i);
  const name = textMatch(html, /_BasePriceBoard__name_[^>]*>([^<]+)</i);
  const industry = textMatch(html, /_CommonPriceBoard__industryName[^>]*>([^<]+)</i);
  return { price, change, changePercent, priceTime, code, name, industry };
}

function extractPts(html) {
  const m = html.match(/ptsPriceData\\":\{([^}]+)\}/);
  if (!m) return null;
  const body = m[1];
  const get = (key) => {
    const mm = body.match(new RegExp(`${key}\\":\\"([^\\"]*)\\"`));
    return mm ? mm[1] : null;
  };
  return {
    price: get('price'),
    priceTime: get('priceTime'),
    changePrice: get('changePrice'),
    changeRate: get('changeRate'),
    openPrice: get('openPrice'),
    highPrice: get('highPrice'),
    lowPrice: get('lowPrice'),
    volume: get('volume'),
    tradingValue: get('tradingValue'),
  };
}

async function fetchPage() {
  const resp = await fetch(TARGET_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://finance.yahoo.co.jp/',
    },
  });
  if (!resp.ok) throw new Error(`upstream ${resp.status}`);
  return await resp.text();
}

function buildPayload(html) {
  const board = extractPriceBoard(html);
  const previousClose = extractMetric(html, '前日終値');
  const open = extractMetric(html, '始値');
  const high = extractMetric(html, '高値');
  const low = extractMetric(html, '安値');
  const volume = extractMetric(html, '出来高');
  const tradingValue = extractMetric(html, '売買代金');
  const marketCap = extractMetric(html, '時価総額');
  const pbr = extractMetric(html, 'PBR');
  const roe = extractMetric(html, 'ROE');
  const equityRatio = extractMetric(html, '自己資本比率');
  const pts = extractPts(html);

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    quote: {
      code: board.code || '285A',
      name: board.name || 'キオクシアホールディングス',
      nameZh: '铠侠控股',
      market: '东证PRM',
      industry: board.industry || '电气机器',
      current: parseNumber(board.price),
      currentText: board.price,
      priceTime: board.priceTime,
      dayChange: parseNumber(board.change),
      dayChangeText: board.change,
      dayChangePercent: parseNumber(board.changePercent),
      dayChangePercentText: board.changePercent ? `${board.changePercent}%` : null,
      previousClose: parseNumber(previousClose.value),
      previousCloseText: previousClose.value,
      open: parseNumber(open.value),
      openText: open.value,
      high: parseNumber(high.value),
      highText: high.value,
      low: parseNumber(low.value),
      lowText: low.value,
      volume: parseNumber(volume.value),
      volumeText: volume.value ? `${volume.value}${volume.suffix || ''}` : null,
      tradingValue: parseNumber(tradingValue.value),
      tradingValueText: tradingValue.value ? `${tradingValue.value}${tradingValue.suffix || ''}` : null,
      marketCap: parseNumber(marketCap.value),
      marketCapText: marketCap.value ? `${marketCap.value}${marketCap.suffix || ''}` : null,
      pbrText: `${pbr.value || '--'}${pbr.suffix || ''}`,
      roeText: `${roe.value || '--'}${roe.suffix || ''}`,
      equityRatioText: `${equityRatio.value || '--'}${equityRatio.suffix || ''}`,
      pts: pts ? {
        priceText: pts.price,
        price: parseNumber(pts.price),
        priceTime: pts.priceTime,
        changePriceText: pts.changePrice,
        changeRateText: pts.changeRate ? `${pts.changeRate}%` : null,
        changeRate: parseNumber(pts.changeRate),
        volumeText: pts.volume,
        tradingValueText: pts.tradingValue,
      } : null,
    },
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/kioxia-brief/live`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/kioxia-brief/stale`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const html = await fetchPage();
    const body = JSON.stringify(buildPayload(html));

    const liveResponse = new Response(body, {
      headers: jsonHeaders(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS'),
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
