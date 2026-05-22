const STOCK_FENGLE_MD_URL = 'https://markdown.new/https://stock.fengle.me';
const CACHE_SECONDS = 60;
const STALE_SECONDS = 300;
const MAX_POSTS = 20;

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function parseRelativeMinutes(text = '') {
  const raw = String(text || '').trim();
  let m = raw.match(/^(\d+)h\s*前$/i) || raw.match(/^(\d+)\s*小时前$/i);
  if (m) return Number(m[1]) * 60;
  m = raw.match(/^(\d+)m\s*前$/i) || raw.match(/^(\d+)\s*分钟前$/i);
  if (m) return Number(m[1]);
  m = raw.match(/^(\d+)\s*天前$/i);
  if (m) return Number(m[1]) * 1440;
  return null;
}

function isoFromRelative(text = '') {
  const mins = parseRelativeMinutes(text);
  if (mins === null) return null;
  return new Date(Date.now() - mins * 60000).toISOString();
}

function parseFengleTrumpSection(markdownText = '', origin = '') {
  const start = markdownText.indexOf('**Trump @ Truth Social**');
  const end = markdownText.indexOf('扫码入群，获取更多实时投资信息');
  if (start === -1 || end === -1 || end <= start) return [];
  const section = markdownText.slice(start, end);
  const parts = section.split('Donald J. Trump').slice(1);
  const posts = [];

  for (const part of parts) {
    const cleaned = part.replace(/\r/g, '');
    const lines = cleaned.split('\n').map((x) => x.trim()).filter(Boolean);
    const handleIdx = lines.indexOf('@realDonaldTrump');
    if (handleIdx === -1) continue;
    const bodyLines = lines.slice(handleIdx + 1);
    if (!bodyLines.length) continue;

    let timeIdx = -1;
    for (let i = bodyLines.length - 1; i >= 0; i--) {
      if (/(?:h|m)\s*前$/i.test(bodyLines[i]) || /(?:分钟|小時|小时|天)前$/.test(bodyLines[i])) {
        timeIdx = i;
        break;
      }
    }

    let engagementA = timeIdx > 1 ? bodyLines[timeIdx - 2] : null;
    let engagementB = timeIdx > 0 ? bodyLines[timeIdx - 1] : null;
    let relativeTime = timeIdx >= 0 ? bodyLines[timeIdx] : null;
    let contentLines = timeIdx > 1 ? bodyLines.slice(0, timeIdx - 2) : bodyLines.slice(0, 1);

    const content = contentLines.join('\n').trim();
    const urlMatch = content.match(/https:\/\/truthsocial\.com\/@realDonaldTrump\/\d+/i)
      || content.match(/https:\/\/truthsocial\.com\/users\/realDonaldTrump\/statuses\/\d+/i)
      || part.match(/https:\/\/truthsocial\.com\/@realDonaldTrump\/\d+/i)
      || part.match(/https:\/\/truthsocial\.com\/users\/realDonaldTrump\/statuses\/\d+/i);
    const url = urlMatch ? urlMatch[0] : null;

    if (!content && !url) continue;

    posts.push({
      status_url: url,
      url,
      avatar: `${origin}/assets/home/trump-home.jpg`,
      created_at: isoFromRelative(relativeTime),
      created_at_text: relativeTime || null,
      content: content === 'Preview' ? '' : content,
      content_html: content === 'Preview' ? '' : content,
      media: [],
      favourites_count: engagementA ? Number(String(engagementA).replace(/[^\d.]/g, '')) || null : null,
      reblogs_count: engagementB ? Number(String(engagementB).replace(/[^\d.]/g, '')) || null : null,
      replies_count: null,
      content_zh_cn: content === 'Preview' ? '' : content,
      content_zh_hk: content === 'Preview' ? '' : content,
      content_ko: content === 'Preview' ? '' : content,
      source_hint: 'stock.fengle.me',
    });
  }

  return posts;
}

function dedupePosts(posts) {
  const seen = new Set();
  const out = [];
  for (const post of posts || []) {
    const key = post.url || `${post.created_at_text || ''}__${post.content || ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

function hasRenderableBody(post) {
  const raw = String(post?.content || '').trim();
  return !!raw;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/live-v2`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/stale-v2`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const upstream = await fetch(STOCK_FENGLE_MD_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'text/markdown,text/plain,*/*',
      },
    });
    if (!upstream.ok) throw new Error(`fengle upstream ${upstream.status}`);
    const markdown = await upstream.text();
    const posts = dedupePosts(parseFengleTrumpSection(markdown, url.origin)).filter(hasRenderableBody).slice(0, MAX_POSTS);
    if (!posts.length) throw new Error('no trump posts parsed from fengle markdown');

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: posts.length,
      source: 'stock.fengle.me',
      latestCount: MAX_POSTS,
      posts,
    });

    const liveRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${CACHE_SECONDS}`, 'MISS') });
    const staleRes = new Response(body, { headers: headers(`public, max-age=0, s-maxage=${STALE_SECONDS}`, 'WARM') });
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
