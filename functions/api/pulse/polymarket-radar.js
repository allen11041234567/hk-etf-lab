const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';
const SNAPSHOT_TTL_SECONDS = 20;
const STALE_TTL_SECONDS = 180;
const DISCOVERY_LIMIT = 1000;
const MAX_BOOK_CANDIDATES = 120;
const MAX_RENDERED_MARKETS = 48;
const MAX_TOP_SIGNALS = 10;
const MAX_TOPIC_BUCKET = 10;
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
  'fdv', 'fully diluted', 'one day after launch', 'token launch', 'memecoin', 'airdrop',
  'best ai model', 'openai', 'anthropic', 'grok', 'chatgpt', 'llm', 'model benchmark',
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
  if (/\bfed\b|\bfomc\b|rate cut|rate cuts|rate hike|interest rate|terminal rate|treasury|yield|10y|2y/.test(t)) return '美联储与利率';
  if (/\bcpi\b|\bpce\b|\bppi\b|\bpmis?\b|inflation|disinflation|deflation|recession|\bgdp\b|payrolls|nonfarm|unemployment|jobless/.test(t)) return '宏观数据';
  if (/gold|silver|copper|oil|crude|brent|wti|nat gas|natural gas|lng|commodity|uranium/.test(t)) return '大宗商品';
  if (/usd\/jpy|usd\/cny|usdcny|eurusd|dxy|dollar index|yen|yuan|foreign exchange|\bfx\b/.test(t)) return '外汇';
  if (/nasdaq|\bqqq\b|\bspy\b|s&p|dow jones|\bvix\b|russell 2000|nikkei|hang seng|hsi|\bnvda\b|\btsla\b|\baapl\b|\bmsft\b|\bmeta\b|\bamzn\b|\bgoogl\b|\bgoogle\b|\bmstr\b|\bcoin\b/.test(t)) return '股票与风险偏好';
  if (/bitcoin|\bbtc\b|ethereum|\beth\b|solana|\bsol\b|dogecoin|\bdoge\b|crypto|stablecoin|altcoin/.test(t)) return '加密资产';
  if (/ukraine|russia|ceasefire|nato|iran|israel|gaza|war|geopolit|sanction|trade war/.test(t)) return '地缘风险';
  if (/trump|senate|house|midterm|government shutdown|debt ceiling|tariff/.test(t)) return '美国政治';
  return '其他';
}

function topicBaseWeight(topic) {
  if (topic === '美联储与利率') return 42;
  if (topic === '宏观数据') return 38;
  if (topic === '大宗商品') return 31;
  if (topic === '外汇') return 29;
  if (topic === '股票与风险偏好') return 24;
  if (topic === '地缘风险') return 18;
  if (topic === '加密资产') return 9;
  if (topic === '美国政治') return 8;
  return 0;
}

