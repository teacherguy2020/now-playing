import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const APP = 'http://10.0.0.233:8101/app.html?page=';
const API = 'http://10.0.0.233:3101';
const TRACK_KEY = '1029384756';
const OUT = path.resolve('docs/images/review-efficient-flow-20260227');

const THEMES = ['Abyss Graphite','Blue Neon','Chill Blue','Matrix','Monotone Gray','Muted Merlot','Red Neon','Slate Medium','Warm Parchment'];
const KRALL_TABS = [
  ['01-config.jpg','config.html'],
  ['02-diagnostics.jpg','diagnostics.html'],
  ['03-alexa.jpg','alexa.html'],
  ['04-library-health.jpg','library-health.html'],
  ['05-queue-wizard.jpg','queue-wizard.html'],
  ['08-theme.jpg','theme.html'],
];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function jfetch(url, opts={}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${r.status} ${url} :: ${t.slice(0,200)}`);
  return j ?? t;
}

async function play(action='play') {
  await jfetch(`${API}/config/diagnostics/playback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-track-key': TRACK_KEY },
    body: JSON.stringify({ action }),
  });
}

async function setKrallContext() {
  await jfetch(`${API}/mpd/play-artist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-track-key': TRACK_KEY },
    body: JSON.stringify({ artist: 'Diana Krall' }),
  });
  await play('play');
  await new Promise((r) => setTimeout(r, 5000));
}

async function setRadioContext() {
  const prev = await jfetch(`${API}/config/queue-wizard/radio-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-track-key': TRACK_KEY },
    body: JSON.stringify({ favoritesOnly: true, maxStations: 500 }),
  });
  const tracks = Array.isArray(prev?.tracks) ? prev.tracks : [];
  const pick = tracks.find((t)=>/jazz24|iheart\s*vinyl\s*jazz/i.test(String(t.stationName||t.artist||''))) || tracks[0];
  if (!pick?.file) throw new Error('No radio station found');
  await jfetch(`${API}/mpd/play-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-track-key': TRACK_KEY },
    body: JSON.stringify({ file: pick.file }),
  });
  await play('play');
  await new Promise((r) => setTimeout(r, 5000));
}

async function setPodcastContext() {
  const pods = await jfetch(`${API}/podcasts`);
  const items = Array.isArray(pods?.items) ? pods.items : [];
  const show = items.find((s)=>/smartless/i.test(String(s.title||''))) || items[0];
  if (!show?.rss) throw new Error('No podcast subscriptions found');
  const eps = await jfetch(`${API}/podcasts/episodes/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rss: show.rss, limit: 100 }),
  });
  const list = Array.isArray(eps?.episodes) ? eps.episodes : [];
  const ep = list.find((e)=>e.downloaded && e.mpdPath) || list.find((e)=>e.mpdPath) || list[0];
  if (!ep) throw new Error('No podcast episodes found');
  const file = ep.mpdPath || ep.enclosure;
  if (!file) throw new Error('Podcast episode has no playable path');
  await jfetch(`${API}/mpd/play-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-track-key': TRACK_KEY },
    body: JSON.stringify({ file }),
  });
  await play('play');
  await new Promise((r) => setTimeout(r, 5000));
}

async function setTheme(page, theme) {
  await page.evaluate((themeName) => {
    const sel = [...document.querySelectorAll('select')].find((s)=> [...s.options].some((o)=> (o.textContent||'').trim()===themeName));
    if (!sel) throw new Error('theme select not found');
    const opt = [...sel.options].find((o)=> (o.textContent||'').trim()===themeName);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, theme);
}

async function settle(page) {
  await page.evaluate(() => {
    const favBtn = [...document.querySelectorAll('button')].find((b)=>/favorites/i.test(b.textContent||''));
    const drawer = document.querySelector('[role="complementary"]');
    if (favBtn && drawer) favBtn.click();
    const qBtn = [...document.querySelectorAll('button')].find((b)=>/expand|collapse/i.test((b.textContent||'').trim()));
    if (qBtn && /collapse/i.test(qBtn.textContent||'')) qBtn.click();
    window.scrollTo(0,0);
  });
  await page.waitForTimeout(1200);
}

async function cap(page, tabPage, outFile, theme) {
  await page.goto(APP + encodeURIComponent(tabPage), { waitUntil: 'domcontentloaded' });
  await setTheme(page, theme);
  await settle(page);
  await page.screenshot({ path: outFile, type: 'jpeg', quality: 90, fullPage: false, animations: 'disabled' });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
await fs.mkdir(OUT, { recursive: true });

for (const theme of THEMES) {
  const tdir = path.join(OUT, slug(theme));
  await fs.mkdir(tdir, { recursive: true });

  await setKrallContext();
  for (const [name, tab] of KRALL_TABS) {
    await cap(page, tab, path.join(tdir, name), theme);
  }
  await play('pause');

  await setRadioContext();
  await cap(page, 'radio.html', path.join(tdir, '06-radio.jpg'), theme);
  await play('pause');

  await setPodcastContext();
  await cap(page, 'podcasts.html', path.join(tdir, '07-podcasts.jpg'), theme);
  await play('pause');

  console.log('done theme', theme);
}

await context.close();
await browser.close();
console.log('done', OUT);
