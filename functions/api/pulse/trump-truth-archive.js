import { TRUMP_TRANSLATION_CACHE } from './trump-translation-cache.js';

const CNN_SOURCE_URL = 'https://ix.cnn.io/data/truth-social/truth_archive.json';
const TRUMPSTRUTH_SOURCE_URL = 'https://www.trumpstruth.org/?sort=desc&per_page=120&removed=include';
const CACHE_SECONDS = 120;
const STALE_SECONDS = 600;
const MAX_POSTS = 20;
const BAD_TRANSLATION_PATTERNS = [
  '无法访问',
  '無法存取',
  '链接内容无法直接访问',
  '請提供帖文原文',
  '请提供帖文原文',
  '抱歉，我无法仅根据链接内容进行翻译',
  '我无法仅根据链接内容进行翻译',
  '无法直接打开或读取该链接内容',
  '無法直接開啟或讀取該連結內容',
  '无法直接访问该链接内容',
  '無法直接存取該連結內容',
  '请把原文帖子正文粘贴过来',
  '請把原文帖文正文貼過來',
  '请把原文贴给我',
  '請把原文貼給我',
  '无法直接打开或读取该链接中的内容',
  '無法直接開啟或讀取該連結中的內容',
  '这是链接，未提供可见原文内容，无法进行准确翻译',
  '這是連結，未提供可見原文內容，無法進行準確翻譯',
  '请提供帖文全文',
  '請提供帖文全文',
  '未提供可见原文内容',
  '未提供可見原文內容',
  '해당 링크는 원문 본문이 보이지 않아 정확한 번역이 어렵습니다',
  '해당 링크의 내용을 확인할 수 없습니다',
  '해당 링크의 내용을 직접 열거나 읽을 수 없습니다',
  '게시물 원문을 보내주시면',
  '원문 게시글 내용을 붙여 주시면',
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
  const items = [];

  const videoUrls = [...chunk.matchAll(/<video[^>]+src="([^"]+\.(?:mp4|mov|webm)[^"]*)"[^>]*?(?:poster="([^"]+)")?/gi)];
  for (const m of videoUrls) {
    const videoUrl = m[1] || '';
    const posterUrl = m[2] || '';
    if (videoUrl) items.push({ url: videoUrl, type: 'video', poster_url: posterUrl || undefined });
  }

  const imageBlocks = [...chunk.matchAll(/<div class="status-attachment\s+status-attachment--image">([\s\S]*?)<\/div>/gi)];
  for (const m of imageBlocks) {
    const inner = m[1] || '';
    const imageUrl = inner.match(/<a[^>]+href="([^"]+\.(?:png|jpe?g|gif|webp)[^"]*)"/i)?.[1]
      || inner.match(/<img[^>]+src="([^"]+\.(?:png|jpe?g|gif|webp)[^"]*)"/i)?.[1]
      || '';
    if (imageUrl) items.push({ url: imageUrl, type: 'image' });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.type}:${item.url}`;
    if (!item.url || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function extractPostsFromTrumpstruth(html) {
  const statusesBlock = html.match(/<div class="statuses">([\s\S]*?)<div class="pagination controls__pagination">/i)?.[1] || html;
  const chunks = statusesBlock.split(/<div class="status"\s+data-status-url=/i).slice(1);
  return chunks.map((chunk) => {
    const statusUrl = chunk.match(/^"([^"]+)"/)?.[1]?.trim() || null;
    const permalink = chunk.match(/class="status-info__meta-item">([^<]+)<\/a>\s*<\/div>/i)?.[1]?.trim() || null;
    const originalUrl = chunk.match(/href="(https:\/\/truthsocial\.com\/@realDonaldTrump\/[^"]+)"[^>]*class="status__external-link"/i)?.[1] || null;
    const avatar = chunk.match(/<img src="([^"]+)"[^>]*class="status-info__avatar"/i)?.[1] || null;
    const contentHtml = chunk.match(/<div class="status__body">([\s\S]*?)<\/div>/i)?.[1]
      || chunk.match(/<div class="status__content">([\s\S]*?)<\/div>/i)?.[1]
      || '';
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
  }).filter((post) => post.content || post.url || (post.media && post.media.length));
}

function inferMediaType(url = '') {
  const raw = String(url || '').toLowerCase();
  if (/\.(mp4|mov|webm)(\?|$)/i.test(raw)) return 'video';
  return 'image';
}

function normalizeCnnPosts(items = []) {
  return (items || []).map((item) => {
    const content = String(item?.content || '').trim();
    const media = (Array.isArray(item?.media) ? item.media : [])
      .filter(Boolean)
      .map((url) => ({ url, type: inferMediaType(url) }));
    const createdAt = item?.created_at || null;
    const createdAtText = createdAt ? new Date(createdAt).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
    }) : null;
    return {
      status_url: item?.url || null,
      url: item?.url || null,
      avatar: null,
      created_at: createdAt,
      created_at_text: createdAtText,
      content,
      content_html: content,
      media,
      favourites_count: item?.favourites_count ?? null,
      reblogs_count: item?.reblogs_count ?? null,
      replies_count: item?.replies_count ?? null,
    };
  }).filter((post) => post.url || post.content || (post.media && post.media.length));
}

function hasBadTranslation(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (BAD_TRANSLATION_PATTERNS.some((x) => raw.includes(x))) return true;
  if (/^链接内容无法直接访问/i.test(raw)) return true;
  if (/^無法/i.test(raw)) return true;
  if (/^请提供/i.test(raw) || /^請提供/i.test(raw)) return true;
  if (/^抱歉，我无法/i.test(raw) || /^抱歉，我無法/i.test(raw)) return true;
  if (/^죄송하지만/i.test(raw)) return true;
  return false;
}

function isUrlOnlyContent(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  return /^https?:\/\/\S+$/i.test(raw);
}

function fallbackDisplayText(post, lang) {
  return String(post?.content || '').trim();
}

function encodeMediaId(url = '') {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function proxyMedia(url, origin) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `${origin}/api/pulse/trump-media?id=${encodeMediaId(url)}`;
}

function mergeContentFromFallback(primaryPosts, fallbackPosts) {
  const fallbackByUrl = new Map();
  for (const post of fallbackPosts || []) {
    if (post?.url && String(post.content || '').trim()) fallbackByUrl.set(post.url, post);
  }
  return (primaryPosts || []).map((post) => {
    if (String(post?.content || '').trim()) return post;
    const fb = fallbackByUrl.get(post?.url);
    if (!fb) return post;
    return {
      ...post,
      content: fb.content,
      content_html: fb.content_html || fb.content,
    };
  });
}

function enrichFromArchive(posts, avatarUrl, origin) {
  return posts.map((post) => {
    const translated = TRUMP_TRANSLATION_CACHE[post.url] || {};
    const content_zh_cn = hasBadTranslation(translated.content_zh_cn)
      ? fallbackDisplayText(post, 'zh_cn')
      : (translated.content_zh_cn || fallbackDisplayText(post, 'zh_cn'));
    const content_zh_hk = hasBadTranslation(translated.content_zh_hk)
      ? fallbackDisplayText(post, 'zh_hk')
      : (translated.content_zh_hk || fallbackDisplayText(post, 'zh_hk'));
    const content_ko = hasBadTranslation(translated.content_ko)
      ? fallbackDisplayText(post, 'ko')
      : (translated.content_ko || fallbackDisplayText(post, 'ko'));
    const media = (Array.isArray(post.media) ? post.media : []).map((m) => ({ ...m, url: proxyMedia(m.url, origin), poster_url: proxyMedia(m.poster_url, origin) }));
    return {
      ...post,
      avatar: avatarUrl,
      content_zh_cn,
      content_zh_hk,
      content_ko,
      favourites_count: post?.favourites_count ?? null,
      reblogs_count: post?.reblogs_count ?? null,
      replies_count: post?.replies_count ?? null,
      media,
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

function hasVideoMedia(post) {
  return Array.isArray(post?.media) && post.media.some((item) => {
    const type = String(item?.type || '').toLowerCase();
    const mediaUrl = String(item?.url || '');
    return type.includes('video') || /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl);
  });
}

function dropVideoPosts(posts) {
  return (posts || []).filter((post) => !hasVideoMedia(post));
}

function hasRenderableBodyOrMedia(post) {
  const raw = String(post?.content || '').trim();
  const zh = String(post?.content_zh_cn || '').trim();
  const hasMedia = Array.isArray(post?.media) && post.media.length > 0;
  if (hasMedia) return true;
  if (!raw && !zh) return false;
  return !isUrlOnlyContent(raw);
}

function dropTrulyEmptyPosts(posts) {
  return (posts || []).filter((post) => hasRenderableBodyOrMedia(post));
}

function keepLatestPosts(posts) {
  return (posts || []).slice(0, MAX_POSTS);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cache = caches.default;
  const liveKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/live-v6`);
  const staleKey = new Request(`${url.origin}/__edge/pulse/trump-truth-archive/stale-v6`);

  try {
    const cached = await cache.match(liveKey);
    if (cached) {
      const resHeaders = new Headers(cached.headers);
      resHeaders.set('x-edge-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: resHeaders });
    }

    const cnnUpstream = await fetch(CNN_SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!cnnUpstream.ok) throw new Error(`cnn upstream ${cnnUpstream.status}`);
    const rawItems = await cnnUpstream.json();
    const cnnPosts = normalizeCnnPosts(rawItems);

    let fallbackPosts = [];
    try {
      const tsUpstream = await fetch(TRUMPSTRUTH_SOURCE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HK-ETF-Lab/1.0; +https://hketf-lab.pages.dev/)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (tsUpstream.ok) {
        const tsHtml = await tsUpstream.text();
        fallbackPosts = extractPostsFromTrumpstruth(tsHtml);
      }
    } catch (_) {}

    const posts = mergeContentFromFallback(cnnPosts, fallbackPosts);
    const avatarUrl = `${url.origin}/assets/home/trump-home.jpg`;
    const mergedPosts = enrichFromArchive(posts, avatarUrl, url.origin);
    const dedupedPosts = dedupePosts(mergedPosts);
    const noVideoPosts = dropVideoPosts(dedupedPosts);
    const displayablePosts = dropTrulyEmptyPosts(noVideoPosts);
    const finalPosts = keepLatestPosts(displayablePosts);
    const body = JSON.stringify({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: finalPosts.length,
      source: 'cnn + translation cache',
      latestCount: MAX_POSTS,
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
