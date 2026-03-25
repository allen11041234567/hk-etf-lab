import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/playwright-stealth.js "<url>" [--wait 5000] [--timeout 30000]');
  process.exit(1);
}

const waitMs = Number(getArg('--wait', '4000'));
const timeoutMs = Number(getArg('--timeout', '30000'));

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForTimeout(waitMs);

  const result = await page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText : '';
    return {
      title: document.title || '',
      finalUrl: location.href,
      content: bodyText.replace(/\n{3,}/g, '\n\n').trim().slice(0, 50000),
      htmlLength: document.documentElement?.outerHTML?.length || 0,
    };
  });

  console.log(JSON.stringify({ url, ...result }, null, 2));
} finally {
  await browser.close();
}
