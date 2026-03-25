import { chromium } from '/root/.openclaw/workspace/skills/playwright-scraper/node_modules/playwright-extra/dist/index.js';
import StealthPlugin from '/root/.openclaw/workspace/skills/playwright-scraper/node_modules/puppeteer-extra-plugin-stealth/index.js';
import fs from 'fs';
import path from 'path';

chromium.use(StealthPlugin());

const [,, symbol='07709', slot='manual', email='', password=''] = process.argv;
if (!email || !password) {
  console.error('Usage: node capture_futu_community.mjs <symbol> <slot> <email> <password>');
  process.exit(1);
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const baseDir = path.resolve('..');
const dayDir = path.join(baseDir, date);
const rawDir = path.join(dayDir, 'raw');
const normDir = path.join(dayDir, 'normalized');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(normDir, { recursive: true });

const rawPath = path.join(rawDir, `${slot}.txt`);
const jsonPath = path.join(normDir, `${slot}.json`);

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function hourValue(line) {
  const s = String(line || '').trim();
  let m = s.match(/^(\d+)\s*小時前$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)\s*分鐘前$/);
  if (m) return 0;
  if (s === '剛剛') return 0;
  return null;
}

function buildDedupeKey(item) {
  return [item.platform, item.symbol, item.hourBucket, item.user, item.postText, item.replyText].join('||');
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    locale: 'zh-HK',
  });
  const page = await context.newPage();

  // login
  await page.goto(`https://passport.futunn.com/?target=${encodeURIComponent(`http://www.futunn.com/hk/etfs/${symbol}-HK/community`)}#/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2200);
  await page.getByRole('link', { name: 'Log In' }).click();
  await sleep(1000);
  await page.locator('a.switch-btn.login-show[data-type="account"]').first().click({ force: true }).catch(() => {});
  await page.evaluate(() => {
    const el = document.querySelector('a.switch-btn.login-show[data-type="account"]');
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(700);
  await page.locator('input[name="account"]').first().fill(email);
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll('input.submit-btn'))) {
      const r = b.getBoundingClientRect();
      if (r.width > 100 && r.height > 20) { b.click(); break; }
    }
  });
  await sleep(1500);
  await page.locator('input[type="password"]').first().fill(password);
  await sleep(300);
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll('input.submit-btn'))) {
      const r = b.getBoundingClientRect();
      if (r.width > 100 && r.height > 20) { b.click(); break; }
    }
  });
  await sleep(4200);

  await page.goto(`https://www.futunn.com/hk/etfs/${symbol}-HK/community?lang=zh-hk`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);

  let clickCount = 0;
  let prevLen = 0;
  let stable = 0;
  let finalText = '';
  for (let round = 1; round <= 30; round++) {
    const text = await page.locator('body').innerText();
    finalText = text;
    if (Math.abs(text.length - prevLen) < 15) stable += 1; else stable = 0;
    prevLen = text.length;

    if (clickCount < 14) {
      const loc = page.getByText('查看更多評論...', { exact: true });
      const c = await loc.count().catch(() => 0);
      let done = false;
      for (let i = 0; i < c && !done; i++) {
        const el = loc.nth(i);
        if (await el.isVisible().catch(() => false)) {
          await el.click({ force: true, timeout: 2500 }).catch(() => {});
          clickCount++;
          done = true;
          await sleep(2400 + round * 70);
        }
      }
    }

    await page.mouse.wheel(0, 3000);
    await sleep(2800 + round * 90);
    if (stable >= 10 && clickCount >= 8) break;
  }

  fs.writeFileSync(rawPath, finalText, 'utf8');

  const lines = finalText.split('\n').map(s => s.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const hv = hourValue(lines[i]);
    if (hv === null) continue;
    const user = lines[i - 1] || '';
    const contentParts = [];
    let j = i + 1;
    while (j < lines.length) {
      const t = lines[j];
      if (hourValue(t) !== null) break;
      if (/^(投資服務|行情工具|資訊及牛牛圈|費用|優惠與活動|財富專欄|關於我們|幫助|立即開戶|下載|自選|選股器|熱力圖|機構追踪|香港ETF|個股詳情|概覽|資訊|評論|熱門市場機會|熱門話題|牛牛課堂|投資用富途!|- 没有更多了 -|分享心情或投資心得|最新|推薦)$/.test(t)) break;
      contentParts.push(t);
      j++;
      if (contentParts.length > 30) break;
    }
    const block = contentParts.join(' ');
    if (!new RegExp(`${symbol}\\.HK|南方兩倍做多海力士|\\$南方兩倍做多海力士`).test(`${user} ${block}`)) continue;
    const replies = contentParts.filter(p => /^[^\s].*:\s?.+/.test(p));
    items.push({
      platform: 'futu',
      symbol,
      captureSlot: slot,
      captureTime: now.toISOString(),
      hourBucket: hv,
      user,
      postText: block,
      visibleReplyCount: replies.length,
      replies,
      dedupeKey: buildDedupeKey({ platform: 'futu', symbol, hourBucket: hv, user, postText: block, replyText: replies.join(' | ') })
    });
  }

  fs.writeFileSync(jsonPath, JSON.stringify({ date, slot, symbol, captureTime: now.toISOString(), itemCount: items.length, items }, null, 2), 'utf8');
  console.log(JSON.stringify({ rawPath, jsonPath, itemCount: items.length, clickCount }, null, 2));
} finally {
  await browser.close();
}
