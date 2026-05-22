const CNN_SOURCE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
const ARCHIVE_ASSET_PATH = '/assets/data/trump-truth-archive-latest.json';
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
  return /\.(mp4|mov|webm)(\?|$)/i.test(String(url || '').toLowerCase()) ? 'video' : 'image';
}

function encodeMediaId(url = '') {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function proxyMedia(url, origin) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  if (inferMediaType(url) !== 'image') return url;
  return `${origin}/api/pulse/trump-media?id=${encodeMediaId(url)}`;
}

function formatCreatedAtText(createdAt) {
  if (!createdAt) return null;
  return new Date(createdAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
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
  return !!raw || hasMedia;
}

async function fetchArchiveMap(origin) {
  try {
    const res = await fetch(`${origin}${ARCHIVE_ASSET_PATH}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!res.ok) return new Map();
    const data = await res.json();
    const posts = Array.isArray(data?.posts) ? data.posts : [];
    return new Map(posts.filter((p) => p?.url).map((p) => [p.url, p]));
  } catch {
    return new Map();
  }
}

function normalizeCnnPosts(items = [], origin = '', archiveMap = new Map()) {
  return (items || []).slice(0, MAX_POSTS).map((item) => {
    const content = String(item?.content || '').trim();
    const archived = archiveMap.get(item?.url || '') || {};
    const rawMedia = (Array.isArray(item?.media) ? item.media : []).filter(Boolean);
    const media = (Array.isArray(archived?.media) && archived.media.length ? archived.media : rawMedia.map((url) => ({ url: proxyMedia(url, origin), type: inferMediaType(url) })))
      .filter((m) => !!m?.url);
    const createdAt = item?.created_at || null;
    return {
      status_url: item?.url || null,
      url: item?.url || null,
      avatar: `${origin}/assets/home/trump-home.jpg`,
      created_at: createdAt,
      created_at_text: formatCreatedAtText(createdAt),
      content,
      content_html: content,
      media,
      favourites_count: item?.favourites_count ?? null,
      reblogs_count: item?.reblogs_count ?? null,
      replies_count: item?.replies_count ?? null,
      content_zh_cn: archived?.content_zh_cn || content,
      content_zh_hk: archived?.content_zh_hk || content,
      content_ko: archived?.content_ko || content,
      source_hint: 'cnn+archive-enrichment',
    };
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  const cache = caches.default;
  const liveKey = new Request(`${origin}/__edge/pulse/trump-truth-lite/live-v4`);
  const staleKey = new Request(`${origin}/__edge/pulse/trump-truth-lite/stale-v4`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const [cnnRes, archiveMap] = await Promise.all([
      fetch(CNN_SOURCE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
          Accept: 'application/json,text/plain,*/*',
        },
      }),
      fetchArchiveMap(origin),
    ]);
    if (!cnnRes.ok) throw new Error(`cnn upstream ${cnnRes.status}`);
    const rawItems = await cnnRes.json();
    const posts = dedupePosts(normalizeCnnPosts(rawItems, origin, archiveMap))
      .filter(hasRenderableBodyOrMedia)
      .slice(0, MAX_POSTS);
    if (!posts.length) throw new Error('no posts from cnn');

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: posts.length,
      source: 'cnn+archive-enrichment',
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
