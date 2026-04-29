const LIVE_TTL_SECONDS = 300;
const STALE_TTL_SECONDS = 1800;
const CACHE_VERSION = 'v6-direct';
const USER_AGENT = 'Mozilla/5.0 (compatible; HK-ETF-Lab/2.2; +https://hketf-lab.pages.dev/)';
const SNAPSHOT_URL = 'https://hketf-lab.pages.dev/assets/data/korea-market-digest.json';

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function cleanText(s = '') {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function categoryFor(text) {
  const t = text.toLowerCase();
  if (/(sk hynix|samsung|semiconductor|chip|hbm|memory|foundry)/i.test(t)) return '半导体';
  if (/(kospi|seoul stocks|market cap|record high|benchmark)/i.test(t)) return '韩股';
  if (/(won|bank of korea|exports?|tariff|inflation|trade)/i.test(t)) return '宏观';
  if (/(battery|\bev\b|hyundai|kia|lg energy)/i.test(t)) return '电池汽车';
  return '公司';
}

function translate(title) {
  const specials = [
    [/^SK Inc\. boosts stake in SK Ecoplant to back chip, AI push$/i, 'SK集团增持SK Ecoplant，继续押注芯片与AI产业链'],
    [/^Kospi hits record high, races toward 7,000$/i, '韩国综合指数创历史新高，逼近7000点'],
    [/^Kospi extends rally with fresh high$/i, '韩国综合指数延续涨势，再创新高'],
    [/^Seoul stocks again at fresh peak ahead of U\.?S\.? big tech earnings$/i, '美股科技巨头财报前，首尔股市再创新高'],
    [/^Seoul stocks briefly top 6,700, set for another milestone$/i, '首尔股市一度站上6700点，继续冲击新高'],
    [/^Korea overtakes UK to rank No\. 8 in stock market cap$/i, '韩国股市总市值超过英国，升至全球第八'],
    [/^Hyundai rolls out EV battery subscription test$/i, '现代汽车启动电动车电池订阅试点'],
    [/^Hyundai E&C Q1 net rises .* on weak won, asset revaluation$/i, '现代建设一季度净利润改善，受韩元走弱与资产重估带动'],
    [/^Kumho Tire Q1 net income up .*$/i, '锦湖轮胎一季度净利润同比增长'],
    [/^Doosan Robotics remains in red in Q1$/i, '斗山机器人一季度仍录得亏损'],
  ];
  for (const [re, zh] of specials) if (re.test(title)) return zh;
  let out = title;
  const pairs = [
    ['SK hynix', 'SK海力士'], ['Samsung SDI', '三星SDI'], ['Samsung', '三星'],
    ['South Korea', '韩国'], ['Korea', '韩国'], ['Kospi', '韩国综合指数'], ['Seoul stocks', '首尔股市'],
    ['won', '韩元'], ['exports', '出口'], ['chip', '芯片'], ['chips', '芯片'], ['semiconductor', '半导体'], ['battery', '电池']
  ];
  for (const [a, b] of pairs) out = out.replace(new RegExp(a, 'ig'), b);
  return out;
}

function summary(title, category) {
  if (category === '半导体') return ['这条资讯落在韩国最核心的半导体主线，通常会直接影响三星、SK海力士以及相关ETF的风险偏好。', '重点看需求、价格与资本开支预期是否继续上修。'];
  if (category === '韩股') return ['这条资讯主要反映韩股指数与市场风险偏好，适合用来判断韩国科技权重是否仍在带动全市场。', '如果是创新高或放量上行，更偏风险偏好强化。'];
  if (category === '宏观') return ['这条资讯更偏宏观与汇率层，会先影响韩元和外资预期，再传导到韩国股票与主题ETF定价。', '读法上先看政策或数据方向，再看它会不会改变外资回流和出口周期。'];
  if (category === '电池汽车') return ['这条资讯偏电池与汽车链，影响的是韩国制造业龙头的盈利预期，以及市场对产业景气的判断。', '要重点看订单、利润率和下游需求是否改善。'];
  return ['这是一条公司基本面更新，核心价值在于它是否改变了市场对盈利、资本开支或战略方向的预期。', '如果利润、订单或资本动作超预期，后续通常会向同行和相关主题扩散。'];
}

function badItem(text) {
  return /(network fees|procurement|Trump Jr|concert|Woori falls behind|personal choice|Airbnb|CNBC Daily Open|India turns|Intel-Tesla tie|Government buying power|Photo News)/i.test(text);
}

function itemObj({ id, title, originalTitle, url, source, category, time, ts }) {
  const [summaryZh, whyZh] = summary(originalTitle, category);
  return { id, title, originalTitle, zhTitle: title, summaryZh, whyZh, url, source, category, time, ts, fetchedAt: new Date().toISOString() };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return await res.text();
}

async function fetchYonhap() {
  const text = await fetchText('https://en.yna.co.kr/k-biz/news');
  const re = /<article>[\s\S]*?<a href="(https:\/\/en\.yna\.co\.kr\/view\/[^"]+)"[\s\S]*?<strong class="tit">\s*<a href="[^"]+">([\s\S]*?)<\/a>[\s\S]*?<span class="txt">([\s\S]*?)<\/span>[\s\S]*?<span class="date">([\s\S]*?)<\/span>/g;
  const items = [];
  let m;
  const now = new Date();
  while ((m = re.exec(text))) {
    const url = m[1];
    const originalTitle = cleanText(m[2]);
    const desc = cleanText(m[3]);
    const timeText = cleanText(m[4]);
    if (badItem(`${originalTitle} ${desc}`)) continue;
    const category = categoryFor(`${originalTitle} ${desc}`);
    const title = translate(originalTitle);
    const zhCount = (title.match(/[\u4e00-\u9fff]/g) || []).length;
    if (zhCount < 4) continue;
    const ts = Date.parse(now.toISOString()) / 1000;
    items.push(itemObj({ id: originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), title, originalTitle, url, source: 'Yonhap', category, time: timeText || '--:--', ts }));
    if (items.length >= 12) break;
  }
  return items;
}

