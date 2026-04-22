const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';
const SNAPSHOT_TTL_SECONDS = 20;
const STALE_TTL_SECONDS = 180;
const DISCOVERY_LIMIT = 1000;
const MAX_BOOK_CANDIDATES = 140;
const MAX_RENDERED_MARKETS = 72;
const MAX_TOP_SIGNALS = 10;
const MAX_TOPIC_BUCKET = 12;
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)';

const FINANCE_INCLUDE_RE = new RegExp([
  '\\bfed\\b', '\\bfomc\\b', 'rate cut', 'rate cuts', 'rate hike', 'interest rate', 'terminal rate',
  '\\bcpi\\b', '\\bpce\\b', '\\bppi\\b', '\\bpmis?\\b', 'inflation', 'disinflation', 'deflation',
  'recession', '\\bgdp\\b', 'payrolls', 'nonfarm', 'unemployment', 'jobless', 'treasury', 'yield', '10y', '2y',
  'nasdaq', '\\bqqq\\b', '\\bspy\\b', 's&p', 'dow jones', '\\bvix\\b', 'russell 2000', 'nikkei', 'hang seng', 'hsi',
  '\\bnvda\\b', '\\btsla\\b', '\\baapl\\b', '\\bmsft\\b', '\\bmeta\\b', '\\bamzn\\b', '\\bgoogl\\b', '\\bgoogle\\b', '\\bmstr\\b', '\\bcoin\\b',
  'bitcoin', '\\bbtc\\b', 'ethereum', '\\beth\\b', 'solana', '\\bsol\\b', 'dogecoin', '\\bdoge\\b', 'crypto', 'stablecoin', 'altcoin',
  'gold', 'silver', 'copper', 'oil', 'crude', 'brent', 'wti', 'nat gas', 'natural gas', 'lng', 'commodity', 'uranium',
  'usd\\/jpy', 'usd\\/cny', 'usdcny', 'eurusd', 'dxy', 'dollar index', 'yen', 'yuan', 'fx', 'foreign exchange',
  'tariff', 'trump', 'senate', 'house', 'midterm', 'government shutdown', 'debt ceiling',
  'ukraine', 'russia', 'ceasefire', 'nato', 'iran', 'israel', 'gaza', 'war', 'geopolit', 'sanction', 'trade war'
].join('|'), 'i');

const HARD_EXCLUDE_RE = new RegExp([
  'xi jinping', '习近平', 'taiwan', '台湾', '台海',
  'highest temperature', 'lowest temperature', 'temperature in', 'weather', 'rain', 'snow', 'typhoon', 'earthquake',
  'gta\\s*vi', 'album', 'grammy', 'oscar', 'movie', 'streaming', 'sports?', 'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'ufc',
  'playboi', 'rihanna', 'lebron', 'kardashian', 'celebrity', 'top goal scorer', 'mvp', 'champion',
  'referendum', 'constitutional amendment', 'mayor', 'governor primary', 'election in',
  'tweet', 'tweets', 'post counter', 'xtracker', 'followers', 'subscribers',
  'released for purchase', 'download', 'box office'
].join('|'), 'i');

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/,/g, '').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseArrayish(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pctText(value, digits = 1) {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function ppText(value, digits = 1) {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}pct`;
}

function moneyText(value) {
  const n = Number(value || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function responseHeaders(cacheControl, cacheState) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': cacheState,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchJson(url, init = {}) {
  const resp = await fetch(url, {
    ...init,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json, text/plain, */*',
      ...(init.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} for ${url}`);
  return await resp.json();
}

async function fetchMarkets() {
  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set('limit', String(DISCOVERY_LIMIT));
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume24hr');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('include_tag', 'true');
  return await fetchJson(url.toString());
}

