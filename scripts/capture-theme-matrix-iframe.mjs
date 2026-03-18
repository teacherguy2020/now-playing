import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = 'http://nowplaying.local:8101/app.html?page=';
const tabs = [
  ['config', 'config.html'],
  ['diagnostics', 'diagnostics.html'],
  ['alexa', 'alexa.html'],
  ['library-health', 'library-health.html'],
  ['queue-wizard', 'queue-wizard.html'],
  ['radio', 'radio.html'],
  ['podcasts', 'podcasts.html'],
  ['theme', 'theme.html'],
];
const themes = [
  'Abyss Graphite',
  'Blue Neon',
  'Chill Blue',
  'Matrix',
  'Monotone Gray',
  'Muted Merlot',
  'Red Neon',
  'Slate Medium',
  'Warm Parchment',
];

const outRoot = path.resolve('docs/images/theme-matrix-iframe');

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function setTheme(page, themeName) {
  await page.evaluate((theme) => {
    const selects = Array.from(document.querySelectorAll('select'));
    const sel = selects.find((s) => {
      const opts = Array.from(s.options || []).map((o) => (o.textContent || '').trim());
      return opts.includes('Theme preset…') && opts.includes(theme);
    });
    if (!sel) throw new Error('Quick theme preset select not found');
    const opt = Array.from(sel.options).find((o) => (o.textContent || '').trim() === theme);
    if (!opt) throw new Error(`Theme option not found: ${theme}`);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, themeName);
}

async function waitForIframePage(page, tabPage) {
  await page.waitForFunction((p) => {
    const ifr = document.querySelector('iframe');
    if (!ifr) return false;
    const src = String(ifr.getAttribute('src') || ifr.src || '');
    return src.includes(p);
  }, tabPage, { timeout: 15000 });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 2400 } });
const page = await context.newPage();
await fs.mkdir(outRoot, { recursive: true });

for (const [tabSlug, tabPage] of tabs) {
  const tabDir = path.join(outRoot, tabSlug);
  await fs.mkdir(tabDir, { recursive: true });
  await page.goto(base + encodeURIComponent(tabPage), { waitUntil: 'domcontentloaded' });
  await waitForIframePage(page, tabPage);

  for (const theme of themes) {
    await setTheme(page, theme);
    await waitForIframePage(page, tabPage);

    const iframe = page.locator('iframe').first();
    const box = await iframe.boundingBox();
    if (!box) throw new Error(`No iframe box for ${tabSlug}/${theme}`);

    const out = path.join(tabDir, `${slug(theme)}.jpg`);
    await page.screenshot({
      path: out,
      type: 'jpeg',
      quality: 90,
      clip: {
        x: Math.max(0, Math.floor(box.x)),
        y: Math.max(0, Math.floor(box.y)),
        width: Math.floor(box.width),
        height: Math.floor(box.height),
      },
      animations: 'disabled',
    });
    console.log(`saved ${tabSlug} :: ${theme}`);
  }
}

await context.close();
await browser.close();
console.log('done');
