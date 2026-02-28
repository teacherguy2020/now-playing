import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { MPD_HOST, MOODE_SSH_HOST } from '../config.mjs';

const execFileP = promisify(execFile);
const RADIO_DB_SEP = '__NPSEP__';
const RADIO_PRESETS_PATH = path.resolve(process.cwd(), 'data/radio-queue-presets.json');

const OPTIONS_CACHE_TTL_MS = 30_000;
const PLAYLISTS_CACHE_TTL_MS = 45_000;
let optionsCache = { ts: 0, host: '', payload: null, inflight: null };
let playlistsCache = { ts: 0, host: '', payload: null, inflight: null };

function sqlQuoteLike(v = '') {
  const s = String(v || '').replace(/'/g, "''");
  return `'%${s}%'`;
}

function shQuoteArg(s) {
  const v = String(s ?? '');
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

function stationKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return s.replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function stationHost(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try { return String(new URL(s).hostname || '').toLowerCase(); } catch { return ''; }
}

function toHttpsUrl(v = '') {
  const s = String(v || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function parseIheartLiveUrl(v = '') {
  const s = toHttpsUrl(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    const host = String(u.hostname || '').toLowerCase();
    if (!/(^|\.)iheart\.com$/.test(host)) return null;
    const path = String(u.pathname || '').trim();
    if (!/^\/live\//i.test(path)) return null;

    const clean = path.replace(/\/+$/, '');
    const lastSeg = decodeURIComponent(clean.split('/').filter(Boolean).pop() || '');
    const m = lastSeg.match(/^(.*?)-(\d+)$/);
    const slug = String((m?.[1] || lastSeg || '')).replace(/-/g, ' ').trim();
    const stationId = Number(m?.[2] || 0) || 0;
    return { originalUrl: s, stationId, slug };
  } catch {
    return null;
  }
}

function parseIheartRevmaStationId(v = '') {
  const s = toHttpsUrl(v);
  if (!s) return 0;
  try {
    const u = new URL(s);
    const host = String(u.hostname || '').toLowerCase();
    if (!/(^|\.)revma\.ihrhls\.com$/.test(host)) return 0;
    const m = String(u.pathname || '').match(/\/zc(\d+)(?:\/|$)/i);
    return Number(m?.[1] || 0) || 0;
  } catch {
    return 0;
  }
}

async function fetchIheartStationById(id) {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = await fetch(`https://api.iheart.com/api/v2/content/liveStations/${n}`, {
    headers: { 'User-Agent': 'now-playing-radio-browser/1.0' },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const hit = Array.isArray(j?.hits) ? j.hits[0] : null;
  return hit && typeof hit === 'object' ? hit : null;
}

function listIheartStreamCandidates(st = null) {
  const streams = st?.streams && typeof st.streams === 'object' ? st.streams : {};
  const order = [
    // MPD/moOde tends to be most reliable with direct shoutcast endpoints first.
    'secure_shoutcast_stream',
    'shoutcast_stream',
    'secure_hls_stream',
    'hls_stream',
    'secure_pls_stream',
    'pls_stream',
    'stw_stream',
  ];
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const u = toHttpsUrl(raw || '');
    if (u && !seen.has(u)) { out.push(u); seen.add(u); }
  };
  for (const k of order) add(streams?.[k] || '');
  for (const v of Object.values(streams || {})) add(v || '');

  // Fallbacks: StreamTheWorld redirect endpoints by call letters.
  const calls = String(st?.callLetters || st?.callletters || '').trim().toUpperCase();
  const cc = calls.replace(/[^A-Z0-9]/g, '');
  const stwIds = [calls, cc]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .flatMap((x) => [x, `${x}FM`, `${x}AM`, `${x}AAC`, `${x}FMAAC`, `${x}AMAAC`]);
  const uniqueIds = Array.from(new Set(stwIds));
  for (const id of uniqueIds) {
    add(`https://playerservices.streamtheworld.com/api/livestream-redirect/${id}.aac`);
    add(`https://playerservices.streamtheworld.com/api/livestream-redirect/${id}.m3u8`);
    add(`https://playerservices.streamtheworld.com/api/livestream-redirect/${id}.pls`);
  }

  return out;
}

async function isLikelyReachableStream(url = '') {
  const u = toHttpsUrl(url);
  if (!u) return false;
  try {
    const head = await fetch(u, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'now-playing-radio-browser/1.0' } });
    if (head.status >= 200 && head.status < 400) return true;
  } catch {}
  try {
    const get = await fetch(u, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'now-playing-radio-browser/1.0', Range: 'bytes=0-1' } });
    if (get.status >= 200 && get.status < 400) return true;
  } catch {}
  return false;
}

async function resolveIheartLivePage(rawUrl = '', fallbackName = '') {
  const parsed = parseIheartLiveUrl(rawUrl);
  if (!parsed) return null;

  let station = null;
  if (parsed.stationId > 0) {
    station = await fetchIheartStationById(parsed.stationId);
  }

  if (!station) {
    const keywords = String(fallbackName || parsed.slug || '').trim();
    if (keywords) {
      const sUrl = new URL('https://api.iheart.com/api/v1/catalog/searchAll');
      sUrl.searchParams.set('keywords', keywords);
      const r = await fetch(sUrl.toString(), { headers: { 'User-Agent': 'now-playing-radio-browser/1.0' } });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        const first = Array.isArray(j?.stations) ? j.stations[0] : null;
        if (first?.id) station = await fetchIheartStationById(first.id);
      }
    }
  }

  if (!station) {
    throw new Error('Could not resolve iHeart page to a playable stream URL');
  }

  const candidates = listIheartStreamCandidates(station);
  if (!candidates.length) throw new Error('iHeart station has no exposed direct stream URL');
  let streamUrl = '';
  for (const c of candidates) {
    if (await isLikelyReachableStream(c)) { streamUrl = c; break; }
  }
  if (!streamUrl) streamUrl = candidates[0] || '';
  if (!streamUrl) throw new Error('iHeart station has no usable direct stream URL');

  const home = toHttpsUrl(station?.website || station?.social?.website || parsed.originalUrl);
  const favicon = toHttpsUrl(station?.logo || station?.newlogo || station?.image || '');

  return {
    resolved: true,
    originalUrl: parsed.originalUrl,
    station: {
      name: String(station?.name || fallbackName || parsed.slug || 'iHeart Station').trim(),
      url: streamUrl,
      homepage: home,
      favicon,
    },
  };
}

function normalizeGenreLabel(v = '') {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const keepUpper = new Set(['r&b', 'edm', 'dj', 'am', 'fm']);
  return lower
    .split(/\s+/)
    .map((w) => {
      if (keepUpper.has(w)) return w.toUpperCase();
      if (w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function isGenericStationName(v = '') {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return true;
  if (s === 'custom station') return true;
  if (s === 'stream revma ihrhls') return true;
  if (/^zc\d+$/i.test(s)) return true;
  if (/^stream\s+[a-z0-9.-]+$/i.test(s)) return true;
  return false;
}

function guessStationNameFromUrl(streamUrl = '') {
  const s = toHttpsUrl(streamUrl);
  if (!s) return '';
  try {
    const u = new URL(s);
    const host = String(u.hostname || '').replace(/^www\./i, '').toLowerCase();
    const pathBits = String(u.pathname || '')
      .split('/')
      .map((x) => x.trim())
      .filter(Boolean);
    const mount = String(pathBits[pathBits.length - 1] || '').toLowerCase();

    // Host-aware improvements
    if (host.includes('somafm.com') && mount) {
      const channel = mount
        .replace(/\.(mp3|aac|ogg|opus|m3u|pls)$/i, '')
        .replace(/[-_]?\d+\s*(k|kbps)?$/i, '')
        .replace(/[-_](mp3|aac|ogg|opus)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (channel) {
        const pretty = channel
          .split(/\s+/)
          .map((w) => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '')
          .join(' ')
          .replace(/\bFm\b/g, 'FM');
        return `SomaFM: ${pretty}`;
      }
      return 'SomaFM';
    }

    // Generic mountpoint-based fallback (often better than hostname)
    if (mount) {
      const cleanMount = mount
        .replace(/\.(mp3|aac|ogg|opus|m3u|pls)$/i, '')
        .replace(/[-_]?\d+\s*(k|kbps)?$/i, '')
        .replace(/[-_](mp3|aac|ogg|opus)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (cleanMount && cleanMount.length >= 3) {
        return cleanMount
          .split(/\s+/)
          .map((w) => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '')
          .join(' ')
          .replace(/\bFm\b/g, 'FM');
      }
    }

    const stem = host.split('.').slice(0, -1).join('.') || host;
    return stem
      .split(/[-_.]+/)
      .map((w) => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '')
      .join(' ')
      .trim();
  } catch {
    return '';
  }
}

function guessFaviconFromUrl(streamUrl = '', homepage = '') {
  const hp = toHttpsUrl(homepage);
  if (hp) {
    try {
      const hu = new URL(hp);
      return `${hu.origin}/favicon.ico`;
    } catch {}
  }
  const s = toHttpsUrl(streamUrl);
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

async function readRadioPresetsFile() {
  try {
    const raw = await fs.readFile(RADIO_PRESETS_PATH, 'utf8');
    const arr = JSON.parse(String(raw || '[]'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeRadioPresetsFile(list = []) {
  const arr = Array.isArray(list) ? list : [];
  await fs.mkdir(path.dirname(RADIO_PRESETS_PATH), { recursive: true });
  const tmp = `${RADIO_PRESETS_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8');
  await fs.rename(tmp, RADIO_PRESETS_PATH);
}

async function queryMoodeRadioDb(sql) {
  const host = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
  const dbPath = '/var/local/www/db/moode-sqlite3.db';
  const remoteCmd = `sqlite3 -separator ${RADIO_DB_SEP} ${dbPath} ${shQuoteArg(String(sql || ''))}`;
  const { stdout } = await execFileP('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    `moode@${host}`,
    remoteCmd,
  ], {
    timeout: 12000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return String(stdout || '');
}

async function saveMoodeRadioLogo({ stationName, faviconUrl }) {
  const name = String(stationName || '').trim();
  const fav = toHttpsUrl(faviconUrl || '');
  if (!name || !fav) return { ok: false, reason: 'missing name or favicon' };

  const host = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
  const localTmpDir = path.resolve(process.cwd(), 'tmp');
  await fs.mkdir(localTmpDir, { recursive: true });

  const base = `rb_logo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const srcPath = path.join(localTmpDir, `${base}.img`);
  const jpgPath = path.join(localTmpDir, `${base}.jpg`);
  const remoteTmp = `/tmp/${base}.jpg`;
  const remoteFinal = `/var/local/www/imagesw/radio-logos/${name}.jpg`;
  const remoteThumb = `/var/local/www/imagesw/radio-logos/thumbs/${name}.jpg`;
  const remoteThumbSm = `/var/local/www/imagesw/radio-logos/thumbs/${name}_sm.jpg`;

  try {
    const r = await fetch(fav, { headers: { 'User-Agent': 'now-playing-radio-browser/1.0' } });
    if (!r.ok) return { ok: false, reason: `favicon http ${r.status}` };
    const ab = await r.arrayBuffer();
    await fs.writeFile(srcPath, Buffer.from(ab));

    await execFileP('ffmpeg', ['-y', '-i', srcPath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', '-q:v', '3', jpgPath], {
      timeout: 12000,
      maxBuffer: 8 * 1024 * 1024,
    });

    await execFileP('scp', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=6',
      jpgPath,
      `moode@${host}:${remoteTmp}`,
    ], {
      timeout: 12000,
      maxBuffer: 8 * 1024 * 1024,
    });

    await execFileP('ssh', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=6',
      `moode@${host}`,
      `sudo mkdir -p /var/local/www/imagesw/radio-logos /var/local/www/imagesw/radio-logos/thumbs && ` +
      `sudo mv ${shQuoteArg(remoteTmp)} ${shQuoteArg(remoteFinal)} && ` +
      `sudo cp -f ${shQuoteArg(remoteFinal)} ${shQuoteArg(remoteThumb)} && ` +
      `sudo cp -f ${shQuoteArg(remoteFinal)} ${shQuoteArg(remoteThumbSm)} && ` +
      `sudo chmod 644 ${shQuoteArg(remoteFinal)} ${shQuoteArg(remoteThumb)} ${shQuoteArg(remoteThumbSm)} && ` +
      `sudo chown root:root ${shQuoteArg(remoteFinal)} ${shQuoteArg(remoteThumb)} ${shQuoteArg(remoteThumbSm)}`,
    ], {
      timeout: 12000,
      maxBuffer: 8 * 1024 * 1024,
    });

    return { ok: true, path: remoteThumb };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  } finally {
    await fs.unlink(srcPath).catch(() => {});
    await fs.unlink(jpgPath).catch(() => {});
  }
}

export function registerConfigQueueWizardBasicRoutes(app, deps) {
  const { requireTrackKey } = deps;

  // --- queue wizard options (artists/genres) ---
  app.get('/config/queue-wizard/options', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const now = Date.now();
      if (optionsCache.payload && optionsCache.host === mpdHost && (now - optionsCache.ts) < OPTIONS_CACHE_TTL_MS) {
        return res.json(optionsCache.payload);
      }
      if (optionsCache.inflight && optionsCache.host === mpdHost) {
        const payload = await optionsCache.inflight;
        return res.json(payload);
      }

      optionsCache.host = mpdHost;
      optionsCache.inflight = (async () => {
        const fmt = '%artist%\t%albumartist%\t%album%\t%genre%';
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
          maxBuffer: 64 * 1024 * 1024,
        });

        const artists = new Set();
        const albumArtistByName = new Map();
        const genres = new Set();

        for (const ln of String(stdout || '').split(/\r?\n/)) {
          if (!ln) continue;
          const [artist = '', albumArtist = '', album = '', genreRaw = ''] = ln.split('\t');

          const a = String(artist || albumArtist || '').trim();
          if (a) artists.add(a);

          const alb = String(album || '').trim();
          if (alb && !albumArtistByName.has(alb)) albumArtistByName.set(alb, a);

          for (const g of String(genreRaw || '')
            .split(/[;,|/]/)
            .map((x) => String(x || '').trim())
            .filter(Boolean)) {
            genres.add(g);
          }
        }

        const albums = Array.from(albumArtistByName.entries())
          .map(([albumName, artistName]) => ({
            value: String(albumName || ''),
            label: artistName ? `${String(artistName)} — ${String(albumName)}` : String(albumName || ''),
            sortArtist: String(artistName || '').toLowerCase(),
            sortAlbum: String(albumName || '').toLowerCase(),
          }))
          .sort((a, b) => {
            const aa = a.sortArtist.localeCompare(b.sortArtist, undefined, { sensitivity: 'base' });
            if (aa !== 0) return aa;
            return a.sortAlbum.localeCompare(b.sortAlbum, undefined, { sensitivity: 'base' });
          })
          .map(({ value, label }) => ({ value, label }));

        return {
          ok: true,
          moodeHost: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
          genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
          artists: Array.from(artists).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
          albums,
        };
      })();

      const payload = await optionsCache.inflight;
      optionsCache.payload = payload;
      optionsCache.ts = Date.now();
      optionsCache.inflight = null;
      return res.json(payload);
    } catch (e) {
      optionsCache.inflight = null;
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/playlists', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const now = Date.now();
      if (playlistsCache.payload && playlistsCache.host === mpdHost && (now - playlistsCache.ts) < PLAYLISTS_CACHE_TTL_MS) {
        return res.json(playlistsCache.payload);
      }
      if (playlistsCache.inflight && playlistsCache.host === mpdHost) {
        const payload = await playlistsCache.inflight;
        return res.json(payload);
      }

      playlistsCache.host = mpdHost;
      playlistsCache.inflight = (async () => {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'lsplaylists']);
        const isPodcastName = (name) => /podcast/i.test(String(name || ''));
        const isPodcastFile = (f) => {
          const s = String(f || '').toLowerCase();
          return /\/podcasts?\//.test(s) || /\bpodcast\b/.test(s);
        };

        const names = String(stdout || '')
          .split(/\r?\n/)
          .map((x) => String(x || '').trim())
          .filter(Boolean);

        const kept = [];
        for (const name of names) {
          if (isPodcastName(name)) continue;
          let skip = false;
          try {
            const r = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'playlist', name], { maxBuffer: 8 * 1024 * 1024 });
            const files = String(r?.stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
            if (files.length && files.every((f) => isPodcastFile(f))) skip = true;
          } catch (_) {
            // if inspection fails, keep name rather than hiding unexpectedly
          }
          if (!skip) kept.push(name);
        }

        const playlists = kept.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        return { ok: true, count: playlists.length, playlists };
      })();

      const payload = await playlistsCache.inflight;
      playlistsCache.payload = payload;
      playlistsCache.ts = Date.now();
      playlistsCache.inflight = null;
      return res.json(payload);
    } catch (e) {
      playlistsCache.inflight = null;
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/load-playlist', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const playlist = String(req.body?.playlist || '').trim();
      const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
      const play = req.body?.play !== false;
      if (!playlist) return res.status(400).json({ ok: false, error: 'playlist is required' });
      if (!['replace', 'append'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be replace|append' });

      if (mode === 'replace') {
        await execFileP('mpc', ['-h', mpdHost, 'clear']);
      }
      await execFileP('mpc', ['-h', mpdHost, 'load', playlist]);
      if (play) {
        await execFileP('mpc', ['-h', mpdHost, 'play']);
      }
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'playlist']);
      const added = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean).length;
      return res.json({ ok: true, playlist, mode, play, added });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/delete-playlist', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const playlist = String(req.body?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'playlist is required' });

      await execFileP('mpc', ['-h', mpdHost, 'rm', playlist]);
      playlistsCache.ts = 0;
      playlistsCache.payload = null;
      return res.json({ ok: true, deleted: playlist });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/playlist-preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const playlist = String(req.query?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'playlist is required' });

      const fmt = '%artist%\t%title%\t%album%\t%file%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'playlist', playlist]);
      const tracks = String(stdout || '')
        .split(/\r?\n/)
        .map((ln) => String(ln || '').trim())
        .filter(Boolean)
        .map((ln) => {
          const [artist = '', title = '', album = '', file = ''] = ln.split('\t');
          const f = String(file || '').trim();
          const t = String(title || '').trim() || (f ? path.basename(f) : '');
          return {
            artist: String(artist || '').trim(),
            title: t,
            album: String(album || '').trim(),
            file: f,
          };
        })
        .filter((x) => x.file);

      return res.json({ ok: true, playlist, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/radio-browser/search', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const q = String(req.query?.q || '').trim();
      const country = String(req.query?.country || '').trim();
      const tag = String(req.query?.tag || '').trim();
      const tagNorm = tag.toLowerCase();
      const codec = String(req.query?.codec || '').trim();
      const hqOnly = ['1', 'true', 'yes'].includes(String(req.query?.hqOnly || '').toLowerCase());
      const excludeExisting = ['1', 'true', 'yes'].includes(String(req.query?.excludeExisting || '').toLowerCase());
      const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 30)));
      const apiLimit = Math.max(limit, Math.min(300, hqOnly ? limit * 4 : limit));

      const useTagFastPath = !q && !!tagNorm && !country && !codec;
      const u = useTagFastPath
        ? new URL(`https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tagNorm)}`)
        : new URL('https://de1.api.radio-browser.info/json/stations/search');
      if (q) u.searchParams.set('name', q);
      if (country) u.searchParams.set('countrycode', country);
      if (tagNorm && !useTagFastPath) u.searchParams.set('tag', tagNorm);
      if (codec) u.searchParams.set('codec', codec);
      u.searchParams.set('hidebroken', 'true');
      u.searchParams.set('order', 'votes');
      u.searchParams.set('reverse', 'true');
      u.searchParams.set('limit', String(apiLimit));

      const r = await fetch(u.toString(), { headers: { 'User-Agent': 'now-playing-radio-browser/1.0' } });
      const arr = await r.json().catch(() => ([]));
      if (!r.ok) return res.status(502).json({ ok: false, error: `radio-browser HTTP ${r.status}` });

      const isHq = (codecVal, bitrateVal) => {
        const fmt = String(codecVal || '').toUpperCase();
        const br = Number(bitrateVal || 0) || 0;
        const isLossless = /(FLAC|ALAC|WAV|AIFF|PCM)/i.test(fmt);
        if (isLossless) return true;
        if (/OPUS/i.test(fmt)) return br >= 128;
        if (/(MP3|AAC)/i.test(fmt)) return br >= 320;
        return br >= 320;
      };

      let stations = (Array.isArray(arr) ? arr : []).map((s) => ({
        id: String(s?.stationuuid || ''),
        name: String(s?.name || '').trim(),
        url: toHttpsUrl(String(s?.url_resolved || s?.url || '')),
        homepage: toHttpsUrl(String(s?.homepage || '')),
        favicon: toHttpsUrl(String(s?.favicon || '')),
        country: String(s?.countrycode || s?.country || '').trim(),
        tags: String(s?.tags || '').split(',').map((x) => String(x || '').trim()).filter(Boolean),
        codec: String(s?.codec || '').trim(),
        bitrate: Number(s?.bitrate || 0) || 0,
        votes: Number(s?.votes || 0) || 0,
        source: 'radiobrowser',
      }))
        .filter((s) => s.url && s.name)
        .filter((s) => !hqOnly || isHq(s.codec, s.bitrate));

      if (excludeExisting) {
        const rawExisting = await queryMoodeRadioDb('select station,name from cfg_radio;');
        const existingRows = String(rawExisting || '')
          .split(/\r?\n/)
          .map((ln) => String(ln || '').trim())
          .filter(Boolean)
          .map((ln) => {
            const [st = '', nm = ''] = ln.split(RADIO_DB_SEP);
            return {
              station: String(st || '').trim(),
              name: String(nm || '').trim().toLowerCase(),
              key: stationKey(st),
              host: stationHost(st),
            };
          })
          .filter((r) => r.station);

        const keySet = new Set(existingRows.map((r) => r.key).filter(Boolean));
        const hostNameSet = new Set(existingRows.map((r) => `${r.host}::${r.name}`).filter((x) => !x.startsWith('::')));

        stations = stations.filter((s) => {
          const sKey = stationKey(s.url);
          if (sKey && keySet.has(sKey)) return false;
          const sHost = stationHost(s.url);
          const sName = String(s.name || '').trim().toLowerCase();
          if (sHost && sName && hostNameSet.has(`${sHost}::${sName}`)) return false;
          return true;
        });
      }

      stations = stations.slice(0, limit);
      return res.json({ ok: true, count: stations.length, stations });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/radio-browser/probe', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const rawUrl = toHttpsUrl(req.body?.url || req.body?.file || '');
      if (!rawUrl) return res.status(400).json({ ok: false, error: 'valid url is required' });
      const requestedName = String(req.body?.name || '').trim();

      const iheartResolved = await resolveIheartLivePage(rawUrl, requestedName).catch((err) => ({ error: err }));
      if (iheartResolved?.error) {
        return res.status(400).json({ ok: false, error: iheartResolved.error?.message || 'Could not resolve iHeart URL' });
      }

      let station = iheartResolved?.resolved
        ? iheartResolved.station
        : {
            name: requestedName || guessStationNameFromUrl(rawUrl) || 'Custom Station',
            url: rawUrl,
            homepage: toHttpsUrl(req.body?.homepage || ''),
            favicon: toHttpsUrl(req.body?.favicon || ''),
          };

      // If user pasted a direct iHeart revma URL, enrich name/logo via station id.
      if (!iheartResolved?.resolved) {
        const sid = parseIheartRevmaStationId(rawUrl);
        if (sid > 0) {
          const meta = await fetchIheartStationById(sid).catch(() => null);
          if (meta) {
            const resolvedName = String(meta?.name || '').trim();
            const keepUserName = requestedName && !isGenericStationName(requestedName);
            station = {
              name: keepUserName ? requestedName : (resolvedName || station.name),
              url: station.url,
              homepage: toHttpsUrl(meta?.website || station.homepage || ''),
              favicon: toHttpsUrl(meta?.logo || meta?.newlogo || station.favicon || ''),
            };
          }
        }
      }

      const homepage = toHttpsUrl(station?.homepage || '');
      const guessedFavicon = toHttpsUrl(station?.favicon || '') || guessFaviconFromUrl(station?.url || '', homepage);
      return res.json({
        ok: true,
        station: {
          name: String(station?.name || '').trim() || 'Custom Station',
          url: toHttpsUrl(station?.url || ''),
          homepage,
          favicon: guessedFavicon,
        },
        adapted: !!iheartResolved?.resolved,
        adaptedFrom: iheartResolved?.originalUrl || '',
        adaptedTo: String(station?.url || ''),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/radio-browser/preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const url = toHttpsUrl(req.body?.url || req.body?.file || '');
      if (!url) return res.status(400).json({ ok: false, error: 'valid url is required' });
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      await execFileP('mpc', ['-h', mpdHost, 'clear']);
      await execFileP('mpc', ['-h', mpdHost, 'add', url]);
      await execFileP('mpc', ['-h', mpdHost, 'play']);
      return res.json({ ok: true, url, playing: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/radio-browser/add', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const station = toHttpsUrl(req.body?.url || req.body?.station || '');
      const name = String(req.body?.name || '').trim();
      if (!station || !name) return res.status(400).json({ ok: false, error: 'name and valid url required' });
      const genre = String((Array.isArray(req.body?.tags) ? req.body.tags.join(', ') : req.body?.genre) || '').trim();
      const bitrate = String(req.body?.bitrate || '').trim();
      const format = String(req.body?.codec || req.body?.format || '').trim();
      const favorite = !!req.body?.favorite;
      const homepage = toHttpsUrl(req.body?.homepage || '');
      const favicon = toHttpsUrl(req.body?.favicon || '') || guessFaviconFromUrl(station, homepage);

      const check = await queryMoodeRadioDb(`select rowid,station,name,type from cfg_radio where station=${shQuoteArg(station)} limit 1;`);
      let row = String(check || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || '';

      if (!row) {
        const all = await queryMoodeRadioDb('select rowid,station,name,type from cfg_radio;');
        const wantedKey = stationKey(station);
        const wantedHost = stationHost(station);
        const rows = String(all || '').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).map((ln) => {
          const [rowid='', st='', nm='', type=''] = ln.split(RADIO_DB_SEP);
          return { rowid: Number(rowid)||0, station: String(st||''), name: String(nm||''), type: String(type||'') };
        }).filter((r) => r.rowid > 0 && r.station);

        const exactKey = rows.find((r) => stationKey(r.station) === wantedKey);
        let chosen = exactKey || null;
        if (!chosen && wantedHost) {
          const byHost = rows.filter((r) => stationHost(r.station) === wantedHost);
          if (byHost.length === 1) chosen = byHost[0];
        }
        if (chosen) row = `${chosen.rowid}${RADIO_DB_SEP}${chosen.station}${RADIO_DB_SEP}${chosen.name}${RADIO_DB_SEP}${chosen.type}`;
      }

      if (row) {
        const [rowid='', foundStation='', foundName='', oldType=''] = row.split(RADIO_DB_SEP);
        const rowNum = Number(rowid) || 0;

        // Keep existing entries fresh: if caller has a better resolved name, update it.
        const incomingName = String(name || '').trim();
        const existingName = String(foundName || '').trim();
        if (rowNum > 0 && incomingName && incomingName.toLowerCase() !== existingName.toLowerCase()) {
          await queryMoodeRadioDb(`update cfg_radio set name=${shQuoteArg(incomingName)} where rowid=${rowNum};`);
        }

        if (favorite && String(oldType || '').toLowerCase() !== 'f') {
          await queryMoodeRadioDb(`update cfg_radio set type='f' where rowid=${rowNum};`);
        }

        const effectiveName = incomingName || existingName || name;
        // Save logo under both the existing and effective names to survive rename/caching gaps.
        const logoTargets = Array.from(new Set([String(effectiveName || '').trim(), String(existingName || '').trim()].filter(Boolean)));
        let logoOk = false;
        let logoInfo = '';
        for (const nm of logoTargets) {
          const lg = await saveMoodeRadioLogo({ stationName: nm, faviconUrl: favicon });
          logoOk = logoOk || !!lg?.ok;
          if (!logoInfo) logoInfo = String(lg?.reason || lg?.path || '');
        }
        if (rowNum > 0 && logoOk) {
          await queryMoodeRadioDb(`update cfg_radio set logo='local' where rowid=${rowNum};`);
        }
        return res.json({ ok: true, added: false, alreadyExists: true, station: String(foundStation||station), stationName: effectiveName, favorite: favorite || String(oldType||'').toLowerCase()==='f', logoSaved: logoOk, logoInfo });
      }

      const type = favorite ? 'f' : 'r';
      await queryMoodeRadioDb(`insert into cfg_radio(station,name,genre,bitrate,format,type) values(${shQuoteArg(station)},${shQuoteArg(name)},${shQuoteArg(genre)},${shQuoteArg(bitrate)},${shQuoteArg(format)},${shQuoteArg(type)});`);
      const logoTargets = Array.from(new Set([
        String(name || '').trim(),
        String(name || '').replace(/\s+/g, ' ').trim(),
      ].filter(Boolean)));
      let logoOk = false;
      let logoInfo = '';
      for (const nm of logoTargets) {
        const lg = await saveMoodeRadioLogo({ stationName: nm, faviconUrl: favicon });
        logoOk = logoOk || !!lg?.ok;
        if (!logoInfo) logoInfo = String(lg?.reason || lg?.path || '');
      }
      if (logoOk) {
        await queryMoodeRadioDb(`update cfg_radio set logo='local' where station=${shQuoteArg(station)};`);
      }
      return res.json({ ok: true, added: true, station, name, favorite: type === 'f', logoSaved: logoOk, logoInfo });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/radio-options', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const raw = await queryMoodeRadioDb('select genre from cfg_radio order by genre;');
      const genresByKey = new Map();
      for (const ln of String(raw || '').split(/\r?\n/)) {
        const gRaw = String(ln || '').trim();
        if (!gRaw) continue;
        for (const g of gRaw.split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean)) {
          const key = String(g || '').toLowerCase();
          if (!key) continue;
          if (!genresByKey.has(key)) genresByKey.set(key, normalizeGenreLabel(g));
        }
      }
      return res.json({
        ok: true,
        genres: Array.from(genresByKey.values()).sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:'base'})),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/radio-favorites', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const out = await queryMoodeRadioDb("select station,name,genre,bitrate,format,type from cfg_radio where type='f' order by name;");
      const favorites = String(out || '').split(/\r?\n/).map((ln)=>String(ln||'').trim()).filter(Boolean).map((ln)=>{
        const [station='', name='', genre='', bitrate='', format='', type=''] = ln.split(RADIO_DB_SEP);
        return {
          file: String(station || '').trim(),
          stationName: String(name || '').trim(),
          genre: String(genre || '').trim(),
          bitrate: String(bitrate || '').trim(),
          format: String(format || '').trim(),
          radioType: String(type || '').trim(),
        };
      }).filter((x)=>x.file);
      return res.json({ ok: true, count: favorites.length, favorites });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/radio-delete', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const station = String(req.body?.station || req.body?.file || '').trim();
      if (!station) return res.status(400).json({ ok: false, error: 'station is required' });

      let out = await queryMoodeRadioDb(`select rowid,station,name from cfg_radio where station=${shQuoteArg(station)} limit 1;`);
      let row = String(out || '').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean)[0] || '';

      if (!row) {
        out = await queryMoodeRadioDb('select rowid,station,name from cfg_radio;');
        const wantedKey = stationKey(station);
        const wantedHost = stationHost(station);
        const rows = String(out || '').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).map((ln) => {
          const [rowid='', st='', name=''] = ln.split(RADIO_DB_SEP);
          return { rowid: Number(rowid)||0, station: String(st||''), name: String(name||'') };
        }).filter((r) => r.rowid > 0 && r.station);
        const exactKey = rows.find((r) => stationKey(r.station) === wantedKey);
        let chosen = exactKey || null;
        if (!chosen && wantedHost) {
          const byHost = rows.filter((r) => stationHost(r.station) === wantedHost);
          if (byHost.length === 1) chosen = byHost[0];
        }
        if (chosen) row = `${chosen.rowid}${RADIO_DB_SEP}${chosen.station}${RADIO_DB_SEP}${chosen.name}`;
      }

      if (!row) return res.status(404).json({ ok: false, error: 'station not found in cfg_radio' });
      const [rowid='', foundStation='', name=''] = row.split(RADIO_DB_SEP);
      await queryMoodeRadioDb(`delete from cfg_radio where rowid=${Number(rowid)||0};`);
      return res.json({ ok: true, deleted: true, station: String(foundStation||station), stationName: String(name||'').trim() });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/radio-favorite', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const station = String(req.body?.station || req.body?.file || '').trim();
      const favorite = req.body?.favorite !== false;
      if (!station) return res.status(400).json({ ok: false, error: 'station is required' });

      let row = '';
      let out = await queryMoodeRadioDb(`select rowid,station,name,type from cfg_radio where station=${shQuoteArg(station)} limit 1;`);
      row = String(out || '').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean)[0] || '';

      if (!row) {
        out = await queryMoodeRadioDb('select rowid,station,name,type from cfg_radio;');
        const wantedKey = stationKey(station);
        const wantedHost = stationHost(station);
        const rows = String(out || '').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).map((ln) => {
          const [rowid='', st='', name='', type=''] = ln.split(RADIO_DB_SEP);
          return { rowid: Number(rowid)||0, station: String(st||''), name: String(name||''), type: String(type||'') };
        }).filter((r) => r.rowid > 0 && r.station);

        const exactKey = rows.find((r) => stationKey(r.station) === wantedKey);
        let chosen = exactKey || null;
        if (!chosen && wantedHost) {
          const byHost = rows.filter((r) => stationHost(r.station) === wantedHost);
          if (byHost.length === 1) chosen = byHost[0];
        }
        if (chosen) row = `${chosen.rowid}${RADIO_DB_SEP}${chosen.station}${RADIO_DB_SEP}${chosen.name}${RADIO_DB_SEP}${chosen.type}`;
      }

      if (!row) return res.status(404).json({ ok: false, error: 'station not found in cfg_radio' });
      const [rowid='', foundStation='', name='', oldType=''] = row.split(RADIO_DB_SEP);
      const oldT = String(oldType || '').trim().toLowerCase();
      let nextType = oldT || 'r';
      if (favorite) nextType = 'f';
      else nextType = (oldT === 'f') ? 'r' : (oldT || 'r');
      await queryMoodeRadioDb(`update cfg_radio set type=${shQuoteArg(nextType)} where rowid=${Number(rowid)||0};`);
      return res.json({ ok: true, station: String(foundStation||station), stationName: String(name||'').trim(), favorite: nextType === 'f', oldType: oldT, newType: nextType });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/radio-preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const genres = Array.isArray(req.body?.genres) ? req.body.genres.map((x)=>String(x||'').trim()).filter(Boolean) : [];
      const favoritesOnly = !!req.body?.favoritesOnly;
      const hqOnly = !!req.body?.hqOnly;
      const maxStations = Math.max(1, Math.min(2000, Number(req.body?.maxStations || 500)));

      const where = [];
      if (favoritesOnly) where.push("type='f'");
      if (hqOnly) {
        // Keep "High quality" strict and codec-aware:
        // - Lossless codecs always qualify
        // - Opus qualifies at >=128 kbps
        // - MP3/AAC (and unknown fallback) require >=320 kbps
        const br = "cast(replace(replace(lower(bitrate),'kbps',''),' ','') as integer)";
        const fmt = "upper(coalesce(format,''))";
        where.push(`(
          ${fmt} like '%FLAC%' OR ${fmt} like '%ALAC%' OR ${fmt} like '%WAV%' OR ${fmt} like '%AIFF%' OR ${fmt} like '%PCM%'
          OR (${fmt} like '%OPUS%' AND ${br} >= 128)
          OR (((${fmt} like '%MP3%') OR (${fmt} like '%AAC%') OR ${fmt} = '') AND ${br} >= 320)
        )`);
      }
      if (genres.length) {
        const likes = genres.map((g) => `genre like ${sqlQuoteLike(g)}`).join(' OR ');
        where.push(`(${likes})`);
      }
      const favoriteStations = Array.isArray(req.body?.favoriteStations)
        ? req.body.favoriteStations.map((x)=>String(x||'').trim()).filter(Boolean)
        : [];
      if (favoriteStations.length) {
        const ors = favoriteStations.map((u) => `station=${shQuoteArg(u)}`).join(' OR ');
        where.push(`(${ors})`);
      }
      const sql = `select station,name,genre,bitrate,format,type from cfg_radio ${where.length ? 'where ' + where.join(' AND ') : ''} order by name limit ${maxStations};`;
      const out = await queryMoodeRadioDb(sql);
      const tracks = String(out || '').split(/\r?\n/).map((ln)=>String(ln||'').trim()).filter(Boolean).map((ln)=>{
        const [station='', name='', genre='', bitrate='', format='', type=''] = ln.split(RADIO_DB_SEP);
        const stationName = String(name || '').trim() || 'Radio Station';
        const file = String(station || '').trim();
        return {
          artist: stationName,
          title: '',
          album: stationName,
          stationName,
          genre: String(genre || '').trim(),
          bitrate: String(bitrate || '').trim(),
          format: String(format || '').trim(),
          radioType: String(type || '').trim(),
          isFavoriteStation: String(type || '').trim().toLowerCase() === 'f',
          file,
          isStream: true,
        };
      }).filter((x)=>x.file);

      return res.json({ ok: true, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/radio-presets', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const presets = await readRadioPresetsFile();
      return res.json({ ok: true, presets });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/radio-presets', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const name = String(req.body?.name || '').trim();
      const stationsIn = Array.isArray(req.body?.stations) ? req.body.stations : [];
      if (!name) return res.status(400).json({ ok: false, error: 'name is required' });

      const stations = stationsIn
        .map((s) => {
          if (s && typeof s === 'object') {
            const file = String(s.file || '').trim();
            const stationName = String(s.stationName || s.artist || '').trim();
            if (!file) return null;
            return { file, stationName };
          }
          const file = String(s || '').trim();
          if (!file) return null;
          return { file, stationName: '' };
        })
        .filter(Boolean);

      if (!stations.length) return res.status(400).json({ ok: false, error: 'stations are required' });

      let presets = await readRadioPresetsFile();
      if (!Array.isArray(presets)) presets = [];

      const entry = {
        id: 
          'rp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name,
        createdAt: Date.now(),
        stations,
      };

      presets.unshift(entry);
      if (presets.length > 60) presets = presets.slice(0, 60);
      await writeRadioPresetsFile(presets);

      return res.json({ ok: true, preset: entry, count: presets.length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
