import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const shellBase = 'http://nowplaying.local:8101/app.html?page=';
const pageBase = 'http://nowplaying.local:8101/';
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

const outRoot = path.resolve('docs/images/theme-matrix-direct');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function setThemeInShell(page, tabPage, themeName) {
  await page.goto(shellBase + encodeURIComponent(tabPage), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate((theme) => {
    const sel = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options || []).some((o) => (o.textContent || '').trim() === theme)
    );
    if (!sel) throw new Error('theme select not found');
    const opt = Array.from(sel.options).find((o) => (o.textContent || '').trim() === theme);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, themeName);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
await fs.mkdir(outRoot, { recursive: true });

for (const [tabSlug, tabPage] of tabs) {
  const tabDir = path.join(outRoot, tabSlug);
  await fs.mkdir(tabDir, { recursive: true });
  for (const theme of themes) {
    await setThemeInShell(page, tabPage, theme);
    await page.goto(pageBase + tabPage, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(tabDir, `${slug(theme)}.jpg`),
      type: 'jpeg',
      quality: 90,
      fullPage: false,
      animations: 'disabled',
    });
    console.log(`saved ${tabSlug} :: ${theme}`);
  }
}

await context.close();
await browser.close();
console.log('done');
