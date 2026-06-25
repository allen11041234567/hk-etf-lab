const LIVE_TTL_SECONDS = 20;
const STALE_TTL_SECONDS = 300;
const TARGET_URL = 'https://tw.stock.yahoo.com/quote/2330.TW';

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

function matchText(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
}

function extractField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}</span><span[^>]*>([\\s\\S]{0,260}?)</span>`, 'i');
  const m = html.match(pattern);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractLabeledValue(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`${escaped}</span><span[^>]*>[\\s\\S]{0,160}?>([0-9,]+(?:\\.[0-9]+)?%?)<`, 'i'));
  return m ? m[1].trim() : null;
}

function extractCurrentPrice(html) {
  return extractLabeledValue(html, '成交')
    || (html.match(/資料載入中\.\.\.[\s\S]{0,1200}?<span class="Fw\(600\) Fz\(32px\)[^"]*">([^<]+)<\/span>/i)?.[1] || null)
    || (html.match(/<span class="Fw\(600\) Fz\(32px\)[^"]*">([^<]+)<\/span>/i)?.[1] || null)
    || (html.match(/<span class="Fz\(32px\)[^"]*">([^<]+)<\/span>/i)?.[1] || null);
}

function extractUpdateTime(html) {
  return html.match(/([0-9]{4}\/[0-9]{2}\/[0-9]{2}\s+[0-9]{2}:[0-9]{2}\s+更新)/i)?.[1] || null;
}

function extractOutsideText(html) {
  const m = html.match(/<span class="Mend\(5px\) C\(\$c-trend-up\)">([\s\S]{0,120}?)<\/span><span>外盤/i);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null;
}

function extractInsideText(html) {
  const m = html.match(/內盤<\/span><span[^>]*>([\s\S]{0,160}?)<\/span>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null;
}

async function fetchPage() {
  const resp = await fetch(TARGET_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://tw.stock.yahoo.com/',
    },
  });
  if (!resp.ok) throw new Error(`upstream ${resp.status}`);
  return await resp.text();
}

function buildPayload(html) {
  const name = matchText(html, /<title>([^<(]+)\(2330\.TW\)/i) || '台積電';
  const timeText = extractUpdateTime(html) || matchText(html, /即時行情資料時間：([^<]+)/i);
  const current = extractCurrentPrice(html);
  const open = extractLabeledValue(html, '開盤') || extractField(html, '開盤');
  const high = extractLabeledValue(html, '最高') || extractField(html, '最高');
  const low = extractLabeledValue(html, '最低') || extractField(html, '最低');
  const average = extractLabeledValue(html, '均價') || extractField(html, '均價');
  const previousClose = extractLabeledValue(html, '昨收') || extractField(html, '昨收');
  const change = extractLabeledValue(html, '漲跌');
  const changePercent = extractLabeledValue(html, '漲跌幅');
  const tradingValue = extractLabeledValue(html, '成交金額\(億\)') || extractField(html, '成交金額\(億\)');
  const totalVolume = extractLabeledValue(html, '總量') || extractField(html, '總量');
  const insideRaw = extractInsideText(html);
  const outsideRaw = extractOutsideText(html);

  const currentNum = parseNumber(current);
  const previousCloseNum = parseNumber(previousClose);
  let dayChange = parseNumber(change);
  let dayChangePercent = parseNumber(changePercent);
  let dayChangePercentText = changePercent ? (String(changePercent).includes('%') ? String(changePercent) : `${changePercent}%`) : null;
  if (dayChange == null && currentNum != null && previousCloseNum != null) {
    const diff = currentNum - previousCloseNum;
    if (Number.isFinite(diff)) dayChange = diff;
  }
  if ((dayChangePercent == null || dayChangePercentText == null) && dayChange != null && previousCloseNum) {
    const pct = (dayChange / previousCloseNum) * 100;
    if (Number.isFinite(pct)) {
      dayChangePercent = pct;
      const absText = Math.abs(pct).toFixed(2);
      dayChangePercentText = `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${absText}%`;
    }
  }

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    quote: {
      code: '2330.TW',
      name,
      nameZh: '台积电',
      market: 'TWSE',
      current: currentNum,
      currentText: current,
      timeText,
      dayChange,
      dayChangeText: dayChange == null ? null : `${dayChange > 0 ? '+' : ''}${dayChange.toFixed(2)}`,
      dayChangePercent,
      dayChangePercentText,
      open: parseNumber(open),
      openText: open,
      high: parseNumber(high),
      highText: high,
      low: parseNumber(low),
      lowText: low,
      average: parseNumber(average),
      averageText: average,
      previousClose: previousCloseNum,
      previousCloseText: previousClose,
      tradingValueText: tradingValue ? `${tradingValue}亿` : null,
      tradingValue: parseNumber(tradingValue),
      volumeText: totalVolume,
      volume: parseNumber(totalVolume),
      insideText: insideRaw,
      outsideText: outsideRaw,
    },
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/tsmc-brief/live`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/tsmc-brief/stale`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const html = await fetchPage();
    const body = JSON.stringify(buildPayload(html));
    const liveResponse = new Response(body, { headers: jsonHeaders(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    const staleResponse = new Response(body, { headers: jsonHeaders(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
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