function financeIntentScore(text) {
  const t = text.toLowerCase();
  let score = 0;
  if (/\bfed\b|\bfomc\b|rate cut|rate cuts|rate hike|interest rate|terminal rate/.test(t)) score += 42;
  if (/\bcpi\b|\bpce\b|\bppi\b|\bpmis?\b|inflation|recession|\bgdp\b|payrolls|unemployment|jobless/.test(t)) score += 36;
  if (/gold|silver|copper|oil|crude|brent|wti|nat gas|natural gas|lng|commodity|uranium/.test(t)) score += 28;
  if (/usd\/jpy|usd\/cny|usdcny|eurusd|dxy|dollar index|yen|yuan|foreign exchange|\bfx\b/.test(t)) score += 26;
  if (/nasdaq|\bqqq\b|\bspy\b|s&p|dow jones|\bvix\b|russell 2000|nikkei|hang seng|hsi/.test(t)) score += 22;
  if (/\bnvda\b|\btsla\b|\baapl\b|\bmsft\b|\bmeta\b|\bamzn\b|\bgoogl\b|\bgoogle\b|\bmstr\b|\bcoin\b/.test(t)) score += 10;
  if (/bitcoin|\bbtc\b|ethereum|\beth\b|solana|\bsol\b|crypto|stablecoin|altcoin/.test(t)) score += 6;
  if (/ukraine|russia|ceasefire|nato|iran|israel|gaza|war|geopolit|sanction|trade war/.test(t)) score += 10;
  if (/trump|tariff|government shutdown|debt ceiling/.test(t)) score += 7;
  return score;
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

function scoreMarket(market, nearBidDepth, nearAskDepth, topic, discoveryText) {
  const oneHour = Math.abs(parseNumber(market.oneHourPriceChange) * 100);
  const oneDay = Math.abs(parseNumber(market.oneDayPriceChange) * 100);
  const oneWeek = Math.abs(parseNumber(market.oneWeekPriceChange) * 100);
  const volume24hr = parseNumber(market.volume24hr || market.volume24hrClob);
  const liquidity = parseNumber(market.liquidityNum || market.liquidityClob || market.liquidity);
  const spread = parseNumber(market.spread);
  const imbalance = liquidity > 0 ? Math.abs(nearBidDepth - nearAskDepth) / Math.max(nearBidDepth + nearAskDepth, 1) : 0;
  const financePriority = topicBaseWeight(topic) + financeIntentScore(discoveryText);
  const eventMoveScore = oneHour * 0.9 + oneDay * 0.85 + oneWeek * 0.35;
  const tradabilityScore = Math.min((volume24hr / Math.max(liquidity, 1)) * 20, 16) + Math.min(Math.log10(volume24hr + 1) * 6, 15) + Math.max(0, (0.025 - spread) * 220) + imbalance * 14;
  return Math.round((financePriority * 1.4 + eventMoveScore + tradabilityScore) * 100) / 100;
}

function toZhDate(label = '') {
  const months = {
    january: '1', february: '2', march: '3', april: '4', may: '5', june: '6',
    july: '7', august: '8', september: '9', october: '10', november: '11', december: '12'
  };
  const m = String(label).trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!m) return label;
  const month = months[m[1].toLowerCase()] || m[1];
  const day = String(Number(m[2]));
  const year = m[3] || '2026';
  return `${year} 年 ${month} 月 ${day} 日`;
}

