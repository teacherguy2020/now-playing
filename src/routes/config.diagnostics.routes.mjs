import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function cleanIheartQueueMeta(artistRaw, titleRaw) {
  const artist = String(artistRaw || '').trim();
  const title = String(titleRaw || '').trim();
  const combined = `${artist} ${title}`.trim();
  if (!combined) return { artist, title, artUrl: '' };

  const blobSource = [artist, title].find((s) => /\bTPID="\d+"/i.test(String(s || '')) || /\btitle="[^"]+"/i.test(String(s || '')) || /\btext="[^"]+"/i.test(String(s || ''))) || '';
  if (!blobSource) return { artist, title, artUrl: '' };

  const s = String(blobSource || '').trim();
  const t1 = s.match(/(?:^|[\s,])text\s*=\s*"([^"]+)"/i);
  const t2 = s.match(/(?:^|[\s,])title\s*=\s*"([^"]+)"/i);
  const a1 = s.match(/(?:^|[\s,])artist\s*=\s*"([^"]+)"/i);
  const p1 = s.match(/^(.*?)\s*-\s*text\s*=\s*"/i);
  const art1 = s.match(/\bamgArtworkURL\s*=\s*"([^"]+)"/i);

  const cleanArtist = String((a1 && a1[1]) || (p1 && p1[1]) || '').trim() || artist;
  const cleanTitle = String((t1 && t1[1]) || (t2 && t2[1]) || '').trim() || title;
  const artUrl = String((art1 && art1[1]) || '').trim();

  return { artist: cleanArtist, title: cleanTitle, artUrl };
}

function isStreamUrl(file) {
  return /:\/\//.test(String(file || ''));
}

