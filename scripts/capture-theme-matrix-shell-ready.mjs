import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = 'http://10.0.0.233:8101/app.html?page=';
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
  'Abyss Graphite', 'Blue Neon', 'Chill Blue', 'Matrix', 'Monotone Gray', 'Muted Merlot', 'Red Neon', 'Slate Medium', 'Warm Parchment',
];

const outRoot = path.resolve('docs/images/theme-matrix-shell-ready');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function setTheme(page, themeName) {
  await page.evaluate((theme) => {
    const sel = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options || []).map((o) => (o.textContent || '').trim()).includes(theme)
    );
    if (!sel) throw new Error('Quick theme select not found');
    const opt = Array.from(sel.options).find((o) => (o.textContent || '').trim() === theme);
    if (!opt) throw new Error(`Theme missing: ${theme}`);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, themeName);
}

async function waitHeroReady(page, tabPage) {
  await page.waitForFunction((p) => {
    const ifr = document.querySelector('iframe');
    if (!ifr) return false;
    const src = String(ifr.getAttribute('src') || ifr.src || '');
    return src.includes(p);
  }, tabPage, { timeout: 15000 });
  await page.waitForTimeout(2200);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
await fs.mkdir(outRoot, { recursive: true });

for (const [tabSlug, tabPage] of tabs) {
  const tabDir = path.join(outRoot, tabSlug);
  await fs.mkdir(tabDir, { recursive: true });

  await page.goto(base + encodeURIComponent(tabPage), { waitUntil: 'domcontentloaded' });
  await waitHeroReady(page, tabPage);

  for (const theme of themes) {
    await setTheme(page, theme);
    await page.waitForTimeout(700);
    await waitHeroReady(page, tabPage);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);

    const out = path.join(tabDir, `${slug(theme)}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 90, fullPage: false, animations: 'disabled' });
    console.log(`saved ${tabSlug} :: ${theme}`);
  }
}

await context.close();
await browser.close();
console.log('done');