async function fetchKoreaHerald() {
  const text = await fetchText('https://www.koreaherald.com/Business');
  const re = /<a href="(https:\/\/www\.koreaherald\.com\/article\/\d+)"[^>]*>[\s\S]*?<p class="news_title">([\s\S]*?)<\/p>[\s\S]*?<p class="news_text[^>]*">([\s\S]*?)<\/p>/g;
  const items = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const originalTitle = cleanText(m[2]);
    const desc = cleanText(m[3]);
    if (badItem(`${originalTitle} ${desc}`)) continue;
    const category = categoryFor(`${originalTitle} ${desc}`);
    const title = translate(originalTitle);
    const zhCount = (title.match(/[\u4e00-\u9fff]/g) || []).length;
    if (zhCount < 4) continue;
    const ts = Date.now() / 1000;
    items.push(itemObj({ id: originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), title, originalTitle, url, source: 'Korea Herald', category, time: new Date().toISOString().slice(5, 16).replace('T', ' '), ts }));
    if (items.length >= 12) break;
  }
  return items;
}

async function buildDirectPayload() {
  const parts = await Promise.allSettled([fetchKoreaHerald(), fetchYonhap()]);
  const all = [];
  for (const part of parts) {
    if (part.status === 'fulfilled') all.push(...part.value);
  }
  const seen = new Set();
  const items = [];
  for (const x of all.sort((a, b) => b.ts - a.ts)) {
    if (seen.has(x.zhTitle)) continue;
    seen.add(x.zhTitle);
    items.push(x);
    if (items.length >= 20) break;
  }
  return { ok: true, fetchedAt: new Date().toISOString(), itemCount: items.length, poolSize: items.length, items, sources: ['Yonhap', 'Korea Herald'] };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/korea-market-digest/${CACHE_VERSION}/stale`);

  const cached = await cache.match(liveKey);
  if (cached) {
    const h = new Headers(cached.headers);
    h.set('x-edge-cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers: h });
  }

  const refreshPromise = (async () => {
    try {
      const fresh = await buildDirectPayload();
      if ((fresh.itemCount || 0) >= 6) {
        const body = JSON.stringify(fresh);
        const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS') });
        const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM') });
        await Promise.all([cache.put(liveKey, liveRes.clone()), cache.put(staleKey, staleRes.clone())]);
        return liveRes;
      }
    } catch {}
    try {
      const upstream = await fetch(SNAPSHOT_URL, { headers: { 'user-agent': USER_AGENT } });
      if (upstream.ok) {
        const body = await upstream.text();
        const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${LIVE_TTL_SECONDS}`, 'MISS-FALLBACK') });
        const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_TTL_SECONDS}`, 'WARM-FALLBACK') });
        await Promise.all([cache.put(liveKey, liveRes.clone()), cache.put(staleKey, staleRes.clone())]);
        return liveRes;
      }
    } catch {}
    return null;
  })();

  const stale = await cache.match(staleKey);
  if (stale) {
    context.waitUntil(refreshPromise);
    const h = new Headers(stale.headers);
    h.set('x-edge-cache', 'STALE');
    return new Response(stale.body, { status: 200, headers: h });
  }

  const freshRes = await refreshPromise;
  if (freshRes) return freshRes;
  return new Response(JSON.stringify({ ok: false, error: 'refresh failed' }), { status: 500, headers: headers('no-store', 'ERROR') });
}
