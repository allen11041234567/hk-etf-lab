const CNN_SOURCE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
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

function inferMediaType(url = '') {
  const raw = String(url || '').toLowerCase();
  if (/\.(mp4|mov|webm)(\?|$)/i.test(raw)) return 'video';
  return 'image';
}

function encodeMediaId(url = '') {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function proxyMedia(url, origin) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `${origin}/api/pulse/trump-media?id=${encodeMediaId(url)}`;
}

function normalizeCnnPosts(items = [], origin) {
  return (items || []).map((item) => {
    const content = String(item?.content || '').trim();
    const media = (Array.isArray(item?.media) ? item.media : [])
      .filter(Boolean)
      .map((url) => {
        const type = inferMediaType(url);
        return { url: type === 'image' ? proxyMedia(url, origin) : url, type };
      });
    const createdAt = item?.created_at || null;
    const createdAtText = createdAt ? new Date(createdAt).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
    }) : null;
    return {
      status_url: item?.url || null,
      url: item?.url || null,
      avatar: `${origin}/assets/home/trump-home.jpg`,
      created_at: createdAt,
      created_at_text: createdAtText,
      content,
      content_html: content,
      media,
      favourites_count: item?.favourites_count ?? null,
      reblogs_count: item?.reblogs_count ?? null,
      replies_count: item?.replies_count ?? null,
      content_zh_cn: content,
      content_zh_hk: content,
      content_ko: content,
      source_hint: 'cnn',
    };
  }).filter((post) => post.url || post.content || (post.media && post.media.length));
}

function dedupePosts(posts) {
  const seen = new Set();
  const out = [];
  for (const post of posts || []) {
    const key = post.url || post.status_url || `${post.created_at || ''}__${post.content || ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

function hasRenderableBodyOrMedia(post) {
  const raw = String(post?.content || '').trim();
  const hasMedia = Array.isArray(post?.media) && post.media.length > 0;
  if (hasMedia) return true;
  return !!raw;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/live-v1`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/stale-v1`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const cnnUpstream = await fetch(CNN_SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!cnnUpstream.ok) throw new Error(`cnn upstream ${cnnUpstream.status}`);
    const rawItems = await cnnUpstream.json();
    const posts = dedupePosts(normalizeCnnPosts(rawItems, url.origin)).filter(hasRenderableBodyOrMedia).slice(0, MAX_POSTS);

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: posts.length,
      source: 'cnn-lite',
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
