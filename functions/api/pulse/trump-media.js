function corsHeaders(contentType = 'application/octet-stream') {
  return {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=300, s-maxage=600',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  if (!/^https:\/\//i.test(target)) {
    return new Response('bad url', { status: 400, headers: corsHeaders('text/plain; charset=utf-8') });
  }
  if (!/truth-archive\.us-iad-1\.linodeobjects\.com|static-assets-1\.truthsocial\.com|www\.trumpstruth\.org/i.test(target)) {
    return new Response('forbidden host', { status: 403, headers: corsHeaders('text/plain; charset=utf-8') });
  }

  const upstream = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
      'Accept': '*/*',
      'Range': request.headers.get('Range') || '',
    },
  });

  const headers = new Headers(corsHeaders(upstream.headers.get('content-type') || 'application/octet-stream'));
  const passthrough = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const key of passthrough) {
    const val = upstream.headers.get(key);
    if (val) headers.set(key, val);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
