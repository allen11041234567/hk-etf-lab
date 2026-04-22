const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';
const DATA_API_BASE = 'https://data-api.polymarket.com';
const SNAPSHOT_TTL_SECONDS = 20;
const STALE_TTL_SECONDS = 180;
const ANOMALY_BASELINE_SECONDS = 3600;
const DISCOVERY_LIMIT = 1000;
const MAX_BOOK_CANDIDATES = 120;
const MAX_RENDERED_MARKETS = 48;
const MAX_TOP_SIGNALS = 10;
const MAX_TOPIC_BUCKET = 10;
const MAX_ANOMALIES = 8;
const MAX_SMART_MONEY = 8;
const MAX_SMART_MONEY_MARKETS = 4;
const MAX_SMART_WALLETS = 6;
const MAX_SMART_ACTIONS = 8;
const MAX_SEED_WALLETS = 30;
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

function parseMaybeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
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

function maskWallet(address = '') {
  const text = String(address || '');
  if (text.length < 12) return text || '--';
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function signedMoneyText(value) {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${moneyText(Math.abs(n))}`;
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

async function fetchSeedWallets(limit = MAX_SEED_WALLETS) {
  const url = new URL('https://polymarketanalytics.com/api/traders-tag-performance');
  url.searchParams.set('tag', 'Overall');
  url.searchParams.set('page', '1');
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('sortBy', 'rank');
  url.searchParams.set('sortDesc', 'false');
  const payload = await fetchJson(url.toString(), {
    headers: { referer: 'https://polymarketanalytics.com/traders' },
  });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => ({
    wallet: String(row.trader || '').toLowerCase(),
    displayName: row.trader_name || maskWallet(row.trader || ''),
    rank: Number(row.rank || 0),
    overallGain: Number(row.overall_gain || 0),
    activePositions: Number(row.active_positions || 0),
    totalCurrentValue: Number(row.total_current_value || 0),
    totalPositions: Number(row.total_positions || 0),
    winRate: Number(row.win_rate || 0),
    traderTags: row.trader_tags || '',
    source: 'leaderboard-seed',
  })).filter((row) => row.wallet);
}

async function fetchMarketPositions(conditionId, limit = 6) {
  const url = new URL(`${DATA_API_BASE}/v1/market-positions`);
  url.searchParams.set('market', conditionId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sortBy', 'TOTAL_PNL');
  url.searchParams.set('sortDirection', 'DESC');
  url.searchParams.set('status', 'OPEN');
  return await fetchJson(url.toString());
}

async function fetchUserValue(wallet) {
  const url = new URL(`${DATA_API_BASE}/value`);
  url.searchParams.set('user', wallet);
  const rows = await fetchJson(url.toString());
  return Array.isArray(rows) ? Number(rows[0]?.value || 0) : 0;
}

async function fetchUserTrades(wallet, markets = [], limit = 12) {
  const url = new URL(`${DATA_API_BASE}/trades`);
  url.searchParams.set('user', wallet);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('takerOnly', 'true');
  if (markets.length) url.searchParams.set('market', markets.join(','));
  return await fetchJson(url.toString());
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
  const oneHour = Math.abs((parseMaybeNumber(market.oneHourPriceChange) ?? 0) * 100);
  const oneDay = Math.abs((parseMaybeNumber(market.oneDayPriceChange) ?? 0) * 100);
  const oneWeek = Math.abs((parseMaybeNumber(market.oneWeekPriceChange) ?? 0) * 100);
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

function trendLabel(item) {
  const day = Number(item.oneDayChangePct || 0);
  const week = Number(item.oneWeekChangePct || 0);
  if (day >= 6) return '24 小时趋势很强';
  if (day >= 2) return '24 小时趋势偏强';
  if (day <= -6) return '24 小时趋势很弱';
  if (day <= -2) return '24 小时趋势偏弱';
  if (Math.abs(week) >= 10) return '日内一般，但周趋势不小';
  return '24 小时趋势中性';
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

function anomalyNarrative(item) {
  const oneHour = Number(item.yesDeltaPct || 0);
  const oneDay = Number(item.oneDayChangePct || 0);
  const oneWeek = Number(item.oneWeekChangePct || 0);
  const dayText = oneDay >= 0 ? `24 小时也在走强 ${pctText(oneDay)}` : `但 24 小时仍偏弱 ${pctText(oneDay)}`;
  const weekText = Math.abs(oneWeek) >= 6 ? `，近一周累计 ${pctText(oneWeek)}` : '';
  if (Math.abs(oneHour) >= 6) return `1 小时明显改价 ${pctText(oneHour)}，${dayText}${weekText}。`;
  if (Math.abs(oneHour) >= 3) return `1 小时变化 ${pctText(oneHour)}，${dayText}${weekText}。`;
  if (Math.abs(oneDay) >= 6) return `短时不是爆点，但 24 小时方向已经清楚，${dayText}${weekText}。`;
  return `短时异动不算极端，但结合盘口和成交，已经值得盯。${dayText}${weekText}。`;
}

function buildResonance(item) {
  const hasAnomaly = Number(item.anomalyScore || 0) >= 9 || Math.abs(Number(item.yesDeltaPct || 0)) >= 3;
  const trendStrength = Math.abs(Number(item.oneDayChangePct || 0)) >= 4 || Math.abs(Number(item.oneWeekChangePct || 0)) >= 8;
  const smartMoney = (item.smartParticipation?.walletCount || 0) > 0;
  const parts = [];
  if (hasAnomaly) parts.push('异动');
  if (trendStrength) parts.push('趋势');
  if (smartMoney) parts.push('重点账户');
  let level = '单点观察';
  if (parts.length === 3) level = '三重共振';
  else if (parts.length === 2) level = '双重共振';
  const summary = parts.length ? `${level}，当前同时满足 ${parts.join(' + ')}` : '当前以单点信息为主';
  return { resonanceLevel: level, resonanceParts: parts, resonanceSummary: summary };
}

function intelLine(item) {
  const move = Math.abs(Number(item.yesDeltaPct || 0)) >= 3
    ? `1 小时概率 ${pctText(item.yesDeltaPct)}`
    : `24 小时趋势 ${pctText(item.oneDayChangePct)}`;
  const money = item.smartParticipation?.walletCount
    ? `${item.smartParticipation.walletCount} 个重点账户参与，${item.smartParticipation.buyCount > item.smartParticipation.sellCount ? '偏买入' : item.smartParticipation.sellCount > item.smartParticipation.buyCount ? '偏卖出' : '多空都有'}`
    : '暂未看到重点账户共振';
  return `${item.titleZh}，${move}，${money}。`;
}

function marketPriority(item) {
  return (item.resonanceParts || []).length * 100
    + Number(item.anomalyScore || 0)
    + Math.abs(Number(item.oneDayChangePct || 0))
    + Math.abs(Number(item.yesDeltaPct || 0)) * 2
    + ((item.smartParticipation?.walletCount || 0) * 6);
}

function buildHeadlineSummary(themes = [], mustWatch = []) {
  const topTheme = themes[0] || null;
  const secondTheme = themes[1] || null;
  const leadMarket = mustWatch[0] || null;
  if (!topTheme && !leadMarket) {
    return {
      short: '当前金融预测市场整体偏分散，暂时没有特别强的集中主线。',
      long: '当前更适合先盯 1 小时异动和重点账户最近动作，等待更明确的主线聚焦。',
    };
  }
  const themeLine = topTheme
    ? `当前最强主线是${topTheme.topic}，整体${topTheme.tilt}`
    : '当前市场主线还不够集中';
  const secondLine = secondTheme ? `，其次是${secondTheme.topic}` : '';
  const marketLine = leadMarket ? `。最值得盯的市场是${leadMarket.titleZh}` : '。';
  const moneyLine = topTheme ? `重点账户这条线最近有 ${topTheme.walletCount} 个账户、${topTheme.tradeCount} 笔动作` : '';
  return {
    short: `${themeLine}${secondLine}${marketLine}`,
    long: `${themeLine}${secondLine}，${moneyLine || '先看异动再等主线确认'}。${leadMarket ? leadMarket.intelLine : ''}`,
  };
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

function detectAnomalies(currentItems, baselineItems = []) {
  const baselineMap = new Map((baselineItems || []).map((item) => [String(item.id), item]));
  const hasBaseline = baselineMap.size > 0;
  const scored = currentItems
    .map((item) => {
      const prev = baselineMap.get(String(item.id));
      const yesDeltaPct = prev ? item.yesPct - Number(prev.yesPct || 0) : Number(item.oneHourChangePct || 0);
      const volumeDelta = prev ? item.volume24hr - Number(prev.volume24hr || 0) : Math.max(0, Number(item.volume24hr || 0) * 0.15);
      const scoreDelta = prev ? item.score - Number(prev.score || 0) : Number(item.score || 0) * 0.08;
      const wallDelta = prev
        ? Math.abs(item.nearBidDepth - item.nearAskDepth) - Math.abs(Number(prev.nearBidDepth || 0) - Number(prev.nearAskDepth || 0))
        : Math.abs(Number(item.nearBidDepth || 0) - Number(item.nearAskDepth || 0)) * 0.12;
      const anomalyScore = Math.abs(yesDeltaPct) * 8
        + Math.min(Math.abs(volumeDelta) / 4000, 18)
        + Math.min(Math.abs(scoreDelta) * 0.7, 14)
        + Math.min(Math.abs(wallDelta) / 3000, 12);
      let trigger = hasBaseline ? '1 小时内整体变化不大' : '基线未满，先按当前 1 小时活跃度展示';
      if (Math.abs(yesDeltaPct) >= 4) trigger = `1 小时概率跳变 ${pctText(yesDeltaPct)}`;
      else if (Math.abs(volumeDelta) >= 25000) trigger = `1 小时放量 ${moneyText(volumeDelta > 0 ? volumeDelta : -volumeDelta)}`;
      else if (Math.abs(wallDelta) >= 18000) trigger = hasBaseline ? '1 小时内近价盘口厚度明显重排' : '当前盘口厚度变化值得关注';
      else if (Math.abs(scoreDelta) >= 10) trigger = hasBaseline ? `1 小时综合优先级抬升 ${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)}` : '当前综合优先级靠前';
      return {
        ...item,
        yesDeltaPct: Math.round(yesDeltaPct * 10) / 10,
        volumeDelta,
        scoreDelta: Math.round(scoreDelta * 10) / 10,
        wallDelta,
        anomalyScore: Math.round(anomalyScore * 10) / 10,
        anomalyTrigger: trigger,
      };
    })
    .sort((a, b) => b.anomalyScore - a.anomalyScore);

  const strictHits = scored.filter((item) => item.anomalyScore >= 9).slice(0, MAX_ANOMALIES);
  if (strictHits.length) return strictHits;
  return scored
    .filter((item) => Math.abs(Number(item.oneHourChangePct || 0)) >= 0.8 || Math.abs(Number(item.oneDayChangePct || 0)) >= 2 || Number(item.score || 0) >= 60)
    .slice(0, MAX_ANOMALIES);
}

function buildSmartMoneyCandidates(items) {
  return [...items]
    .map((item) => {
      const bidLead = item.nearBidDepth - item.nearAskDepth;
      const absorbRatio = item.nearAskDepth > 0 ? item.nearBidDepth / item.nearAskDepth : item.nearBidDepth > 0 ? 9 : 1;
      const tradability = Math.max(0, 0.03 - Number(item.spread || 0)) * 600;
      const flowScore = Math.min(Math.log10(item.volume24hr + 1) * 8, 22)
        + Math.min(Math.abs(bidLead) / 3000, 18)
        + Math.min(Math.abs(item.oneHourChangePct) * 0.9, 14)
        + tradability;
      let style = '盘口相对均衡';
      if (bidLead > 0 && absorbRatio >= 1.5) style = '承接更厚，像有人在下面接';
      else if (bidLead < 0 && absorbRatio <= 0.67) style = '卖压更重，像有人在上面压';
      else if (Math.abs(item.oneHourChangePct) >= 2) style = '短时主动性更强';
      return {
        ...item,
        smartMoneyScore: Math.round(flowScore * 10) / 10,
        smartMoneyStyle: style,
      };
    })
    .sort((a, b) => b.smartMoneyScore - a.smartMoneyScore)
    .slice(0, MAX_SMART_MONEY);
}

function buildSnapshot(qualifiedUniverse, booksByToken, previousSnapshot = null) {
  const enriched = qualifiedUniverse.map((entry) => {
    const market = entry.market;
    const book = booksByToken.get(entry.yesTokenId) || null;
    const { nearBidDepth, nearAskDepth } = calcNearDepth(book, entry.yesPrice);
    const oneHourChangePct = parseMaybeNumber(market.oneHourPriceChange);
    const oneDayChangePct = parseMaybeNumber(market.oneDayPriceChange);
    const oneWeekChangePct = parseMaybeNumber(market.oneWeekPriceChange);
    const score = scoreMarket(market, nearBidDepth, nearAskDepth, entry.topic, entry.discoveryText);
    const item = {
      id: market.id,
      slug: market.slug,
      question: market.question,
      titleZh: shortZhTitle(market.question || ''),
      topic: entry.topic,
      conditionId: market.conditionId || null,
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
      oneHourChangePct: oneHourChangePct == null ? null : oneHourChangePct * 100,
      oneDayChangePct: oneDayChangePct == null ? null : oneDayChangePct * 100,
      oneWeekChangePct: oneWeekChangePct == null ? null : oneWeekChangePct * 100,
      nearBidDepth,
      nearAskDepth,
      pressureLabel: pressureLabel(nearBidDepth, nearAskDepth),
      score,
      financePriority: topicBaseWeight(entry.topic) + financeIntentScore(entry.discoveryText),
      financeLine: financeMapping({ topic: entry.topic }),
    };
    item.noteZh = explainMarket(item);
    item.trendLabel = trendLabel(item);
    item.anomalyNarrative = '';
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

  const anomalySignals = detectAnomalies(rendered, previousSnapshot?.markets || []).map((item) => ({
    ...item,
    anomalyNarrative: anomalyNarrative(item),
  }));
  const smartMoneyCandidates = buildSmartMoneyCandidates(rendered);
  const lead = anomalySignals[0] || topSignals[0] || null;
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
    baselineWindowMinutes: Math.round(ANOMALY_BASELINE_SECONDS / 60),
    lead,
    topicSummary,
    topSignals,
    anomalySignals,
    smartMoneyCandidates,
    wallSignals,
    liquidSignals,
    markets: rendered,
  };
}

async function buildSmartMoneyLayer(snapshot) {
  const focusMarkets = [];
  for (const item of [...(snapshot.anomalySignals || []), ...(snapshot.topSignals || [])]) {
    if (!item?.conditionId) continue;
    if (focusMarkets.some((x) => x.conditionId === item.conditionId)) continue;
    focusMarkets.push({ conditionId: item.conditionId, titleZh: item.titleZh, topic: item.topic, financeLine: item.financeLine });
    if (focusMarkets.length >= MAX_SMART_MONEY_MARKETS) break;
  }
  if (!focusMarkets.length) return { smartMoneyOverview: [], smartMoneyActions: [] };

  const seedWallets = await fetchSeedWallets().catch(() => []);
  const seedWalletMap = new Map(seedWallets.map((w) => [w.wallet, w]));

  const marketRows = await Promise.all(focusMarkets.map(async (m) => {
    try {
      const rows = await fetchMarketPositions(m.conditionId, 6);
      return { ...m, rows: Array.isArray(rows) ? rows : [] };
    } catch {
      return { ...m, rows: [] };
    }
  }));

  const walletMap = new Map();
  for (const market of marketRows) {
    for (const tokenBlock of market.rows || []) {
      for (const pos of tokenBlock.positions || []) {
        const wallet = String(pos.proxyWallet || '');
        if (!wallet) continue;
        const seed = seedWalletMap.get(wallet.toLowerCase()) || null;
        const current = walletMap.get(wallet) || {
          seed,
          source: seed ? 'leaderboard-seed' : 'focus-market-derived',
          seedRank: seed?.rank ?? null,
          leaderboardGain: seed?.overallGain ?? null,
          leaderboardWinRate: seed?.winRate ?? null,
          traderTags: seed?.traderTags ?? '',
          wallet,
          wallet,
          displayName: pos.name || pos.pseudonym || maskWallet(wallet),
          verified: Boolean(pos.verified),
          totalPnl: 0,
          currentValue: 0,
          markets: [],
          bestPosition: null,
        };
        current.totalPnl += Number(pos.totalPnl || 0);
        current.currentValue += Number(pos.currentValue || 0);
        current.markets.push({
          conditionId: market.conditionId,
          titleZh: market.titleZh,
          topic: market.topic,
          financeLine: market.financeLine,
          outcome: pos.outcome,
          size: Number(pos.size || 0),
          currentValue: Number(pos.currentValue || 0),
          totalPnl: Number(pos.totalPnl || 0),
        });
        if (!current.bestPosition || Number(pos.totalPnl || 0) > Number(current.bestPosition.totalPnl || 0)) {
          current.bestPosition = {
            titleZh: market.titleZh,
            outcome: pos.outcome,
            size: Number(pos.size || 0),
            currentValue: Number(pos.currentValue || 0),
            totalPnl: Number(pos.totalPnl || 0),
          };
        }
        walletMap.set(wallet, current);
      }
    }
  }

  const topWallets = [...walletMap.values()]
    .map((wallet) => {
      const diversity = new Set(wallet.markets.map((m) => m.conditionId)).size;
      const smartScore = Math.round((Math.min(Math.log10(Math.max(wallet.totalPnl, 1) + 1) * 22, 46)
        + Math.min(Math.log10(wallet.currentValue + 1) * 14, 20)
        + diversity * 6
        + (wallet.verified ? 6 : 0)
        + (wallet.seedRank ? Math.max(0, 10 - wallet.seedRank / 4) : 0)
        + (wallet.leaderboardGain ? Math.min(Math.log10(Math.max(wallet.leaderboardGain, 1) + 1) * 4, 10) : 0)) * 10) / 10;
      return { ...wallet, diversity, smartScore };
    })
    .filter((wallet) => wallet.seed || wallet.totalPnl > 0 || wallet.currentValue > 500)
    .sort((a, b) => (a.seed && !b.seed) ? -1 : (!a.seed && b.seed) ? 1 : b.smartScore - a.smartScore)
    .slice(0, MAX_SMART_WALLETS);

  const focusConditionIds = focusMarkets.map((m) => m.conditionId);
  const detailedWallets = await Promise.all(topWallets.map(async (wallet) => {
    try {
      const [value, trades] = await Promise.all([
        fetchUserValue(wallet.wallet).catch(() => wallet.currentValue),
        fetchUserTrades(wallet.wallet, focusConditionIds, 10).catch(() => []),
      ]);
      const recentTrades = Array.isArray(trades) ? trades.slice(0, 3).map((trade) => ({
        wallet: wallet.wallet,
        displayName: wallet.displayName,
        smartScore: wallet.smartScore,
        verified: wallet.verified,
        side: trade.side,
        titleZh: shortZhTitle(trade.title || ''),
        outcome: trade.outcome,
        size: Number(trade.size || 0),
        price: Number(trade.price || 0),
        usdcSize: Number(trade.size || 0) * Number(trade.price || 0),
        timestamp: Number(trade.timestamp || 0),
        topic: wallet.markets.find((m) => m.conditionId === trade.conditionId)?.topic || '',
        financeLine: wallet.markets.find((m) => m.conditionId === trade.conditionId)?.financeLine || '',
      })) : [];
      return { ...wallet, portfolioValue: Number(value || wallet.currentValue || 0), recentTrades };
    } catch {
      return { ...wallet, portfolioValue: wallet.currentValue || 0, recentTrades: [] };
    }
  }));

  const smartMoneyOverview = detailedWallets.map((wallet) => ({
    wallet: wallet.wallet,
    walletShort: maskWallet(wallet.wallet),
    displayName: wallet.displayName,
    verified: wallet.verified,
    smartScore: wallet.smartScore,
    totalPnl: wallet.totalPnl,
    portfolioValue: wallet.portfolioValue,
    diversity: wallet.diversity,
    focusTitleZh: wallet.bestPosition?.titleZh || '--',
    focusOutcome: wallet.bestPosition?.outcome || '--',
    focusPnl: Number(wallet.bestPosition?.totalPnl || 0),
    summaryZh: `${wallet.seed ? '榜单种子账户' : '补充观察账户'} ${wallet.displayName || maskWallet(wallet.wallet)} 最近在高优先级市场里更像持续型盈利账户，当前更重仓 ${wallet.bestPosition?.titleZh || '重点市场'} 的 ${wallet.bestPosition?.outcome || '--'} 方向。`,
    sourceLabel: wallet.seed ? `榜单种子 #${wallet.seedRank || '--'}` : '焦点市场补充',
    leaderboardWinRate: wallet.leaderboardWinRate,
    leaderboardGain: wallet.leaderboardGain,
  }));

  const smartParticipationMap = new Map();
  for (const wallet of detailedWallets) {
    for (const market of wallet.markets || []) {
      const current = smartParticipationMap.get(market.conditionId) || { wallets: [], buyCount: 0, sellCount: 0, totalPnl: 0 };
      if (!current.wallets.some((w) => w.wallet === wallet.wallet)) {
        current.wallets.push({
          wallet: wallet.wallet,
          walletShort: maskWallet(wallet.wallet),
          displayName: wallet.displayName,
          smartScore: wallet.smartScore,
          totalPnl: wallet.totalPnl,
        });
      }
      current.totalPnl += Number(wallet.totalPnl || 0);
      smartParticipationMap.set(market.conditionId, current);
    }
    for (const trade of wallet.recentTrades || []) {
      const current = smartParticipationMap.get(trade.conditionId) || { wallets: [], buyCount: 0, sellCount: 0, totalPnl: 0 };
      if (trade.side === 'BUY') current.buyCount += 1;
      if (trade.side === 'SELL') current.sellCount += 1;
      if (!current.wallets.some((w) => w.wallet === wallet.wallet)) {
        current.wallets.push({
          wallet: wallet.wallet,
          walletShort: maskWallet(wallet.wallet),
          displayName: wallet.displayName,
          smartScore: wallet.smartScore,
          totalPnl: wallet.totalPnl,
        });
      }
      smartParticipationMap.set(trade.conditionId, current);
    }
  }

  const smartMoneyActions = detailedWallets
    .flatMap((wallet) => wallet.recentTrades || [])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SMART_ACTIONS)
    .map((trade) => ({
      ...trade,
      walletShort: maskWallet(trade.wallet),
      actionLabel: `${trade.displayName || maskWallet(trade.wallet)} ${trade.side === 'BUY' ? '买入' : '卖出'} ${trade.outcome}`,
      summaryZh: `${trade.displayName || maskWallet(trade.wallet)} 在 ${trade.titleZh} 上 ${trade.side === 'BUY' ? '继续加' : '开始减'} ${trade.outcome}，成交价 ${pctText(trade.price * 100)}，名义金额约 ${moneyText(trade.usdcSize)}。`,
    }));

  const topicMap = new Map();
  for (const trade of smartMoneyActions) {
    const topic = trade.topic || '其他';
    const current = topicMap.get(topic) || {
      topic,
      buyCount: 0,
      sellCount: 0,
      totalNotional: 0,
      wallets: new Map(),
      topTrades: [],
    };
    if (trade.side === 'BUY') current.buyCount += 1;
    if (trade.side === 'SELL') current.sellCount += 1;
    current.totalNotional += Number(trade.usdcSize || 0);
    if (!current.wallets.has(trade.wallet)) {
      current.wallets.set(trade.wallet, {
        wallet: trade.wallet,
        displayName: trade.displayName,
        walletShort: trade.walletShort,
        smartScore: trade.smartScore,
      });
    }
    current.topTrades.push(trade);
    topicMap.set(topic, current);
  }

  const smartMoneyThemes = [...topicMap.values()]
    .map((item) => {
      const tilt = item.buyCount > item.sellCount ? '偏买入' : item.sellCount > item.buyCount ? '偏卖出' : '多空分歧';
      const leaders = [...item.wallets.values()].sort((a, b) => b.smartScore - a.smartScore).slice(0, 3);
      const strongest = item.topTrades.sort((a, b) => b.usdcSize - a.usdcSize)[0] || null;
      const themeScore = Math.round((Math.min(item.totalNotional / 5000, 30) + item.wallets.size * 8 + (item.buyCount + item.sellCount) * 2) * 10) / 10;
      return {
        topic: item.topic,
        tilt,
        walletCount: item.wallets.size,
        tradeCount: item.buyCount + item.sellCount,
        buyCount: item.buyCount,
        sellCount: item.sellCount,
        totalNotional: item.totalNotional,
        themeScore,
        leaders,
        strongestTitleZh: strongest?.titleZh || '--',
        strongestSummaryZh: strongest ? `${strongest.displayName || strongest.walletShort} 在 ${strongest.titleZh} 上 ${strongest.side === 'BUY' ? '偏主动买入' : '偏主动卖出'}，名义金额约 ${moneyText(strongest.usdcSize)}。` : '暂无代表性动作。',
      };
    })
    .sort((a, b) => b.themeScore - a.themeScore || b.totalNotional - a.totalNotional || b.walletCount - a.walletCount);

  const smartParticipation = [...smartParticipationMap.entries()].map(([conditionId, data]) => ({
    conditionId,
    walletCount: data.wallets.length,
    buyCount: data.buyCount,
    sellCount: data.sellCount,
    totalPnl: data.totalPnl,
    topWallets: data.wallets
      .sort((a, b) => b.smartScore - a.smartScore)
      .slice(0, 3),
  }));

  return { smartMoneyOverview, smartMoneyActions, smartMoneyThemes, smartParticipation };
}