function shortZhTitle(question = '') {
  let q = (question || '').trim();
  if (!q) return '--';

  const exactRules = [
    [/^Will no Fed rate cuts happen in 2026\?$/i, '2026 年美联储会零降息吗'],
    [/^Will (\d+) Fed rate cuts happen in 2026\?$/i, (_, n) => `2026 年会出现 ${n} 次美联储降息吗`],
    [/^Will Bitcoin hit \$([\d.]+[kKmM]?) by June 30, 2026\?$/i, (_, p) => `比特币会在 2026 年 6 月 30 日前触及 ${p} 美元吗`],
    [/^Will Bitcoin hit \$([\d.]+[kKmM]?) by December 31, 2026\?$/i, (_, p) => `比特币会在 2026 年 12 月 31 日前触及 ${p} 美元吗`],
    [/^US recession by end of 2026\?$/i, '美国会在 2026 年底前陷入衰退吗'],
    [/^USD\.AI FDV above \$([\d.]+[kKmM]?) one day after launch\?$/i, (_, p) => `USD.AI 上线一天后估值会高于 ${p} 美元吗`],
    [/^US x Iran diplomatic meeting by ([A-Za-z]+ \d{1,2}, 2026)\?$/i, (_, d) => `美国与伊朗会在 ${toZhDate(d)}前举行外交会晤吗`],
    [/^US x Iran ceasefire extended by ([A-Za-z]+ \d{1,2}, 2026)\?$/i, (_, d) => `美国与伊朗停火会在 ${toZhDate(d)}前延长吗`],
    [/^Will Steve Witkoff have a diplomatic meeting with Iran by ([A-Za-z]+ \d{1,2})\??$/i, (_, d) => `Steve Witkoff 会在 ${toZhDate(d)}前与伊朗举行外交会晤吗`],
    [/^Will J\.D\. Vance have a diplomatic meeting with Iran by ([A-Za-z]+ \d{1,2})\??$/i, (_, d) => `J.D. Vance 会在 ${toZhDate(d)}前与伊朗举行外交会晤吗`],
    [/^Will Iran agree to end enrichment of uranium by ([A-Za-z]+ \d{1,2})\??$/i, (_, d) => `伊朗会在 ${toZhDate(d)}前同意停止铀浓缩吗`],
    [/^Will Trump agree to Iranian enrichment of uranium in April\??$/i, '特朗普会在 4 月同意伊朗进行铀浓缩吗'],
    [/^Will there be no change in Fed rates after the April 2026 meeting\?$/i, '2026 年 4 月议息会议后，美联储会维持利率不变吗'],
    [/^Will there be no change in Fed interest rates after the April 2026 meeting\?$/i, '2026 年 4 月议息会议后，美联储会维持利率不变吗'],
    [/^Will the Fed decrease interest rates by 25 bps after the April 2026 meeting\?$/i, '2026 年 4 月议息会议后，美联储会降息 25 个基点吗'],
    [/^Will ([A-Za-z .'-]+) be confirmed as Fed Chair\?$/i, (_, name) => `${name.trim()} 会被确认出任美联储主席吗`],
  ];
  for (const [re, value] of exactRules) {
    const m = q.match(re);
    if (m) return typeof value === 'function' ? value(...m) : value;
  }

  q = q.replace(/^Will\s+/i, '');
  q = q.replace(/\?$/, '');
  q = q.replace(/ by end of 2026$/i, '（到 2026 年底）');
  q = q.replace(/ by December 31, 2026$/i, '（到 2026 年 12 月 31 日）');
  q = q.replace(/ by June 30, 2026$/i, '（到 2026 年 6 月 30 日）');
  q = q.replace(/ by ([A-Za-z]+ \d{1,2}, 2026)$/i, (_, d) => `（到 ${toZhDate(d)}）`);
  q = q.replace(/ by ([A-Za-z]+ \d{1,2})$/i, (_, d) => `（到 ${toZhDate(d)}）`);
  q = q.replace(/ one day after launch$/i, '（上线 1 天后）');
  q = q.replace(/ above \$/ig, '高于 ');
  q = q.replace(/ below \$/ig, '低于 ');
  q = q.replace(/\$/g, '');

  const dict = [
    [/Bitcoin/g, '比特币'],
    [/Ethereum/g, '以太坊'],
    [/Fed Chair/g, '美联储主席'],
    [/Fed/g, '美联储'],
    [/interest rates?/ig, '利率'],
    [/rate cuts?/ig, '降息'],
    [/rate hikes?/ig, '加息'],
    [/Trump/g, '特朗普'],
    [/Russia/g, '俄罗斯'],
    [/Ukraine/g, '乌克兰'],
    [/Iranian/ig, '伊朗'],
    [/Iran/g, '伊朗'],
    [/US x /g, '美国与'],
    [/US /g, '美国 '],
    [/recession/ig, '衰退'],
    [/ceasefire/ig, '停火'],
    [/diplomatic meeting/ig, '外交会晤'],
    [/agree to end enrichment of uranium/ig, '同意停止铀浓缩'],
    [/agrees to end enrichment of uranium/ig, '会同意停止铀浓缩'],
    [/agree to enrichment of uranium/ig, '同意进行铀浓缩'],
    [/inflation/ig, '通胀'],
    [/tariff/ig, '关税'],
    [/gold/ig, '黄金'],
    [/oil/ig, '原油'],
    [/FDV/g, '估值'],
    [/launch/ig, '上线'],
    [/OpenAI/g, 'OpenAI'],
    [/best AI model/ig, '最佳 AI 模型'],
    [/have a /ig, '进行'],
    [/be confirmed as/ig, '被确认为'],
    [/there be no change in/ig, '将维持不变：'],
    [/decrease 利率 by 25 bps/ig, '降息 25 个基点'],
    [/ with /ig, '与'],
  ];
  for (const [re, to] of dict) q = q.replace(re, to);
  return q.trim();
}

function explainMarket(item) {
  const prob = `${item.yesPct.toFixed(1)}%`;
  const shortMove = Math.abs(item.oneHourChangePct) >= 0.1 ? `最近 1 小时变化 ${pctText(item.oneHourChangePct)}` : `最近 1 天变化 ${pctText(item.oneDayChangePct)}`;
  const week = pctText(item.oneWeekChangePct);
  const pressure = item.pressureLabel;

  let marketLine = '更适合当作风险偏好变化的前瞻温度计。';
  let assetLine = '先观察市场叙事强弱，再决定是否值得继续跟踪。';
  if (item.topic === '美联储与利率') {
    marketLine = '这是典型的利率预期信号，核心看市场是否在重新定价未来降息或加息路径。';
    assetLine = '如果概率快速抬升，通常更容易传导到美债、黄金、美元和成长股。';
  } else if (item.topic === '宏观数据') {
    marketLine = '这是宏观数据预期信号，核心看市场是否在提前押注通胀、增长或就业变化。';
    assetLine = '如果方向持续强化，通常会影响美债收益率、美元和全球风险资产。';
  } else if (item.topic === '大宗商品') {
    marketLine = '这是商品主线信号，核心看供需、地缘和通胀交易是否在升温。';
    assetLine = '更适合联动原油、黄金、工业金属以及通胀交易框架一起看。';
  } else if (item.topic === '外汇') {
    marketLine = '这是外汇定价信号，核心看美元强弱和跨市场风险偏好是否切换。';
    assetLine = '更适合联动美元指数、日元、人民币以及全球股债节奏。';
  } else if (item.topic === '股票与风险偏好') {
    marketLine = '这是股市风格和风险偏好信号，核心看资金更偏进攻还是防守。';
    assetLine = '更适合拿来辅助观察纳指、科技龙头和高 beta 方向。';
  } else if (item.topic === '加密资产') {
    marketLine = '这是加密情绪信号，核心看高波动资产的风险偏好是否在继续升温或降温。';
    assetLine = '更适合联动比特币、以太坊以及高弹性相关资产一起看。';
  } else if (item.topic === '地缘风险') {
    marketLine = '这是地缘风险信号，核心看避险溢价是否在上升。';
    assetLine = '更适合联动黄金、原油和全球风险资产的回撤压力一起看。';
  } else if (item.topic === '美国政治') {
    marketLine = '这是政策和政治不确定性信号，核心看财政、关税或监管预期是否在变化。';
    assetLine = '更适合联动关税预期、财政交易和风险偏好框架。';
  }

  return `当前市场给这件事 ${prob} 的概率定价，${shortMove}，近一周 ${week}，盘口上看 ${pressure}。${marketLine}${assetLine}`;
}

function financeMapping(item) {
  if (item.topic === '美联储与利率') return '对应资产：美债 / 黄金 / 纳指 / 美元';
  if (item.topic === '加密资产') return '对应资产：比特币 / 以太坊 / COIN / MSTR';
  if (item.topic === '股票与风险偏好') return '对应资产：纳指 / 七巨头 / 风险偏好';
  if (item.topic === '大宗商品') return '对应资产：原油 / 黄金 / 通胀交易';
  if (item.topic === '外汇') return '对应资产：美元指数 / 日元 / 人民币';
  if (item.topic === '地缘风险') return '对应资产：黄金 / 原油 / 避险情绪';
  if (item.topic === '美国政治') return '对应资产：关税 / 财政 / 风险偏好';
  return '对应资产：观察主线情绪变化';
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
    const score = scoreMarket(market, nearBidDepth, nearAskDepth, entry.topic, entry.discoveryText);
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
      financePriority: topicBaseWeight(entry.topic) + financeIntentScore(entry.discoveryText),
      financeLine: financeMapping({ topic: entry.topic }),
    };
    item.noteZh = explainMarket(item);
    return item;
  });

  enriched.sort((a, b) => b.score - a.score);

  const rendered = enriched
    .filter((item) => item.financePriority >= 26)
    .slice(0, MAX_RENDERED_MARKETS);
  const preferredLead = rendered.filter((item) => ['美联储与利率', '宏观数据', '大宗商品', '外汇', '股票与风险偏好'].includes(item.topic));
  const topSignals = (preferredLead.length ? preferredLead : rendered).slice(0, MAX_TOP_SIGNALS);
  const wallSignals = [...rendered]
    .sort((a, b) => Math.abs(b.nearBidDepth - b.nearAskDepth) - Math.abs(a.nearBidDepth - a.nearAskDepth))
    .slice(0, MAX_TOP_SIGNALS);
  const liquidSignals = [...rendered]
    .sort((a, b) => (b.volume24hr + b.liquidity + b.financePriority * 500) - (a.volume24hr + a.liquidity + a.financePriority * 500))
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
    avgPriority: items.reduce((sum, item) => sum + item.financePriority, 0) / Math.max(items.length, 1),
  })).sort((a, b) => b.avgPriority - a.avgPriority || b.count - a.count);

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
