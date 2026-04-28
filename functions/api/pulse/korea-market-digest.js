const LIVE_TTL_SECONDS = 300;
const STALE_TTL_SECONDS = 1800;
const CACHE_VERSION = 'v4';

const FEEDS = [
  { name: 'Yonhap', category: '韩股', url: 'https://news.google.com/rss/search?q=site:en.yna.co.kr+(KOSPI+OR+KOSDAQ+OR+Seoul+stocks+OR+South+Korea+market+OR+market+cap)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Yonhap', category: '半导体', url: 'https://news.google.com/rss/search?q=site:en.yna.co.kr+(Samsung+OR+SK+Hynix+OR+semiconductor+OR+HBM+OR+memory+chip)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Yonhap', category: '宏观', url: 'https://news.google.com/rss/search?q=site:en.yna.co.kr+(Bank+of+Korea+OR+won+OR+exports+OR+inflation+OR+trade)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Korea Herald', category: '韩股', url: 'https://news.google.com/rss/search?q=site:koreaherald.com+(KOSPI+OR+KOSDAQ+OR+Seoul+stocks+OR+Korea+market)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Korea Herald', category: '公司', url: 'https://news.google.com/rss/search?q=site:koreaherald.com+(Samsung+OR+SK+Hynix+OR+LG+OR+Hyundai+OR+battery+OR+chip)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Korea Times', category: '公司', url: 'https://news.google.com/rss/search?q=site:koreatimes.co.kr+(Samsung+OR+SK+Hynix+OR+LG+OR+Hyundai+OR+AI+OR+chip)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Koreabizwire', category: '产业', url: 'https://news.google.com/rss/search?q=site:koreabizwire.com+(Korea+chip+OR+Samsung+OR+SK+Hynix+OR+battery+OR+Hyundai+OR+ETF)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Aju Press', category: '产业', url: 'https://news.google.com/rss/search?q=site:ajupress.com+(Samsung+OR+SK+Hynix+OR+Korea+market+OR+battery+OR+Hyundai)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Reuters', category: '海外财经', url: 'https://news.google.com/rss/search?q=site:reuters.com+(South+Korea+OR+KOSPI+OR+Samsung+OR+SK+Hynix+OR+won+OR+exports)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'CNBC', category: '海外财经', url: 'https://news.google.com/rss/search?q=site:cnbc.com+(South+Korea+OR+Samsung+OR+SK+Hynix+OR+KOSPI+OR+won)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News', category: '半导体', url: 'https://news.google.com/rss/search?q=(SK+Hynix+OR+Samsung+Electronics+OR+Korea+semiconductor+OR+memory+chip+OR+HBM)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News', category: '宏观', url: 'https://news.google.com/rss/search?q=(South+Korea+won+OR+Bank+of+Korea+OR+Korean+exports+OR+KOSPI+OR+KOSDAQ)+when:2d&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News', category: '公司', url: 'https://news.google.com/rss/search?q=(Samsung+OR+SK+Hynix+OR+LG+Energy+Solution+OR+Hyundai+Motor+OR+Korea+battery)+when:2d&hl=en-US&gl=US&ceid=US:en' },
];

const SOURCE_ALLOWLIST = [
  { match: /yonhap|yna/i, label: 'Yonhap', rank: 100 },
  { match: /korea herald/i, label: 'Korea Herald', rank: 96 },
  { match: /korea times/i, label: 'Korea Times', rank: 92 },
  { match: /koreabizwire/i, label: 'Koreabizwire', rank: 88 },
  { match: /aju press|aju business daily/i, label: 'Aju Press', rank: 86 },
  { match: /reuters/i, label: 'Reuters', rank: 84 },
  { match: /cnbc/i, label: 'CNBC', rank: 82 },
  { match: /businesskorea/i, label: 'BusinessKorea', rank: 80 },
];

const POSITIVE_PATTERNS = [
  /\bsouth korea\b/i, /\bkorea\b/i, /\bkorean\b/i, /\bseoul\b/i,
  /\bkospi\b/i, /\bkosdaq\b/i, /samsung/i, /sk hynix/i, /bank of korea/i,
  /won/i, /exports?/i, /hyundai/i, /\blg\b/i, /battery/i, /semiconductor/i, /chip/i,
  /memory/i, /hbm/i, /market cap/i, /seoul stocks/i, /korea market/i
];

const NEGATIVE_PATTERNS = [
  /tsunami/i, /firefighter/i, /azerbaijan/i, /ukraine/i, /gaza(?!.*korea)/i,
  /catl(?!.*korea)/i, /weride/i, /lenovo/i, /van[e]?ck/i, /\bsmh\b/i,
  /editorial/i, /closing price list/i, /horoscope/i, /celebrity/i, /k-pop/i, /movie/i,
  /football/i, /baseball/i, /fashion/i, /travel/i, /restaurant/i, /gen z/i,
  /reliever/i, /minors/i, /newspapers/i, /envoy/i, /n\. korea/i, /north korea/i,
  /food and groceries/i, /cultural content/i, /dialogue/i, /coupang issue/i
];

const CATEGORY_KEYWORDS = {
  '韩股': [/kospi/i, /kosdaq/i, /seoul stocks/i, /market cap/i, /korea market/i],
  '半导体': [/samsung/i, /sk hynix/i, /hbm/i, /memory/i, /semiconductor/i, /chip/i],
  '宏观': [/bank of korea/i, /won/i, /exports?/i, /inflation/i, /trade/i, /rate/i],
  '公司': [/\blg\b/i, /hyundai/i, /samsung/i, /sk hynix/i, /battery/i, /ai campus/i],
  '海外财经': [/reuters/i, /cnbc/i],
  '产业': [/battery/i, /auto/i, /shipbuilding/i, /chip/i, /ai/i],
};

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function stripCdata(text = '') { return String(text).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''); }
function decodeXml(text = '') { return stripCdata(String(text).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")); }
function stripTags(text = '') { return decodeXml(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function firstTag(block, tag) { const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return m ? decodeXml(m[1].trim()) : ''; }
function normalizeText(s = '') { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function parseTimestamp(input) { const d = new Date(input); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); }

function normalizeTitle(raw = '') {
  return stripTags(raw)
    .replace(/\s*-\s*[^-]+$/g, '')
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/^\((EDITORIAL|UPDATE|LEAD)\)\s*/i, '')
    .replace(/^\[Editorial\]\s*/i, '')
    .trim();
}

function sourceMeta(item) {
  const text = `${item.source} ${item.title}`;
  for (const rule of SOURCE_ALLOWLIST) if (rule.match.test(text)) return rule;
  return null;
}
function isAllowedSource(item) { return !!sourceMeta(item); }
function pickSource(item) { return sourceMeta(item)?.label || item.source || 'News'; }
function isRelevant(item) {
  const text = `${item.title} ${item.summary} ${item.source}`;
  if (NEGATIVE_PATTERNS.some((p) => p.test(text))) return false;
  return POSITIVE_PATTERNS.some((p) => p.test(text));
}
function detectCategory(item) {
  const text = `${item.title} ${item.summary} ${item.source}`;
  for (const [cat, patterns] of Object.entries(CATEGORY_KEYWORDS)) if (patterns.some((p) => p.test(text))) return cat;
  return item.category || '韩国市场';
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
  return score;
}
function toBeijingTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
}

function zhTitle(title = '') {
  let s = String(title).trim().replace(/\s+/g, ' ');
  const phrasePairs = [
    [/market cap of s\. korean-listed companies surpasses ([^ ]+) for 1st time:? data/gi, '韩国上市公司总市值首次突破 $1'],
    [/korea'?s market cap tops ([^ ]+) for first time/gi, '韩国市场总市值首次突破 $1'],
    [/seoul stocks close at a new record high amid ai-led tech rally/gi, '首尔股市在 AI 科技股带动下收于历史新高'],
    [/seoul stocks open at record high ahead of u\.?s\.? big tech earnings/gi, '首尔股市在美股科技巨头财报前高开至历史高位'],
    [/seoul stocks open sharply higher despite faltering hopes for us-iran peace talks/gi, '尽管美伊和谈前景转弱，首尔股市仍大幅高开'],
    [/seoul stocks up late tues\. morning driven by large-cap tech shares/gi, '首尔股市周二早盘在大型科技股带动下继续走高'],
    [/seoul stocks briefly top 6,700 on tech rally, ahead of m7 earnings/gi, '首尔股市一度站上 6700 点，市场押注科技巨头财报'],
    [/kospi rally pushes korea market cap above ([^ ]+)/gi, '韩股走强，韩国市场总市值升破 $1'],
    [/chip rally lifts sk hynix to record, tops samsung/gi, '芯片股走强，SK海力士创纪录并跑赢三星'],
    [/sk hynix shares jump ([^ ]+) to record high, beats samsung/gi, 'SK海力士股价大涨 $1 至历史新高，并跑赢三星'],
    [/sk hynix wins ieee corporate innovation award for hbm leadership/gi, 'SK海力士凭借 HBM 领先优势获 IEEE 企业创新奖'],
    [/ai boom moves down the supply chain, lifting samsung electro-mechanics/gi, 'AI 热潮向供应链传导，带动三星电机走强'],
    [/samsung faces setback in ai memory race amid labor tensions/gi, '劳资紧张拖累三星 AI 存储竞赛进程'],
    [/samsung workers rally in south korea, demanding higher pay and threatening to strike/gi, '三星韩国工人集会要求加薪，并警告可能罢工'],
    [/samsung, sk hynix morph into ai foundries as big tech reshapes chipmaking/gi, '在科技巨头重塑芯片制造格局下，三星与SK海力士加速转向 AI 制造与存储链'],
    [/leverage fever builds as korea prepares chip etfs tied to samsung and sk hynix/gi, '韩国筹备挂钩三星与SK海力士的芯片 ETF，杠杆交易热度升温'],
    [/google to build ai campus in korea, presidential office says/gi, '韩国总统府称 Google 将在韩国建设 AI 园区'],
    [/google to open ai campus in korea/gi, 'Google 将在韩国设立 AI 园区'],
    [/record profits leave investors split on samsung and sk hynix outlook/gi, '创纪录利润之后，投资者对三星与SK海力士后市分歧加大'],
    [/lg cns, samsung sds partner with openai to bring chatgpt edu to campuses/gi, 'LG CNS 与三星SDS联手 OpenAI，把 ChatGPT Edu 引入校园'],
    [/samsung sdi swings to q1 profit on ess battery growth/gi, '三星 SDI 一季度重回盈利，储能电池增长带动改善'],
    [/kospi rises/gi, '韩国综合指数走高'],
  ];
  for (const [pattern, replacement] of phrasePairs) s = s.replace(pattern, replacement);
  const wordPairs = [
    [/South Korea/gi, '韩国'], [/Korea/gi, '韩国'], [/Korean/gi, '韩国'], [/Seoul/gi, '首尔'],
    [/Samsung Electronics/gi, '三星电子'], [/Samsung Electro-Mechanics/gi, '三星电机'], [/Samsung SDS/gi, '三星SDS'], [/Samsung SDI/gi, '三星SDI'], [/Samsung/gi, '三星'],
    [/SK Hynix/gi, 'SK海力士'], [/Hynix/gi, '海力士'], [/KOSPI/gi, '韩国综合指数'], [/KOSDAQ/gi, '韩国创业板指数'],
    [/Bank of Korea/gi, '韩国央行'], [/market cap/gi, '市值'], [/record high/gi, '历史新高'], [/stocks/gi, '股市'], [/stock/gi, '股票'], [/shares/gi, '股价'],
    [/chip/gi, '芯片'], [/semiconductor/gi, '半导体'], [/memory/gi, '存储'], [/won/gi, '韩元'], [/exports?/gi, '出口'],
    [/campus/gi, '园区'], [/battery/gi, '电池'], [/profit[s]?/gi, '利润'], [/outlook/gi, '前景'], [/higher/gi, '走高'], [/lower/gi, '走低'], [/rally/gi, '走强']
  ];
  for (const [pattern, replacement] of wordPairs) s = s.replace(pattern, replacement);
  s = s.replace(/^The Korea Times$/i, '韩国时报').replace(/韩国n/g, '韩国');
  return s.replace(/\s+/g, ' ').trim().replace(/^\((?:EDITORIAL|UPDATE|LEAD)\)\s*/i, '').replace(/^\[Editorial\]\s*/i, '');
}

function buildSummary(item) {
  const title = item.zhTitle || item.title || '';
  const category = item.category || '';
  if (/三星SDI|电池/.test(title)) return { summaryZh: '摘要：消息显示韩国电池链盈利或需求出现边际改善。', whyZh: '看点：这类变化通常会提升韩国新能源与制造链条的关注度。' };
  if (/SK海力士|海力士|三星.*半导体|HBM|存储/.test(title)) return { summaryZh: '摘要：消息直接指向韩国半导体与AI硬件链。', whyZh: '看点：三星与SK海力士仍是韩国科技主线最关键的风向标。' };
  if (/首尔股市|韩国综合指数|韩国创业板指数|市值/.test(title) || category === '韩股') return { summaryZh: '摘要：这条主要反映韩股大盘强弱与市场风险偏好变化。', whyZh: '看点：指数强弱往往决定韩国科技和成长资产的交易热度。' };
  if (/韩国央行|韩元|出口|通胀|利率/.test(title) || category === '宏观') return { summaryZh: '摘要：这条偏宏观与汇率层面，会影响外资与韩国资产定价。', whyZh: '看点：宏观变量变化通常会先影响韩元，再传导至权益市场。' };
  if (/Google|OpenAI|LG|现代|Hyundai|公司/.test(title) || category === '公司') return { summaryZh: '摘要：这条主要影响韩国重点公司层面的预期变化。', whyZh: '看点：适合用来跟踪龙头公司战略、盈利和资本开支方向。' };
  return { summaryZh: `摘要：这条资讯与韩国${category || '市场'}相关，可作为当日市场线索补充。`, whyZh: '看点：适合放进韩国市场情报台里持续跟踪。' };
}

function extractItems(xml, category, feedName) {
  const out = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of matches.slice(0, 24)) {
    const title = normalizeTitle(firstTag(block, 'title'));
    const link = stripTags(firstTag(block, 'link'));
    const pubDate = stripTags(firstTag(block, 'pubDate'));
    const description = stripTags(firstTag(block, 'description'));
    const source = stripTags(firstTag(block, 'source')) || feedName || 'News';
    if (!title || !link) continue;
    out.push({ title, url: link, time: pubDate, source, category, summary: description || title });
  }
  return out;
}

async function fetchFeed(feed) {
  const resp = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)', 'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' } });
  if (!resp.ok) throw new Error(`feed ${resp.status} for ${feed.name}`);
  return extractItems(await resp.text(), feed.category, feed.name);
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
    for (const result of results) if (result.status === 'fulfilled') items.push(...result.value);

    const seen = new Set();
    const deduped = items
      .filter(isAllowedSource)
      .filter(isRelevant)
      .filter((item) => !/editorial|closing price list/i.test(item.title))
      .filter((item) => {
        const key = normalizeText(item.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({ ...item, ts: parseTimestamp(item.time) }))
      .sort((a, b) => (b.ts - a.ts) || (scoreItem(b) - scoreItem(a)))
      .slice(0, 30)
      .map((item) => {
        const normalized = { ...item, source: pickSource(item), category: detectCategory(item), time: toBeijingTime(item.time), zhTitle: zhTitle(item.title), originalTitle: item.title };
        const extra = buildSummary(normalized);
        return { ...normalized, ...extra };
      });

    const body = JSON.stringify({ ok: true, fetchedAt: new Date().toISOString(), itemCount: deduped.length, items: deduped });
    const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
    const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
    context.waitUntil(Promise.all([cache.put(liveKey, liveRes.clone()), cache.put(staleKey, staleRes.clone())]));
    return liveRes;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: h });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: headers('no-store', 'ERROR') });
  }
}
