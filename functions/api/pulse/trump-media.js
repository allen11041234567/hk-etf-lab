function corsHeaders(contentType = 'application/octet-stream') {
  return {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'Range,Content-Type',
    'access-control-expose-headers': 'Content-Length,Content-Range,Accept-Ranges,Content-Type,ETag,Last-Modified',
    'cache-control': 'public, max-age=300, s-maxage=600',
    'content-disposition': 'inline',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
}

function isAllowedHost(target = '') {
  return /truth-archive\.us-iad-1\.linodeobjects\.com|static-assets-1\.truthsocial\.com|www\.trumpstruth\.org/i.test(target);
}

async function proxy(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  if (!/^https:\/\//i.test(target)) {
    return new Response('bad url', { status: 400, headers: corsHeaders('text/plain; charset=utf-8') });
  }
  if (!isAllowedHost(target)) {
    return new Response('forbidden host', { status: 403, headers: corsHeaders('text/plain; charset=utf-8') });
  }

  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
    'Accept': '*/*',
  };
  const range = request.headers.get('Range');
  if (range) upstreamHeaders['Range'] = range;

  // Some origins do not answer HEAD correctly for media. Use GET for both and
  // return an empty body for HEAD while preserving media headers.
  const upstream = await fetch(target, { method: 'GET', headers: upstreamHeaders });
  const headers = new Headers(corsHeaders(upstream.headers.get('content-type') || 'application/octet-stream'));
  headers.set('accept-ranges', upstream.headers.get('accept-ranges') || 'bytes');
  const passthrough = ['content-length', 'content-range', 'etag', 'last-modified'];
  for (const key of passthrough) {
    const val = upstream.headers.get(key);
    if (val) headers.set(key, val);
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: upstream.status, headers });
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders('text/plain; charset=utf-8') });
}

export async function onRequestHead({ request }) {
  return proxy(request);
}

export async function onRequestGet({ request }) {
  return proxy(request);
}