async function buildRadarSnapshot(previousSnapshot = null) {
  const discovered = await fetchMarkets();
  const qualifiedUniverse = selectUniverse(Array.isArray(discovered) ? discovered : []);
  const bookCandidates = qualifiedUniverse.slice(0, MAX_BOOK_CANDIDATES);
  const books = await fetchBooksForTokens(bookCandidates.map((entry) => entry.yesTokenId));
  const booksByToken = new Map(books.map((book) => [String(book.asset_id), book]));
  const snapshot = buildSnapshot(qualifiedUniverse, booksByToken, previousSnapshot);
  const smartMoneyLayer = await buildSmartMoneyLayer(snapshot).catch(() => ({ smartMoneyOverview: [], smartMoneyActions: [], smartMoneyThemes: [], smartParticipation: [] }));
  const participationMap = new Map((smartMoneyLayer.smartParticipation || []).map((x) => [x.conditionId, x]));
  const enrichWithParticipation = (items = []) => items.map((item) => {
    const participation = participationMap.get(item.conditionId);
    const base = participation ? (() => {
      const tilt = participation.buyCount > participation.sellCount ? '偏买入' : participation.sellCount > participation.buyCount ? '偏卖出' : '多空都有';
      const leaders = (participation.topWallets || []).map((x) => x.displayName || x.walletShort).join('、');
      return {
        ...item,
        smartParticipation: participation,
        smartMoneyFlag: `${participation.walletCount} 个重点钱包参与`,
        smartMoneyNote: `最近抓到 ${participation.walletCount} 个重点钱包参与，动作倾向 ${tilt}，代表账户包括 ${leaders || '若干账户'}。`,
      };
    })() : {
      ...item,
      smartParticipation: null,
      smartMoneyFlag: '暂无聪明钱联动',
      smartMoneyNote: '当前没有抓到重点钱包在这个市场的明显动作。',
    };
    const resonance = buildResonance(base);
    return {
      ...base,
      ...resonance,
      intelLine: intelLine({ ...base, ...resonance }),
    };
  });
  const enrichedAnomalies = enrichWithParticipation(snapshot.anomalySignals || []);
  const enrichedTopSignals = enrichWithParticipation(snapshot.topSignals || []);
  const enrichedMarkets = enrichWithParticipation(snapshot.markets || []);
  const bestByTopic = new Map();
  for (const item of enrichedMarkets) {
    const current = bestByTopic.get(item.topic);
    const rank = (item.resonanceParts || []).length * 100 + Number(item.anomalyScore || 0) + Math.abs(Number(item.oneDayChangePct || 0));
    if (!current || rank > current.rank) {
      bestByTopic.set(item.topic, { rank, item });
    }
  }
  const topicLeaders = (smartMoneyLayer.smartMoneyThemes || []).map((theme) => {
    const candidates = enrichedMarkets
      .filter((item) => item.topic === theme.topic)
      .sort((a, b) => ((b.resonanceParts || []).length - (a.resonanceParts || []).length) || (Number(b.anomalyScore || 0) - Number(a.anomalyScore || 0)) || (Math.abs(Number(b.oneDayChangePct || 0)) - Math.abs(Number(a.oneDayChangePct || 0))))
      .slice(0, 3);
    return {
      ...theme,
      representativeMarkets: candidates.map((item) => ({
        titleZh: item.titleZh,
        resonanceLevel: item.resonanceLevel,
        intelLine: item.intelLine,
      })),
      leadMarket: candidates[0]?.titleZh || bestByTopic.get(theme.topic)?.item?.titleZh || '--',
    };
  });
  const resonanceSignals = [...enrichedAnomalies]
    .filter((item) => (item.resonanceParts || []).length >= 2)
    .sort((a, b) => marketPriority(b) - marketPriority(a))
    .slice(0, 8);
  const mustWatch = [...enrichedMarkets]
    .sort((a, b) => marketPriority(b) - marketPriority(a))
    .slice(0, 3);
  const headlineSummary = buildHeadlineSummary(topicLeaders, mustWatch);
  return {
    ...snapshot,
    ...smartMoneyLayer,
    smartMoneyThemes: topicLeaders,
    anomalySignals: enrichedAnomalies,
    topSignals: enrichedTopSignals,
    markets: enrichedMarkets,
    resonanceSignals,
    mustWatch,
    headlineSummary,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveCacheKey = new Request(`${url.origin}/__edge/pulse/polymarket-radar/live`);
  const staleCacheKey = new Request(`${url.origin}/__edge/pulse/polymarket-radar/stale`);
  const baselineCacheKey = new Request(`${url.origin}/__edge/pulse/polymarket-radar/baseline-5m`);

  try {
    const cached = await cache.match(liveCacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    const baselineCached = await cache.match(baselineCacheKey);
    const previousSnapshot = baselineCached ? await baselineCached.clone().json().catch(() => null) : null;
    const snapshot = await buildRadarSnapshot(previousSnapshot);
    const body = JSON.stringify(snapshot);
    const liveResponse = new Response(body, {
      headers: responseHeaders(`public, max-age=0, s-maxage=${SNAPSHOT_TTL_SECONDS}`, 'MISS'),
    });
    const staleResponse = new Response(body, {
      headers: responseHeaders(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
    });
    const baselineResponse = new Response(body, {
      headers: responseHeaders(`public, max-age=0, s-maxage=${ANOMALY_BASELINE_SECONDS}`, baselineCached ? 'BASELINE-KEEP' : 'BASELINE-SET'),
    });

    const cacheWrites = [
      cache.put(liveCacheKey, liveResponse.clone()),
      cache.put(staleCacheKey, staleResponse.clone()),
    ];
    if (!baselineCached) cacheWrites.push(cache.put(baselineCacheKey, baselineResponse.clone()));

    context.waitUntil(Promise.all(cacheWrites));

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
