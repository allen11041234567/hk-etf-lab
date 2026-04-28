const LIVE_TTL_SECONDS = 900;
const STALE_TTL_SECONDS = 14400;
const CACHE_VERSION = 'v3';

const FEEDS = [
  {
    name: 'Yonhap',
    category: '韩国快讯',
    url: 'https://news.google.com/rss/search?q=site:en.yna.co.kr+(Korea+OR+KOSPI+OR+Samsung+OR+SK+Hynix+OR+won+OR+exports)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Korea Herald',
    category: '市场与公司',
    url: 'https://news.google.com/rss/search?q=site:koreaherald.com+(Korea+market+OR+KOSPI+OR+Samsung+OR+SK+Hynix+OR+won)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Korea Times',
    category: '韩国市场',
    url: 'https://news.google.com/rss/search?q=site:koreatimes.co.kr+(Korea+market+OR+Samsung+OR+SK+Hynix)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Koreabizwire',
    category: '韩国产业',
    url: 'https://news.google.com/rss/search?q=site:koreabizwire.com+(Korea+chip+OR+Samsung+OR+SK+Hynix+OR+ETF)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Aju Press',
    category: '韩国产业',
    url: 'https://news.google.com/rss/search?q=site:ajupress.com+(Samsung+OR+SK+Hynix+OR+Korea+market)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Reuters',
    category: '海外财经',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+(South+Korea+OR+KOSPI+OR+Samsung+OR+SK+Hynix+OR+won)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'CNBC',
    category: '海外财经',
    url: 'https://news.google.com/rss/search?q=site:cnbc.com+(South+Korea+OR+Samsung+OR+SK+Hynix+OR+KOSPI)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩国半导体',
    url: 'https://news.google.com/rss/search?q=(SK+Hynix+OR+Samsung+Electronics+OR+Korea+semiconductor+OR+memory+chip)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News',
    category: '韩股与韩元',
    url: 'https://news.google.com/rss/search?q=(KOSPI+OR+KOSDAQ+OR+South+Korea+won+OR+Bank+of+Korea+OR+Korean+exports)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
];

const SOURCE_ALLOWLIST = [
  { match: /yonhap|yna/i, label: 'Yonhap', rank: 100 },
  { match: /korea herald/i, label: 'Korea Herald', rank: 95 },
  { match: /korea times/i, label: 'Korea Times', rank: 90 },
  { match: /koreabizwire/i, label: 'Koreabizwire', rank: 88 },
  { match: /aju press|aju business daily/i, label: 'Aju Press', rank: 86 },
  { match: /reuters/i, label: 'Reuters', rank: 84 },
  { match: /cnbc/i, label: 'CNBC', rank: 82 },
  { match: /investing\.com/i, label: 'Investing', rank: 78 },
  { match: /marketwatch/i, label: 'MarketWatch', rank: 76 },
  { match: /bloomberg/i, label: 'Bloomberg', rank: 76 },
  { match: /businesskorea/i, label: 'BusinessKorea', rank: 74 },
  { match: /pulse|maeil/i, label: 'Maeil Pulse', rank: 72 },
];

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function stripCdata(text = '') {
  return String(text).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeXml(text = '') {
  return stripCdata(String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"));
}

function stripTags(text = '') {
  return decodeXml(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

function normalizeTitle(raw = '') {
  let s = stripTags(raw)
    .replace(/\s*-\s*[^-]+$/g, '')
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/^\((EDITORIAL|UPDATE)\)\s*/i, '')
    .replace(/^\[Editorial\]\s*/i, '')
    .trim();
  return s;
}

function extractItems(xml, category, feedName) {
  const out = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of matches.slice(0, 16)) {
    const title = normalizeTitle(firstTag(block, 'title'));
    const link = stripTags(firstTag(block, 'link'));
    const pubDate = stripTags(firstTag(block, 'pubDate'));
    const description = stripTags(firstTag(block, 'description'));
    const source = stripTags(firstTag(block, 'source')) || feedName || 'News';
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      time: pubDate,
      source,
      category,
      summary: description || title,
    });
  }
  return out;
}

function normalizeText(s = '') {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function sourceMeta(item) {
  const text = `${item.source} ${item.title}`;
  for (const rule of SOURCE_ALLOWLIST) {
    if (rule.match.test(text)) return rule;
  }
  return null;
}

function isAllowedSource(item) {
  return !!sourceMeta(item);
}

function pickSource(item) {
  return sourceMeta(item)?.label || item.source || 'News';
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
  let score = sourceMeta(item)?.rank || 0;
  if (/sk hynix|hynix/.test(text)) score += 8;
  if (/samsung/.test(text)) score += 8;
  if (/kospi|kosdaq/.test(text)) score += 6;
  if (/won|bank of korea|exports?/.test(text)) score += 5;
  if (/chip|semiconductor|memory|hbm/.test(text)) score += 6;
  if (/market cap|record high|new high|surge|jump|rally/.test(text)) score += 4;
  if (/editorial/.test(text)) score -= 20;
  return score;
}

function parseTimestamp(input) {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function toBeijingTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

function replaceAll(text, pairs) {
  let s = text;
  for (const [pattern, replacement] of pairs) s = s.replace(pattern, replacement);
  return s;
}

function zhTitle(title = '') {
  let s = String(title).trim();
  s = s.replace(/\s+/g, ' ');

  const phrasePairs = [
    [/market cap of s\. korean-listed companies surpasses ([^ ]+) for 1st time:? data/gi, '韩国上市公司总市值首次突破 $1'],
    [/korea'?s market cap tops ([^ ]+) for first time/gi, '韩国市场总市值首次突破 $1'],
    [/seoul stocks close at a new record high amid ai-led tech rally/gi, '首尔股市在 AI 科技股带动下收于历史新高'],
    [/seoul stocks open sharply higher despite faltering hopes for us-iran peace talks/gi, '尽管美伊和谈前景转弱，首尔股市仍大幅高开'],
    [/kospi rally pushes korea market cap above ([^ ]+)/gi, '韩股走强，韩国市场总市值升破 $1'],
    [/chip rally lifts sk hynix to record, tops samsung/gi, '芯片股走强，SK海力士创纪录并跑赢三星'],
    [/sk hynix shares jump ([^ ]+) to record high, beats samsung/gi, 'SK海力士股价大涨 $1 至历史新高，并跑赢三星'],
    [/sk hynix wins ieee corporate innovation award for hbm leadership/gi, 'SK海力士凭借 HBM 领先优势获 IEEE 企业创新奖'],
    [/ai boom moves down the supply chain, lifting samsung electro-mechanics/gi, 'AI 热潮向供应链传导，带动三星电机走强'],
    [/samsung faces setback in ai memory race amid labor tensions/gi, '劳资紧张拖累三星 AI 存储竞争节奏'],
    [/samsung workers rally in south korea, demanding higher pay and threatening to strike/gi, '三星韩国工人集会要求加薪，并警告可能罢工'],
    [/samsung, sk hynix morph into ai foundries as big tech reshapes chipmaking/gi, '在科技巨头重塑芯片制造格局下，三星与SK海力士加速转向 AI 晶圆与存储链'],
    [/leverage fever builds as korea prepares chip etfs tied to samsung and sk hynix/gi, '韩国筹备挂钩三星与SK海力士的芯片 ETF，杠杆交易热度升温'],
    [/kospi 200 closing price list-1/gi, '韩国综合指数200收盘价列表'],
    [/bank of korea/gi, '韩国央行'],
    [/south korea/gi, '韩国'],
    [/korean/gi, '韩国'],
    [/samsung electronics/gi, '三星电子'],
    [/samsung electro-mechanics/gi, '三星电机'],
    [/samsung/gi, '三星'],
    [/sk hynix/gi, 'SK海力士'],
    [/hynix/gi, '海力士'],
    [/kospi/gi, '韩国综合指数'],
    [/kosdaq/gi, '韩国创业板指数'],
    [/market cap/gi, '市值'],
    [/record high/gi, '历史新高'],
    [/stocks/gi, '股市'],
    [/stock/gi, '股票'],
    [/shares/gi, '股价'],
    [/surges?/gi, '飙升'],
    [/jumps?/gi, '大涨'],
    [/rall(y|ies)/gi, '走强'],
    [/falls?/gi, '回落'],
    [/higher/gi, '走高'],
    [/lower/gi, '走低'],
    [/chip/gi, '芯片'],
    [/semiconductor/gi, '半导体'],
    [/memory/gi, '存储'],
    [/won/gi, '韩元'],
    [/exports?/gi, '出口'],
  ];
  s = replaceAll(s, phrasePairs);
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\((?:EDITORIAL|UPDATE)\)\s*/i, '');
  s = s.replace(/^\[Editorial\]\s*/i, '');
  return s;
}

async function fetchFeed(feed) {
  const resp = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`feed ${resp.status} for ${feed.name}`);
  const xml = await resp.text();
  return extractItems(xml, feed.category, feed.name);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    for (const result of results) {
      if (result.status === 'fulfilled') items.push(...result.value);
    }

    const seen = new Set();
    const deduped = items
      .filter(isAllowedSource)
      .filter((item) => !/editorial|closing price list/i.test(item.title))
      .filter((item) => {
        const key = normalizeText(item.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        ...item,
        ts: parseTimestamp(item.time),
      }))
      .sort((a, b) => (b.ts - a.ts) || (scoreItem(b) - scoreItem(a)))
      .slice(0, 28)
      .map((item) => ({
        ...item,
        source: pickSource(item),
        time: toBeijingTime(item.time),
        zhTitle: zhTitle(item.title),
        originalTitle: item.title,
      }));

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      itemCount: deduped.length,
      items: deduped,
    });

    const liveRes = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS'),
    });
    const staleRes = new Response(body, {
      headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM'),
    });

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
