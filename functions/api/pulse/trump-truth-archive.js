import { TRUMP_TRANSLATION_CACHE } from './trump-translation-cache.js';

const SOURCE_URL = 'https://www.trumpstruth.org/?sort=desc&per_page=80&removed=include';
const CACHE_SECONDS = 120;
const STALE_SECONDS = 600;
const RECENT_HOURS = 48;
const MAX_POSTS = 80;
const BAD_TRANSLATION_PATTERNS = [
  '无法访问',
  '無法存取',
  '链接内容无法直接访问',
  '請提供帖文原文',
  '请提供帖文原文',
  '해당 링크의 내용을 확인할 수 없습니다',
  '게시물 원문을 보내주시면',
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

function decodeHtml(str = '') {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x20;/g, ' ')
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(str = '') {
  return decodeHtml(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function extractAttachments(chunk) {
  const blockMatch = chunk.match(/<div class="status__attachments[^"]*">([\s\S]*?)<\/div>\s*(?:<\/div>|<div class="status__footer")/i);
  const block = blockMatch?.[1] || '';
  const urls = [...block.matchAll(/<(?:a|img|source)[^>]+(?:href|src)="(https:[^"]+)"/gi)].map((m) => m[1]);
  return [...new Set(urls)].map((url) => ({
    url,
    type: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image',
  }));
}

function extractPosts(html) {
  const statusesBlock = html.match(/<div class="statuses">([\s\S]*?)<div class="pagination controls__pagination">/i)?.[1] || html;
  const chunks = statusesBlock.split(/<div class="status"\s+data-status-url=/i).slice(1);
  return chunks.slice(0, MAX_POSTS).map((chunk) => {
    const statusUrl = chunk.match(/^"([^"]+)"/)?.[1]?.trim() || null;
    const permalink = chunk.match(/class="status-info__meta-item">([^<]+)<\/a>\s*<\/div>/i)?.[1]?.trim() || null;
    const originalUrl = chunk.match(/href="(https:\/\/truthsocial\.com\/@realDonaldTrump\/[^"]+)"[^>]*class="status__external-link"/i)?.[1] || null;
    const avatar = chunk.match(/<img src="([^"]+)"[^>]*class="status-info__avatar"/i)?.[1] || null;
    const contentHtml = chunk.match(/<div class="status__content">([\s\S]*?)<\/div>/i)?.[1] || '';
    const content = stripTags(contentHtml);
    const createdAtText = permalink || null;
    const createdAt = createdAtText ? new Date(createdAtText).toISOString() : null;
    return {
      status_url: statusUrl,
      url: originalUrl,
      avatar,
      created_at: createdAt,
      created_at_text: createdAtText,
      content,
      content_html: contentHtml,
      media: extractAttachments(chunk),
    };
  }).filter((post) => post.content || post.url);
}

function hasBadTranslation(text = '') {
  return BAD_TRANSLATION_PATTERNS.some((x) => String(text || '').includes(x));
}

function enrichFromArchive(posts, avatarUrl) {
  return posts.map((post) => {
    const translated = TRUMP_TRANSLATION_CACHE[post.url] || {};
    const content_zh_cn = hasBadTranslation(translated.content_zh_cn) ? (post.content || '') : (translated.content_zh_cn || '');
    const content_zh_hk = hasBadTranslation(translated.content_zh_hk) ? (post.content || '') : (translated.content_zh_hk || '');
    const content_ko = hasBadTranslation(translated.content_ko) ? (post.content || '') : (translated.content_ko || '');
    return {
      ...post,
      avatar: avatarUrl,
      content_zh_cn,
      content_zh_hk,
      content_ko,
      favourites_count: null,
      reblogs_count: null,
      replies_count: null,
      media: Array.isArray(post.media) ? post.media : [],
    };
  });
}

function normalizeForDedupe(str = '') {
  return String(str)
    .replace(/\s+/g, ' ')
    .replace(/[“”"'‘’]+/g, '')
    .trim()
    .toLowerCase();
}

function dedupePosts(posts) {
  const seen = new Set();
  const deduped = [];
  for (const post of posts || []) {
    const key = post.url
      || post.status_url
      || `${post.created_at || post.created_at_text || ''}__${normalizeForDedupe(post.content)}`;
    const fallbackKey = `${post.created_at || post.created_at_text || ''}__${normalizeForDedupe(post.content)}`;
    const finalKey = key && key !== '__' ? key : fallbackKey;
    if (!finalKey || seen.has(finalKey)) continue;
    seen.add(finalKey);
    deduped.push(post);
  }
  return deduped;
}

function keepRecentPosts(posts, hours = RECENT_HOURS) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const recent = (posts || []).filter((post) => {
    const ts = post.created_at ? new Date(post.created_at).getTime() : NaN;
    return Number.isFinite(ts) && ts >= cutoff;
  });
  if (recent.length) return recent.slice(0, MAX_POSTS);
  return (posts || []).slice(0, Math.min(MAX_POSTS, 20));
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/live`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/stale`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const resHeaders = new Headers(cached.headers);
      resHeaders.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: resHeaders });
    }

    const upstream = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const html = await upstream.text();
    const posts = extractPosts(html);
    const avatarUrl = `${url.origin}/assets/home/trump-home.jpg`;
    const mergedPosts = enrichFromArchive(posts, avatarUrl);
    const dedupedPosts = dedupePosts(mergedPosts);
    const finalPosts = keepRecentPosts(dedupedPosts);
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: finalPosts.length,
      source: 'trumpstruth.org',
      windowHours: RECENT_HOURS,
      posts: finalPosts,
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