function stationLogoUrlFromAlbum(album) {
  const a = String(album || '').trim();
  if (!a) return '';
  return `/art/radio-logo.jpg?name=${encodeURIComponent(a)}`;
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

let radioCatalogCacheTs = 0;
let radioMetaByStation = new Map();

async function loadRadioQueueMap() {
  try {
    const p = new URL('../../data/radio-queue-map.json', import.meta.url);
    const raw = await fs.readFile(p, 'utf8');
    const j = JSON.parse(raw || '{}');
    const map = new Map();
    for (const e of (Array.isArray(j.entries) ? j.entries : [])) {
      const f = String(e?.file || '').trim();
      const stationName = String(e?.stationName || '').trim();
      const genre = String(e?.genre || '').trim();
      if (!f) continue;
      map.set(f, { stationName, genre });
    }
    return map;
  } catch {
    return new Map();
  }
}

function stationHost(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try { return String(new URL(s).hostname || '').toLowerCase(); } catch { return ''; }
}

async function loadRadioCatalogMap() {
  const now = Date.now();
  if (radioMetaByStation.size && (now - radioCatalogCacheTs) < (5 * 60 * 1000)) return radioMetaByStation;
  const host = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
  const user = String(MOODE_SSH_USER || 'moode');
  const sql = "select station,name,genre,type from cfg_radio;";
  const { stdout } = await execFileP('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', `${user}@${host}`, 'sqlite3', '-separator', '\t', '/var/local/www/db/moode-sqlite3.db', sql], { timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
  const map = new Map();
  const hostCounts = new Map();
  const hostName = new Map();
  for (const ln of String(stdout || '').split(/\r?\n/)) {
    if (!ln) continue;
    const [station = '', name = '', genre = '', type = ''] = ln.split('\t');
    const s = String(station || '').trim();
    const n = String(name || '').trim();
    const g = String(genre || '').trim();
    const t = String(type || '').trim().toLowerCase();
    if (s && n) {
      const meta = { stationName: n, genre: g, isFavorite: t === 'f' };
      map.set(s, meta);
      const k = stationKey(s);
      if (k) map.set(k, meta);
      const h = stationHost(s);
      if (h) {
        hostCounts.set(h, Number(hostCounts.get(h) || 0) + 1);
        if (!hostName.has(h)) hostName.set(h, meta);
      }
    }
  }
  for (const [h, c] of hostCounts.entries()) {
    if (c === 1) map.set(`host:${h}`, hostName.get(h) || { stationName: '', genre: '', isFavorite: false });
  }
  radioMetaByStation = map;
  radioCatalogCacheTs = now;
  return radioMetaByStation;
}

function splitArtistDashTitle(line) {
  const s = String(line || '').trim();
  if (!s) return null;
  const m = s.match(/^(.+?)\s+[\-–—]\s+(.+)$/);
  if (!m) return null;
  return { artist: String(m[1] || '').trim(), title: String(m[2] || '').trim() };
}

export function registerConfigDiagnosticsRoutes(app, deps) {
  const { requireTrackKey, getRatingForFile, setRatingForFile } = deps;
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || `${process.cwd()}/config/now-playing.config.json`;

  async function isRatingsEnabled() {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return Boolean(cfg?.features?.ratings ?? true);
    } catch {
      return true;
    }
  }

  const endpointCatalog = [
    { group: 'Now Playing', method: 'GET', path: '/now-playing' },
    { group: 'Now Playing', method: 'GET', path: '/next-up' },
    { group: 'Now Playing', method: 'GET', path: '/track' },

    { group: 'Diagnostics', method: 'GET', path: '/config/diagnostics/queue' },
    { group: 'Diagnostics', method: 'POST', path: '/config/diagnostics/playback', body: { action: 'play' } },

    { group: 'Runtime/Admin', method: 'GET', path: '/config/runtime' },
    { group: 'Runtime/Admin', method: 'POST', path: '/config/runtime/check-env', body: { mpdHost: '', mpdPort: 6600, sshHost: '', sshUser: 'moode', paths: {} } },
    { group: 'Runtime/Admin', method: 'POST', path: '/config/runtime/resolve-host', body: { host: '' } },
    { group: 'Runtime/Admin', method: 'POST', path: '/config/restart-api', body: {} },
    { group: 'Runtime/Admin', method: 'POST', path: '/config/restart-services', body: {} },

    { group: 'Queue Wizard', method: 'GET', path: '/config/queue-wizard/options' },
    { group: 'Queue Wizard', method: 'GET', path: '/config/queue-wizard/playlists' },
    { group: 'Queue Wizard', method: 'POST', path: '/config/queue-wizard/preview', body: { genres: [], artists: [], albums: [], excludeGenres: [], minRating: 0, maxTracks: 25 } },
    { group: 'Queue Wizard', method: 'POST', path: '/config/queue-wizard/apply', body: { mode: 'append', keepNowPlaying: false, tracks: [''], shuffle: false } },
    { group: 'Queue Wizard', method: 'POST', path: '/config/queue-wizard/vibe-start', body: { targetQueue: 50, minRating: 0 } },

    { group: 'Library Health', method: 'GET', path: '/config/library-health' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/missing-artwork' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-tracks' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-genre' },
    { group: 'Library Health', method: 'POST', path: '/config/library-health/album-genre', body: { folder: '', genre: '' } },
    { group: 'Library Health', method: 'POST', path: '/config/library-health/rating-batch', body: { files: [], rating: 3 } },

    { group: 'Ratings Stickers', method: 'GET', path: '/config/ratings/sticker-status' },
    { group: 'Ratings Stickers', method: 'GET', path: '/config/ratings/sticker-backups' },
    { group: 'Ratings Stickers', method: 'POST', path: '/config/ratings/sticker-backup', body: {} },

    { group: 'Art', method: 'GET', path: '/art/current_640.jpg' },
    { group: 'Art', method: 'GET', path: '/art/current_bg_640_blur.jpg' },
    { group: 'Art', method: 'GET', path: '/art/track_640.jpg' },
  ];

  app.get('/config/diagnostics/endpoints', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return res.json({ ok: true, count: endpointCatalog.length, endpoints: endpointCatalog });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/diagnostics/playback', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const action = String(req.body?.action || '').trim().toLowerCase();
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const map = { play: 'play', pause: 'pause', toggle: 'toggle', next: 'next', prev: 'previous', previous: 'previous', stop: 'stop' };

      if (action === 'shuffle') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /random:\s*on/i.test(String(beforeStatus || ''));
        const setTo = wasOn ? 'off' : 'on';
        await execFileP('mpc', ['-h', mpdHost, 'random', setTo]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        const repeatOn = /repeat:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, randomOn, repeatOn, status: String(afterStatus || '') });
      }

      if (action === 'repeat') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /repeat:\s*on/i.test(String(beforeStatus || ''));
        const setTo = wasOn ? 'off' : 'on';
        await execFileP('mpc', ['-h', mpdHost, 'repeat', setTo]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        const repeatOn = /repeat:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, randomOn, repeatOn, status: String(afterStatus || '') });
      }

      if (action === 'remove') {
        const posRaw = Number(req.body?.position);
        const pos = Number.isFinite(posRaw) ? Math.max(1, Math.floor(posRaw)) : 0;
        if (!pos) return res.status(400).json({ ok: false, error: 'position is required for remove' });
        await execFileP('mpc', ['-h', mpdHost, 'del', String(pos)]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, removedPosition: pos, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'playpos') {
        const posRaw = Number(req.body?.position);
        const pos = Number.isFinite(posRaw) ? Math.max(1, Math.floor(posRaw)) : 0;
        if (!pos) return res.status(400).json({ ok: false, error: 'position is required for playpos' });
        await execFileP('mpc', ['-h', mpdHost, 'play', String(pos)]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, playedPosition: pos, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'move') {
        const fromRaw = Number(req.body?.fromPosition);
        const toRaw = Number(req.body?.toPosition);
        const fromPosition = Number.isFinite(fromRaw) ? Math.max(1, Math.floor(fromRaw)) : 0;
        const toPosition = Number.isFinite(toRaw) ? Math.max(1, Math.floor(toRaw)) : 0;
        if (!fromPosition || !toPosition) return res.status(400).json({ ok: false, error: 'fromPosition and toPosition are required for move' });
        await execFileP('mpc', ['-h', mpdHost, 'move', String(fromPosition), String(toPosition)]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, fromPosition, toPosition, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'rate') {
        const ratingsEnabled = await isRatingsEnabled();
        if (!ratingsEnabled) return res.status(403).json({ ok: false, error: 'Ratings feature is disabled' });
        if (typeof setRatingForFile !== 'function') return res.status(501).json({ ok: false, error: 'rating dependency not wired' });
        const file = String(req.body?.file || '').trim();
        const ratingRaw = Number(req.body?.rating);
        const rating = Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, Math.round(ratingRaw))) : -1;
        if (!file) return res.status(400).json({ ok: false, error: 'file is required for rate' });
        if (rating < 0) return res.status(400).json({ ok: false, error: 'rating must be 0..5' });
        await setRatingForFile(file, rating);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, file, rating, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'seekrel') {
        const secRaw = Number(req.body?.seconds);
        const seconds = Number.isFinite(secRaw) ? Math.max(-600, Math.min(600, Math.round(secRaw))) : 0;
        if (!seconds) return res.status(400).json({ ok: false, error: 'seconds is required for seekrel' });

        const delta = seconds > 0 ? `+${seconds}` : String(seconds);
        try {
          await execFileP('mpc', ['-h', mpdHost, 'seekcur', delta]);
        } catch (e) {
          // Fallback for older mpc versions without seekcur.
          const msg = String(e?.message || '');
          if (!/unknown command\s+"seekcur"/i.test(msg)) throw e;

          // Older mpc supports relative seek via `seek [+|-]HH:MM:SS|seconds|%`.
          await execFileP('mpc', ['-h', mpdHost, 'seek', delta]);
        }

        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, seconds, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'seekpct') {
        const pctRaw = Number(req.body?.percent);
        const percent = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.round(pctRaw))) : -1;
        if (percent < 0) return res.status(400).json({ ok: false, error: 'percent (0..100) is required for seekpct' });

        await execFileP('mpc', ['-h', mpdHost, 'seek', `${percent}%`]);

        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, percent, randomOn, status: String(afterStatus || '') });
      }

      const cmd = map[action];
      if (!cmd) return res.status(400).json({ ok: false, error: 'Invalid action' });
      await execFileP('mpc', ['-h', mpdHost, cmd]);
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'status']);
      const randomOn = /random:\s*on/i.test(String(stdout || ''));
      return res.json({ ok: true, action, randomOn, status: String(stdout || '') });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/art/radio-logo.jpg', async (req, res) => {
    try {
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const name = String(req.query?.name || '').trim();
      if (!name) return res.status(400).end('missing name');
      const u = `http://${mpdHost}/imagesw/radio-logos/${encodeURIComponent(name)}.jpg`;
      const r = await fetch(u, { redirect: 'follow' });
      if (!r.ok) return res.status(404).end('not found');
      const ab = await r.arrayBuffer();
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.end(Buffer.from(ab));
    } catch {
      return res.status(404).end('not found');
    }
  });

  app.get('/config/diagnostics/queue', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const ratingsEnabled = await isRatingsEnabled();
      const [{ stdout: qOut }, { stdout: sOut }, { stdout: cOut }] = await Promise.all([
        execFileP('mpc', ['-h', mpdHost, '-f', '%position%\t%artist%\t%title%\t%album%\t%file%\t%name%', 'playlist']),
        execFileP('mpc', ['-h', mpdHost, 'status']),
        execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']),
      ]);
      const st = String(sOut || '');
      const m = st.match(/#(\d+)\/(\d+)/);
      const headPos = m ? Number(m[1] || 0) : -1;
      const randomOn = /random:\s*on/i.test(st);
      const repeatOn = /repeat:\s*on/i.test(st);
      const playbackState = /\[playing\]/i.test(st)
        ? 'playing'
        : (/\[paused\]/i.test(st) ? 'paused' : 'stopped');

      const currentLine = String(cOut || '').split(/\r?\n/).map((ln) => ln.trim()).find(Boolean) || '';
      const [curArtistRaw = '', curTitleRaw = ''] = currentLine.split('\t');
      const curClean = cleanIheartQueueMeta(curArtistRaw, curTitleRaw);
      const curSplit = splitArtistDashTitle(curClean.title);
      const currentArtist = String(curClean.artist || (curSplit?.artist || '')).trim();
      const currentTitle = String(curSplit?.title || curClean.title || '').trim();

      let stationMap = new Map();
      let recentRadioMap = new Map();
      try { stationMap = await loadRadioCatalogMap(); } catch {}
      try { recentRadioMap = await loadRadioQueueMap(); } catch {}

      const lines = String(qOut || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean);
      const items = [];
      for (const ln of lines) {
        const [position = '', artist = '', title = '', album = '', file = '', name = ''] = ln.split('\t');
        const pos = Number(position || 0);
        const f = String(file || '').trim();
        let rating = 0;
        if (ratingsEnabled && f && typeof getRatingForFile === 'function') {
          try { rating = Number(await getRatingForFile(f)) || 0; } catch {}
        }
        const cleaned = cleanIheartQueueMeta(artist, title);
        let artistTxt = String(cleaned.artist || '').trim();
        let titleTxt = String(cleaned.title || '').trim();
        const albumTxt = String(album || '').trim();
        const queueMeta = recentRadioMap.get(f) || {};
        const catMetaDirect = stationMap.get(f) || {};
        const catMetaKey = stationMap.get(stationKey(f)) || {};
        const catMetaHost = stationMap.get(`host:${stationHost(f)}`) || {};

        const stationNameTxt = String(name || '').trim()
          || String(queueMeta.stationName || '').trim()
          || String(catMetaDirect.stationName || '').trim()
          || String(catMetaKey.stationName || '').trim()
          || String(catMetaHost.stationName || '').trim();
        const stationGenreTxt = String(queueMeta.genre || '').trim()
          || String(catMetaDirect.genre || '').trim()
          || String(catMetaKey.genre || '').trim()
          || String(catMetaHost.genre || '').trim();
        const stationFavorite = !!(queueMeta.isFavorite || catMetaDirect.isFavorite || catMetaKey.isFavorite || catMetaHost.isFavorite);

        const isStream = isStreamUrl(f);
        if (isStream) {
          const split = splitArtistDashTitle(titleTxt);
          if (split) {
            if (!artistTxt) artistTxt = String(split.artist || '').trim();
            titleTxt = String(split.title || titleTxt).trim();
          }
          if (pos === headPos) {
            if (!artistTxt && currentArtist) artistTxt = currentArtist;
            if (!titleTxt && currentTitle) titleTxt = currentTitle;
          }
        }
        const podcastBlob = `${f}\n${artistTxt}\n${titleTxt}\n${albumTxt}`.toLowerCase();
        const isPodcast = /\bpodcast\b/.test(podcastBlob) || /\/podcasts?\//.test(podcastBlob);
        const streamLogoName = stationNameTxt || albumTxt;
        const stationLogo = stationLogoUrlFromAlbum(streamLogoName);
        const streamArtFallback = String(cleaned.artUrl || '').trim();
        const isHead = Number.isFinite(pos) && pos === headPos;
        const thumbUrl = isStream
          ? (stationLogo || streamArtFallback || (isHead ? '/art/current.jpg' : ''))
          : (f ? `/art/track_640.jpg?file=${encodeURIComponent(f)}` : '');
        items.push({
          position: pos,
          isHead,
          isStream,
          artist: artistTxt,
          title: titleTxt,
          album: albumTxt,
          stationName: stationNameTxt,
          stationGenre: stationGenreTxt,
          isFavoriteStation: stationFavorite,
          file: f,
          isPodcast,
          rating: Math.max(0, Math.min(5, Math.round(Number(rating) || 0))),
          thumbUrl,
        });
      }
      return res.json({ ok: true, count: items.length, headPos, randomOn, repeatOn, playbackState, ratingsEnabled, items });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