async function fetchBooksForTokens(tokenIds) {
  const all = [];
  for (const group of chunk(tokenIds, 40)) {
    const payload = group.map((tokenId) => ({ token_id: tokenId }));
    const books = await fetchJson(`${CLOB_BASE}/books`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (Array.isArray(books)) all.push(...books);
  }
  return all;
}

function getMarketText(market) {
  return [
    market.question || '',
    market.description || '',
    ...(market.events || []).map((event) => [event.title || '', event.description || '', event.subtitle || ''].join(' ')),
    ...(market.tags || []).map((tag) => `${tag?.label || ''} ${tag?.slug || ''}`),
  ].join(' ');
}

function classifyTopic(text) {
  const t = text.toLowerCase();
  if (/bitcoin|\bbtc\b|ethereum|\beth\b|solana|\bsol\b|dogecoin|\bdoge\b|crypto|stablecoin|altcoin/.test(t)) return '加密资产';
  if (/\bfed\b|\bfomc\b|rate cut|rate cuts|rate hike|interest rate|terminal rate|treasury|yield|10y|2y/.test(t)) return '美联储与利率';
  if (/\bcpi\b|\bpce\b|\bppi\b|\bpmis?\b|inflation|disinflation|deflation|recession|\bgdp\b|payrolls|nonfarm|unemployment|jobless/.test(t)) return '宏观数据';
  if (/gold|silver|copper|oil|crude|brent|wti|nat gas|natural gas|lng|commodity|uranium/.test(t)) return '大宗商品';
  if (/nasdaq|\bqqq\b|\bspy\b|s&p|dow jones|\bvix\b|russell 2000|nikkei|hang seng|hsi|\bnvda\b|\btsla\b|\baapl\b|\bmsft\b|\bmeta\b|\bamzn\b|\bgoogl\b|\bgoogle\b|\bmstr\b|\bcoin\b/.test(t)) return '股票与风险偏好';
  if (/usd\/jpy|usd\/cny|usdcny|eurusd|dxy|dollar index|yen|yuan|foreign exchange|\bfx\b/.test(t)) return '外汇';
  if (/ukraine|russia|ceasefire|nato|iran|israel|gaza|war|geopolit|china/.test(t)) return '地缘风险';
  if (/trump|senate|house|midterm|government shutdown|debt ceiling/.test(t)) return '美国政治';
  return '其他';
}

function pressureLabel(bidDepth, askDepth) {
  if (bidDepth > askDepth * 1.7) return '下方承接更厚';
  if (askDepth > bidDepth * 1.7) return '上方卖压更重';
  return '买卖盘相对均衡';
}

function calcNearDepth(book, refPrice) {
  const bids = Array.isArray(book?.bids) ? book.bids : [];
  const asks = Array.isArray(book?.asks) ? book.asks : [];
  const nearBidDepth = bids
    .filter((row) => parseNumber(row?.price) >= Math.max(0, refPrice - 0.03))
    .reduce((sum, row) => sum + parseNumber(row?.size), 0);
  const nearAskDepth = asks
    .filter((row) => parseNumber(row?.price) <= Math.min(1, refPrice + 0.03))
    .reduce((sum, row) => sum + parseNumber(row?.size), 0);
  return { nearBidDepth, nearAskDepth };
}

function scoreMarket(market, nearBidDepth, nearAskDepth) {
  const oneHour = Math.abs(parseNumber(market.oneHourPriceChange) * 100);
  const oneDay = Math.abs(parseNumber(market.oneDayPriceChange) * 100);
  const oneWeek = Math.abs(parseNumber(market.oneWeekPriceChange) * 100);
  const volume24hr = parseNumber(market.volume24hr || market.volume24hrClob);
  const liquidity = parseNumber(market.liquidityNum || market.liquidityClob || market.liquidity);
  const spread = parseNumber(market.spread);
  const imbalance = liquidity > 0 ? Math.abs(nearBidDepth - nearAskDepth) / Math.max(nearBidDepth + nearAskDepth, 1) : 0;
  return Math.round((
    oneHour * 1.35 +
    oneDay * 1.0 +
    oneWeek * 0.45 +
    Math.min((volume24hr / Math.max(liquidity, 1)) * 28, 25) +
    Math.min(Math.log10(volume24hr + 1) * 8, 20) +
    Math.max(0, (0.03 - spread) * 240) +
    imbalance * 18
  ) * 100) / 100;
}

function shortZhTitle(question = '') {
  return question
    .replace(/^Will\s+/i, '')
    .replace(/ by end of 2026\??$/i, '（到 2026 年底）')
    .replace(/ by December 31, 2026\??$/i, '（到 2026-12-31）')
    .replace(/ by June 30, 2026\??$/i, '（到 2026-06-30）')
    .replace(/\?$/, '')
    .replace(/Bitcoin/g, '比特币')
    .replace(/Ethereum/g, '以太坊')
    .replace(/Fed/g, '美联储')
    .replace(/Trump/g, '特朗普')
    .replace(/Russia/g, '俄罗斯')
    .replace(/Ukraine/g, '乌克兰')
    .replace(/recession/ig, '衰退')
    .trim();
}

function explainMarket(item) {
  const prob = `${item.yesPct.toFixed(1)}%`;
  const shortMove = item.oneHourChangePct ? `短线 ${pctText(item.oneHourChangePct)}` : `今日 ${pctText(item.oneDayChangePct)}`;
  const week = pctText(item.oneWeekChangePct);
  const pressure = item.pressureLabel;

  let assetMap = '更适合拿来观察风险偏好变化。';
  if (item.topic === '美联储与利率') assetMap = '通常会映射到美债、黄金、美元和成长股。';
  else if (item.topic === '加密资产') assetMap = '通常会映射到 BTC、ETH 以及高 beta 风险偏好。';
  else if (item.topic === '股票与风险偏好') assetMap = '更像美股风格和高 beta 风险偏好的前瞻温度计。';
  else if (item.topic === '大宗商品') assetMap = '适合联动原油、贵金属和通胀交易主线。';
  else if (item.topic === '外汇') assetMap = '适合联动美元、日元、人民币和全球风险偏好。';
  else if (item.topic === '地缘风险') assetMap = '适合联动避险资产和宏观风险溢价。';
  else if (item.topic === '美国政治') assetMap = '适合联动财政、关税和市场风险偏好叙事。';

  return `市场当前给这件事 ${prob} 的发生概率，${shortMove}，近一周 ${week}，${pressure}。${assetMap}`;
}

function financeMapping(item) {
  if (item.topic === '美联储与利率') return '资产映射：美债 / 黄金 / 纳指 / 美元';
  if (item.topic === '加密资产') return '资产映射：BTC / ETH / COIN / MSTR';
  if (item.topic === '股票与风险偏好') return '资产映射：纳指 / 七巨头 / 风险偏好';
  if (item.topic === '大宗商品') return '资产映射：原油 / 黄金 / 通胀交易';
  if (item.topic === '外汇') return '资产映射：美元指数 / 日元 / 人民币';
  if (item.topic === '地缘风险') return '资产映射：黄金 / 原油 / 避险情绪';
  if (item.topic === '美国政治') return '资产映射：关税 / 财政 / 风险偏好';
  return '资产映射：观察主线情绪变化';
}

function selectUniverse(markets) {
  const qualified = [];
  for (const market of markets) {
    const text = getMarketText(market);
    if (!FINANCE_INCLUDE_RE.test(text)) continue;
    if (HARD_EXCLUDE_RE.test(text)) continue;

    const outcomes = parseArrayish(market.outcomes);
    const outcomePrices = parseArrayish(market.outcomePrices).map(parseNumber);
    const tokenIds = parseArrayish(market.clobTokenIds);
    if (outcomes.length < 2 || outcomePrices.length < 2 || tokenIds.length < 2) continue;
    const yesIndex = outcomes.findIndex((value) => String(value).toLowerCase() === 'yes');
    const noIndex = outcomes.findIndex((value) => String(value).toLowerCase() === 'no');
    if (yesIndex < 0 || noIndex < 0) continue;

    const liquidity = parseNumber(market.liquidityNum || market.liquidityClob || market.liquidity);
    const volume24hr = parseNumber(market.volume24hr || market.volume24hrClob);
    if (liquidity < 3000 && volume24hr < 1500) continue;

    qualified.push({
      market,
      discoveryText: text,
      yesTokenId: tokenIds[yesIndex],
      noTokenId: tokenIds[noIndex],
      yesPrice: outcomePrices[yesIndex],
      noPrice: outcomePrices[noIndex],
      liquidity,
      volume24hr,
      topic: classifyTopic(text),
    });
  }

  qualified.sort((a, b) => {
    const aRank = a.volume24hr * 0.65 + a.liquidity * 0.35;
    const bRank = b.volume24hr * 0.65 + b.liquidity * 0.35;
    return bRank - aRank;
  });
  return qualified;
}

function buildSnapshot(qualifiedUniverse, booksByToken) {
  const enriched = qualifiedUniverse.map((entry) => {
    const market = entry.market;
    const book = booksByToken.get(entry.yesTokenId) || null;
    const { nearBidDepth, nearAskDepth } = calcNearDepth(book, entry.yesPrice);
    const oneHourChangePct = parseNumber(market.oneHourPriceChange) * 100;
    const oneDayChangePct = parseNumber(market.oneDayPriceChange) * 100;
    const oneWeekChangePct = parseNumber(market.oneWeekPriceChange) * 100;
    const score = scoreMarket(market, nearBidDepth, nearAskDepth);
    const item = {
      id: market.id,
      slug: market.slug,
      question: market.question,
      titleZh: shortZhTitle(market.question || ''),
      topic: entry.topic,
      url: market.slug ? `https://polymarket.com/event/${market.slug}` : 'https://polymarket.com',
      icon: market.icon || market.image || market.events?.[0]?.icon || market.events?.[0]?.image || null,
      endDate: market.endDate || market.endDateIso || market.events?.[0]?.endDate || null,
      yesPrice: entry.yesPrice,
      noPrice: entry.noPrice,
      yesPct: entry.yesPrice * 100,
      bestBid: parseNumber(market.bestBid),
      bestAsk: parseNumber(market.bestAsk),
      spread: parseNumber(market.spread),
      liquidity: entry.liquidity,
      volume24hr: entry.volume24hr,
      oneHourChangePct,
      oneDayChangePct,
      oneWeekChangePct,
      nearBidDepth,
      nearAskDepth,
      pressureLabel: pressureLabel(nearBidDepth, nearAskDepth),
      score,
      financeLine: financeMapping({ topic: entry.topic }),
    };
    item.noteZh = explainMarket(item);
    return item;
  });

  enriched.sort((a, b) => b.score - a.score);

  const rendered = enriched.slice(0, MAX_RENDERED_MARKETS);
  const topSignals = rendered.slice(0, MAX_TOP_SIGNALS);
  const wallSignals = [...rendered]
    .sort((a, b) => Math.abs(b.nearBidDepth - b.nearAskDepth) - Math.abs(a.nearBidDepth - a.nearAskDepth))
    .slice(0, MAX_TOP_SIGNALS);
  const liquidSignals = [...rendered]
    .sort((a, b) => (b.volume24hr + b.liquidity) - (a.volume24hr + a.liquidity))
    .slice(0, MAX_TOP_SIGNALS);

  const topicBuckets = new Map();
  for (const item of enriched) {
    if (!topicBuckets.has(item.topic)) topicBuckets.set(item.topic, []);
    const bucket = topicBuckets.get(item.topic);
    if (bucket.length < MAX_TOPIC_BUCKET) bucket.push(item);
  }

  const topicSummary = [...topicBuckets.entries()].map(([topic, items]) => ({
    topic,
    count: items.length,
    avgYesPct: items.reduce((sum, item) => sum + item.yesPct, 0) / Math.max(items.length, 1),
    avgWeekChangePct: items.reduce((sum, item) => sum + Math.abs(item.oneWeekChangePct), 0) / Math.max(items.length, 1),
    hottestTitle: items[0]?.titleZh || '--',
  })).sort((a, b) => b.count - a.count);

  const lead = topSignals[0] || null;
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: 'live-api',
    source: {
      discovery: 'Polymarket Gamma API /markets',
      orderbook: 'Polymarket CLOB API /books',
    },
    refreshMs: SNAPSHOT_TTL_SECONDS * 1000,
    universeCount: qualifiedUniverse.length,
    monitoredCount: rendered.length,
    topSignalCount: topSignals.length,
    total24hrVolume: rendered.reduce((sum, item) => sum + item.volume24hr, 0),
    lead,
    topicSummary,
    topSignals,
    wallSignals,
    liquidSignals,
    markets: rendered,
  };
}

async function buildRadarSnapshot() {
  const discovered = await fetchMarkets();
  const qualifiedUniverse = selectUniverse(Array.isArray(discovered) ? discovered : []);
  const bookCandidates = qualifiedUniverse.slice(0, MAX_BOOK_CANDIDATES);
  const books = await fetchBooksForTokens(bookCandidates.map((entry) => entry.yesTokenId));
  const booksByToken = new Map(books.map((book) => [String(book.asset_id), book]));
  return buildSnapshot(qualifiedUniverse, booksByToken);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/polymarket-radar/live`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/polymarket-radar/stale`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const body = JSON.stringify(await buildRadarSnapshot());
    const liveResponse = new Response(body, {
      headers: responseHeaders(`public, max-age=0, s-maxage=${SNAPSHOT_TTL_SECONDS}`, 'MISS'),
    });
    const staleResponse = new Response(body, {
      headers: responseHeaders(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
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
      headers: responseHeaders('no-store', 'ERROR'),
    });
  }
}
