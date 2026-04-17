const CACHE_SECONDS = 60;
const STALE_SECONDS = 300;

function headers(cacheControl, state) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheControl,
    'access-control-allow-origin': '*',
    'x-edge-cache': state,
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function mapArchivePost(post) {
  return {
    url: post.url || post.status_url || 'https://truthsocial.com/@realDonaldTrump',
    created_at: post.created_at || null,
    content: post.content || '',
    content_zh_cn: post.content_zh_cn || '',
    favourites_count: post.favourites_count ?? 0,
    reblogs_count: post.reblogs_count ?? 0,
    replies_count: post.replies_count ?? 0,
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-feed/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-feed/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const resHeaders = new Headers(cached.headers);
      resHeaders.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: resHeaders });
    }

    const upstream = await fetch(`${url.origin}/api/pulse/trump-truth-archive`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'application/json, text/plain, */*',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const payload = await upstream.json();
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 12).map(mapArchivePost) : [];
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: 'trump-truth-archive',
      count: posts.length,
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
      const resHeaders = new Headers(stale.headers);
      resHeaders.set('x-edge-cache', 'STALE');
      return new Response(stale.body, { status: 200, headers: resHeaders });
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: headers('no-store', 'ERROR'),
    });
  }
}
