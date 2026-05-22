import { TRUMP_TRANSLATION_CACHE } from './trump-translation-cache.js';
import { TRUMP_MEDIA_FALLBACK_MAP } from './trump-media-fallback-map.js';

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

function normalizeCnnPosts(items = [], origin = '') {
  return (items || []).map((item) => {
    const content = String(item?.content || '').trim();
    const rawMedia = (Array.isArray(item?.media) ? item.media : []).filter(Boolean);
    const fallbackMedia = TRUMP_MEDIA_FALLBACK_MAP[item?.url || ''] || [];
    const media = (fallbackMedia.length ? fallbackMedia : rawMedia.map((url) => ({ url: proxyMedia(url, origin), type: inferMediaType(url) })))
      .map((m) => ({ ...m, url: m?.url || '' }))
      .filter((m) => !!m.url);
    const createdAt = item?.created_at || null;
    const translated = TRUMP_TRANSLATION_CACHE[item?.url || ''] || {};
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
      content_zh_cn: translated.content_zh_cn || content,
      content_zh_hk: translated.content_zh_hk || content,
      content_ko: translated.content_ko || content,
      source_hint: 'cnn+translation-cache',
    };
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/live-v3`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-lite/stale-v3`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    const upstream = await fetch(CNN_SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!upstream.ok) throw new Error(`cnn upstream ${upstream.status}`);
    const rawItems = await upstream.json();
    const posts = dedupePosts(normalizeCnnPosts(rawItems, url.origin))
      .filter(hasRenderableBodyOrMedia)
      .slice(0, MAX_POSTS);
    if (!posts.length) throw new Error('no posts from cnn');

    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: posts.length,
      source: 'cnn+translation-cache',
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
