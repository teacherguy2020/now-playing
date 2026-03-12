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

const radioLogoCacheDirUrl = new URL('../../var/radio-logo-cache/', import.meta.url);

function safeLogoKey(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

async function readCachedRadioLogo(name) {
  const k = safeLogoKey(name);
  if (!k) return null;
  const p = new URL(`${k}.jpg`, radioLogoCacheDirUrl);
  try {
    const buf = await fs.readFile(p);
    return buf;
  } catch {
    return null;
  }
}

async function writeCachedRadioLogo(name, buf) {
  const k = safeLogoKey(name);
  if (!k || !buf) return;
  const p = new URL(`${k}.jpg`, radioLogoCacheDirUrl);
  try {
    await fs.mkdir(radioLogoCacheDirUrl, { recursive: true });
    await fs.writeFile(p, buf);
  } catch {}
}

function stationKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const hostPort = `${u.hostname}${u.port ? `:${u.port}` : ''}`;
    return `${hostPort}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
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
      const meta = { stationName, genre };
      map.set(f, meta);
      const k = stationKey(f);
      const h = stationHost(f);
      if (k) map.set(`key:${k}`, meta);
      if (h) map.set(`host:${h}`, meta);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadRadioLogoAliases() {
  try {
    const p = new URL('../../config/radio-logo-aliases.json', import.meta.url);
    const raw = await fs.readFile(p, 'utf8');
    const j = JSON.parse(raw || '{}');
    return (j && typeof j === 'object') ? j : {};
  } catch {
    return {};
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
  const { requireTrackKey, getRatingForFile, setRatingForFile, getAlexaWasPlaying, getYoutubeNowPlayingHint, getYoutubeQueueHint } = deps;
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || `${process.cwd()}/config/now-playing.config.json`;

  function pos0FromAlexaToken(tokenRaw) {
    const s = String(tokenRaw || '').trim();
    if (!s || !s.startsWith('moode-track:')) return null;
    try {
      const b64 = s.slice('moode-track:'.length);
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const json = Buffer.from((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const obj = JSON.parse(json || '{}');
      const n = Number(obj?.pos0);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    } catch {
      return null;
    }
  }

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
    { group: 'Diagnostics', method: 'POST', path: '/config/diagnostics/queue/save-playlist', body: { playlistName: 'My Queue', generateCollage: true } },
    { group: 'Diagnostics', method: 'GET', path: '/config/diagnostics/album-tracks', query: { album: '', artist: '' } },
    { group: 'Diagnostics', method: 'GET', path: '/config/diagnostics/artist-albums', query: { artist: '' } },
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
    { group: 'Queue Wizard', method: 'POST', path: '/config/queue-wizard/vibe-seed-start', body: { seedArtist: 'John Mayer', seedTitle: 'Gravity', targetQueue: 12 } },

    { group: 'Library Health', method: 'GET', path: '/config/library-health' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/missing-artwork' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-tracks' },
    { group: 'Library Health', method: 'POST', path: '/config/library-health/album-artist-cleanup', body: { folder: '' } },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-genre' },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-art-search', body: { folder: '' } },
    { group: 'Library Health', method: 'GET', path: '/config/library-health/album-art-fetch', body: { url: '' } },
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

  app.get('/config/diagnostics/album-tracks', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.query?.album || '').trim();
      const artist = String(req.query?.artist || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'album is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const args = ['-h', mpdHost, '-f', '%file%\t%track%\t%title%\t%artist%\t%album%', 'find', 'album', album];
      if (artist) args.push('artist', artist);
      let out = '';
      try {
        const { stdout } = await execFileP('mpc', args, { maxBuffer: 16 * 1024 * 1024 });
        out = String(stdout || '');
      } catch {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%track%\t%title%\t%artist%\t%album%', 'find', 'album', album], { maxBuffer: 16 * 1024 * 1024 });
        out = String(stdout || '');
      }

      const tracks = String(out || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean).map((ln) => {
        const [file = '', track = '', title = '', rowArtist = '', rowAlbum = ''] = ln.split('\t');
        return {
          file: String(file || '').trim(),
          track: String(track || '').trim(),
          title: String(title || '').trim(),
          artist: String(rowArtist || artist || '').trim(),
          album: String(rowAlbum || album || '').trim(),
        };
      }).filter((t) => !!t.file);

      tracks.sort((a, b) => {
        const ta = Number.parseInt(String(a.track || '').replace(/[^0-9].*$/, ''), 10);
        const tb = Number.parseInt(String(b.track || '').replace(/[^0-9].*$/, ''), 10);
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        return `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, undefined, { sensitivity: 'base' });
      });

      return res.json({ ok: true, album, artist, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/diagnostics/artist-albums', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.query?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'artist is required' });
      const mpdHost = String(MPD_HOST || '10.0.0.254');

      const pull = async (field) => {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%\t%genre%', 'find', field, artist], { maxBuffer: 24 * 1024 * 1024 });
        return String(stdout || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean);
      };

      const rows = [...(await pull('artist')), ...(await pull('albumartist'))];
      const byAlbum = new Map();
      for (const ln of rows) {
        const [file = '', album = '', rowArtist = '', rowAlbumArtist = '', rowGenre = ''] = ln.split('\t');
        const albumName = String(album || '').trim();
        const fileName = String(file || '').trim();
        if (!albumName || !fileName) continue;
        const key = albumName.toLowerCase();
        if (!byAlbum.has(key)) {
          const i = fileName.lastIndexOf('/');
          const folder = i > 0 ? fileName.slice(0, i) : '';
          byAlbum.set(key, {
            album: albumName,
            artist: String(rowArtist || rowAlbumArtist || artist || '').trim(),
            genre: String(rowGenre || '').trim(),
            sampleFile: fileName,
            folder,
            count: 1,
          });
        } else {
          byAlbum.get(key).count += 1;
        }
      }

      const albums = Array.from(byAlbum.values()).sort((a, b) => String(a.album || '').localeCompare(String(b.album || ''), undefined, { sensitivity: 'base' }));
      return res.json({ ok: true, artist, count: albums.length, albums });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/diagnostics/queue/save-playlist', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const rawName = String(req.body?.playlistName || '').trim();
      if (!rawName) return res.status(400).json({ ok: false, error: 'playlistName is required' });
      const safeName = rawName.replace(/[\r\n]/g, ' ').replace(/[\x00-\x1F]/g, '').replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!safeName) return res.status(400).json({ ok: false, error: 'playlistName is invalid' });

      const mpdHost = String(MPD_HOST || process.env.MPD_HOST || '127.0.0.1').trim();
      const mpdPort = String(process.env.MPD_PORT || '6600').trim();

      const q = await execFileP('mpc', ['-h', mpdHost, '-p', mpdPort, 'playlist'], { timeout: 15000 });
      const qLines = String(q?.stdout || '').split(/\r?\n/).map((s)=>String(s||'').trim()).filter(Boolean);
      const trackCount = qLines.length;
      const youtubeThumbs = qLines
        .map((u) => {
          try {
            return String((typeof getYoutubeQueueHint === 'function' ? (getYoutubeQueueHint(u)?.thumbnail || '') : '') || '').trim();
          } catch {
            return '';
          }
        })
        .filter(Boolean);

      const sourceManifest = {
        schema: 'now-playing.youtube-manifest.v1',
        playlistName: safeName,
        savedAt: new Date().toISOString(),
        entries: qLines.map((u, idx) => {
          const file = String(u || '').trim();
          const isYtProxy = /\/youtube\/proxy\//i.test(file);
          const hint = (isYtProxy && typeof getYoutubeQueueHint === 'function') ? (getYoutubeQueueHint(file) || {}) : {};
          const sourceUrl = String(hint?.webpageUrl || '').trim();
          return {
            index: idx,
            type: isYtProxy ? 'youtube' : 'mpd',
            file,
            sourceUrl,
            title: String(hint?.title || '').trim(),
            channel: String(hint?.channel || '').trim(),
            thumbnail: String(hint?.thumbnail || '').trim(),
          };
        }),
      };
      if (!trackCount) {
        return res.status(400).json({ ok: false, error: 'Live queue is empty. Nothing to save.' });
      }

      try {
        await execFileP('mpc', ['-h', mpdHost, '-p', mpdPort, 'rm', safeName], { timeout: 15000 });
      } catch {}
      await execFileP('mpc', ['-h', mpdHost, '-p', mpdPort, 'save', safeName], { timeout: 20000 });

      const sshHost = String(MOODE_SSH_HOST || mpdHost || '').trim();
      const sshUser = String(MOODE_SSH_USER || 'moode').trim();

      // Rewrite saved .m3u to use durable source URLs for YouTube entries (not proxy URLs).
      let m3uRewritten = false;
      let m3uRewriteError = '';
      try {
        const playlistFileName = `${safeName}.m3u`;
        const m3uLines = sourceManifest.entries
          .map((ent) => {
            const t = String(ent?.type || '').trim().toLowerCase();
            const f = String(ent?.file || '').trim();
            const src = String(ent?.sourceUrl || '').trim();
            if (t === 'youtube') return src || f;
            return f;
          })
          .filter(Boolean);
        const m3uText = `${m3uLines.join('\n')}\n`;
        const m3uB64 = Buffer.from(m3uText, 'utf8').toString('base64');
        const remoteM3u = `/var/lib/mpd/playlists/${playlistFileName}`;
        const cmd = `sudo -n bash -lc 'echo ${m3uB64} | base64 -d > ${remoteM3u.replace(/ /g, '\\ ')} && chown root:audio ${remoteM3u.replace(/ /g, '\\ ')} && chmod 644 ${remoteM3u.replace(/ /g, '\\ ')}'`;
        await execFileP('ssh', [`${sshUser}@${sshHost}`, cmd], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        m3uRewritten = true;
      } catch (e) {
        m3uRewriteError = e?.message || String(e);
      }

      // Save sidecar manifest so YouTube entries can be rebuilt later.
      let manifestSaved = false;
      let manifestError = '';
      try {
        const manifestName = `${safeName}.youtube.json`.replace(/[^A-Za-z0-9._ -]/g, '_');
        const manifestJson = JSON.stringify(sourceManifest, null, 2);
        const manifestB64 = Buffer.from(manifestJson, 'utf8').toString('base64');
        const remotePath = `/var/lib/mpd/playlists/${manifestName}`;
        const cmd = `sudo -n bash -lc 'echo ${manifestB64} | base64 -d > ${remotePath.replace(/ /g, '\\ ')} && chown root:audio ${remotePath.replace(/ /g, '\\ ')} && chmod 644 ${remotePath.replace(/ /g, '\\ ')}'`;
        await execFileP('ssh', [`${sshUser}@${sshHost}`, cmd], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        manifestSaved = true;
      } catch (e) {
        manifestError = e?.message || String(e);
      }

      let collageGenerated = false;
      let collageError = '';
      const generateCollage = req.body?.generateCollage !== false;
      if (generateCollage) {
        const sshHost = String(MOODE_SSH_HOST || mpdHost || '').trim();
        const sshUser = String(MOODE_SSH_USER || 'moode').trim();

        // Prefer direct thumb cover for YouTube/stream-heavy queues.
        if (youtubeThumbs.length) {
          try {
            const firstThumb = String(youtubeThumbs[0] || '').trim();
            const coverName = safeName.replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '_');
            const remoteOut = `/var/local/www/imagesw/playlist-covers/${coverName}.jpg`;
            const esc = (s) => String(s).replace(/'/g, `'"'"'`);
            const cmdInner = `set -e; mkdir -p /var/local/www/imagesw/playlist-covers; curl -fsSL '${esc(firstThumb)}' -o '${esc(remoteOut)}'`;
            const cmd = `sudo -n bash -lc '${cmdInner.replace(/'/g, "'\\''")}'`;
            await execFileP('ssh', [`${sshUser}@${sshHost}`, cmd], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
            collageGenerated = true;
          } catch (e) {
            collageError = e?.message || String(e);
          }
        }

        // Non-YouTube or fallback path: try moOde collage script.
        if (!collageGenerated) {
          try {
            const remoteScriptCandidates = [
              '/usr/local/bin/moode-playlist-cover.sh',
              '/opt/now-playing/scripts/moode-playlist-cover.sh',
              '/var/local/www/scripts/moode-playlist-cover.sh',
            ];
            const cmdInner = `set -e; P='${safeName.replace(/'/g, "'\\''")}'; `
              + `for s in ${remoteScriptCandidates.map((p)=>`'${p}'`).join(' ')}; do `
              + `if [ -x "$s" ]; then bash "$s" "$P"; exit 0; fi; `
              + `done; echo 'cover-script-not-found' >&2; exit 127`;
            const cmd = `sudo -n bash -lc '${cmdInner.replace(/'/g, "'\\''")}'`;
            await execFileP('ssh', [`${sshUser}@${sshHost}`, cmd], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
            collageGenerated = true;
          } catch (e) {
            if (!collageError) collageError = e?.message || String(e);
          }
        }
      }

      if (collageError) {
        const one = String(collageError).split(/\r?\n/)[0];
        collageError = one.replace(/^Command failed:\s*/i, '').slice(0, 180);
      }

      return res.json({ ok: true, playlistName: safeName, playlistSaved: true, trackCount, m3uRewritten, m3uRewriteError, manifestSaved, manifestError, collageGenerated, collageError });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/diagnostics/playback', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const action = String(req.body?.action || '').trim().toLowerCase();
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const map = { play: 'play', pause: 'pause', toggle: 'toggle', next: 'next', prev: 'prev', previous: 'prev', stop: 'stop' };

      if (action === 'shuffle') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /random:\s*on/i.test(String(beforeStatus || ''));
        const setTo = wasOn ? 'off' : 'on';
        await execFileP('mpc', ['-h', mpdHost, 'random', setTo]);
        let { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        const repeatOn = /repeat:\s*on/i.test(String(afterStatus || ''));

        // Alexa continuity anchor: when turning random OFF while Alexa-mode lifecycle is active,
        // prime MPD current position to the remembered removed position (without leaving local playback running).
        let primedPos = null;
        let primeSkipped = '';
        try {
          const wp = (typeof getAlexaWasPlaying === 'function') ? (getAlexaWasPlaying() || null) : null;
          const alexaActive = !!wp?.active;
          if (setTo === 'off' && alexaActive) {
            const fromField = Number(wp?.removedPos0);
            const fromToken = pos0FromAlexaToken(wp?.token);
            const anchorPos0 = Number.isFinite(fromField) ? Math.max(0, Math.floor(fromField)) : fromToken;
            const anchorPos1Raw = Number.isFinite(anchorPos0) ? (anchorPos0 + 1) : null;

            const statusText = String(afterStatus || '');
            const isLocallyPlaying = /\[(playing|paused)\]/i.test(statusText);
            const mTot = statusText.match(/#\d+\/(\d+)/);
            const total = mTot ? Number(mTot[1] || 0) : 0;

            if (!Number.isFinite(anchorPos1Raw) || (anchorPos1Raw || 0) <= 0) {
              primeSkipped = 'no-anchor';
            } else if (isLocallyPlaying) {
              primeSkipped = 'local-playing';
            } else {
              const targetPos = total > 0 ? Math.max(1, Math.min(total, Math.floor(anchorPos1Raw))) : Math.max(1, Math.floor(anchorPos1Raw));
              await execFileP('mpc', ['-h', mpdHost, 'play', String(targetPos)]);
              await execFileP('mpc', ['-h', mpdHost, 'stop']);
              primedPos = targetPos;
              const refreshed = await execFileP('mpc', ['-h', mpdHost, 'status']);
              afterStatus = refreshed?.stdout || afterStatus;
            }
          }
        } catch (e) {
          primeSkipped = `prime-error:${e?.message || String(e)}`;
        }

        return res.json({ ok: true, action, randomOn, repeatOn, primedPos, primeSkipped, status: String(afterStatus || '') });
      }

      if (action === 'shufflequeue') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /random:\s*on/i.test(String(beforeStatus || ''));
        if (wasOn) await execFileP('mpc', ['-h', mpdHost, 'random', 'off']);
        await execFileP('mpc', ['-h', mpdHost, 'shuffle']);
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

      if (action === 'consume') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /consume:\s*on/i.test(String(beforeStatus || ''));
        const setToRaw = String(req.body?.setTo || '').trim().toLowerCase();
        const setTo = (setToRaw === 'on' || setToRaw === 'off') ? setToRaw : (wasOn ? 'off' : 'on');
        await execFileP('mpc', ['-h', mpdHost, 'consume', setTo]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const consumeOn = /consume:\s*on/i.test(String(afterStatus || ''));
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        const repeatOn = /repeat:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, consumeOn, randomOn, repeatOn, status: String(afterStatus || '') });
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

      if (action === 'clear') {
        await execFileP('mpc', ['-h', mpdHost, 'clear']);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'crop') {
        await execFileP('mpc', ['-h', mpdHost, 'crop']);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, randomOn, status: String(afterStatus || '') });
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

      if (action === 'addfile') {
        const file = String(req.body?.file || '').trim();
        if (!file) return res.status(400).json({ ok: false, error: 'file is required for addfile' });
        await execFileP('mpc', ['-h', mpdHost, 'add', file]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, file, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'trackmeta') {
        const file = String(req.body?.file || '').trim();
        if (!file) return res.status(400).json({ ok: false, error: 'file is required for trackmeta' });
        const fmt = '%file%\t%genre%\t%date%\t%track%\t%time%\t%composer%\t%performer%\t%albumartist%\t%name%\t%audio%';
        const basename = file.split('/').pop() || file;

        async function pull(args) {
          try {
            const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, ...args], { maxBuffer: 4 * 1024 * 1024 });
            return String(stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
          } catch {
            return [];
          }
        }

        function resolveLocalPath(f) {
          const s = String(f || '').trim().replace(/^\/+/, '');
          if (!s) return '';
          const candidates = [
            s.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + s.slice('USB/SamsungMoode/'.length) : '',
            s.startsWith('OSDISK/') ? '/mnt/OSDISK/' + s.slice('OSDISK/'.length) : '',
            '/mnt/SamsungMoode/' + s,
            '/mnt/OSDISK/' + s,
            s.startsWith('/mnt/') ? s : '',
          ].filter(Boolean);
          return candidates;
        }

        async function ffprobeAudio(localPath) {
          try {
            const { stdout } = await execFileP('ffprobe', [
              '-v', 'error',
              '-select_streams', 'a:0',
              '-show_entries', 'stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample,bit_rate',
              '-of', 'default=noprint_wrappers=1:nokey=0',
              localPath,
            ], { timeout: 2500, maxBuffer: 2 * 1024 * 1024 });
            const kv = {};
            String(stdout || '').split(/\r?\n/).forEach((ln) => {
              const i = ln.indexOf('=');
              if (i > 0) kv[ln.slice(0, i).trim()] = ln.slice(i + 1).trim();
            });
            const codec = String(kv.codec_name || '').trim();
            const sr = Number(kv.sample_rate || 0) || 0;
            const ch = Number(kv.channels || 0) || 0;
            const bits = Number(kv.bits_per_raw_sample || kv.bits_per_sample || 0) || 0;
            const br = Number(kv.bit_rate || 0) || 0;
            const human = [
              codec || '',
              bits ? `${bits}-bit` : '',
              sr ? `${Math.round(sr/1000)} kHz` : '',
              ch ? `${ch}ch` : '',
              br ? `${Math.round(br/1000)} kbps` : '',
            ].filter(Boolean).join(' • ');
            return { codec, sample_rate: sr ? `${sr}` : '', bits: bits ? `${bits}` : '', bit_rate: br ? `${Math.round(br/1000)}` : '', channels: ch ? `${ch}` : '', human };
          } catch {
            return { codec:'', sample_rate:'', bits:'', bit_rate:'', channels:'', human:'' };
          }
        }

        async function ffprobePersonnel(localPath) {
          try {
            const { stdout } = await execFileP('ffprobe', [
              '-v', 'error',
              '-show_entries', 'format_tags=artist,album_artist,performer,composer,conductor,ensemble,soloist',
              '-of', 'default=noprint_wrappers=1:nokey=0',
              localPath,
            ], { timeout: 2500, maxBuffer: 2 * 1024 * 1024 });
            const vals = [];
            String(stdout || '').split(/\r?\n/).forEach((ln) => {
              const m = ln.match(/^TAG:([^=]+)=(.*)$/);
              if (!m) return;
              const key = String(m[1] || '').toLowerCase();
              const v = String(m[2] || '').trim();
              if (!v) return;
              if (['artist','album_artist','performer','composer','conductor','ensemble','soloist'].includes(key)) vals.push(v);
            });
            return Array.from(new Set(vals)).join(' • ');
          } catch {
            return '';
          }
        }

        let rows = await pull(['find', 'file', file]);
        if (!rows.length && !file.startsWith('/')) rows = await pull(['find', 'file', `/${file}`]);
        if (!rows.length) rows = await pull(['find', 'filename', basename]);
        if (!rows.length) rows = await pull(['search', 'filename', basename]);

        let first = rows[0] || '';
        if (rows.length > 1) {
          const lowFile = file.toLowerCase();
          const byPath = rows.find((ln) => String(ln.split('\t')[0] || '').toLowerCase().includes(lowFile));
          if (byPath) first = byPath;
        }

        const [fileOut='', genre='', date='', track='', time='', composer='', performer='', albumartist='', name='', audio=''] = String(first || '').split('\t');
        let audioOut = String(audio || '').trim();
        let audioInfo = { codec:'', sample_rate:'', bits:'', bit_rate:'', channels:'', human:'' };
        let personnelOut = [String(performer || '').trim(), String(composer || '').trim()].filter(Boolean).join(' • ');
        if (!audioOut || /%audio%/i.test(audioOut)) {
          const rel = String(fileOut || file || '').trim();
          const cands = resolveLocalPath(rel);
          for (const p of cands) {
            try {
              await fs.access(p);
              audioInfo = await ffprobeAudio(p);
              const pp = await ffprobePersonnel(p);
              if (pp) personnelOut = pp;
              if (audioInfo.human || pp) {
                if (audioInfo.human) audioOut = audioInfo.human;
                break;
              }
            } catch {}
          }
        }

        return res.json({
          ok: true,
          action,
          file,
          found: !!first,
          foundFile: String(fileOut || '').trim(),
          meta: {
            genre: String(genre || '').trim(),
            date: String(date || '').trim(),
            track: String(track || '').trim(),
            time: String(time || '').trim(),
            composer: String(composer || '').trim(),
            performer: String(performer || '').trim(),
            albumartist: String(albumartist || '').trim(),
            name: String(name || '').trim(),
            personnel: String(personnelOut || '').trim(),
            audio: String(audioOut || '').trim(),
            audioInfo,
          },
        });
      }

      if (action === 'playfile') {
        const file = String(req.body?.file || '').trim();
        if (!file) return res.status(400).json({ ok: false, error: 'file is required for playfile' });

        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const beforeMatch = String(beforeStatus || '').match(/#(\d+)\/(\d+)/);
        const curPos = beforeMatch ? Number(beforeMatch[1] || 0) : 0;

        await execFileP('mpc', ['-h', mpdHost, 'add', file]);

        const { stdout: midStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const midMatch = String(midStatus || '').match(/#(\d+)\/(\d+)/);
        const totalAfterAdd = midMatch ? Number(midMatch[2] || 0) : 0;

        let targetPos = 0;
        if (Number.isFinite(curPos) && curPos > 0) {
          targetPos = curPos + 1;
          const fromPos = Number.isFinite(totalAfterAdd) && totalAfterAdd > 0 ? totalAfterAdd : 0;
          if (fromPos > 0 && fromPos !== targetPos) {
            await execFileP('mpc', ['-h', mpdHost, 'move', String(fromPos), String(targetPos)]);
          }
          await execFileP('mpc', ['-h', mpdHost, 'play', String(targetPos)]);
        } else {
          const fallbackPos = Number.isFinite(totalAfterAdd) && totalAfterAdd > 0 ? totalAfterAdd : 1;
          targetPos = fallbackPos;
          await execFileP('mpc', ['-h', mpdHost, 'play', String(fallbackPos)]);
        }

        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, file, targetPos, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'addalbum') {
        const album = String(req.body?.album || '').trim();
        const artist = String(req.body?.artist || '').trim();
        const mode = String(req.body?.mode || 'append').trim().toLowerCase();
        if (!album) return res.status(400).json({ ok: false, error: 'album is required for addalbum' });
        if (!['append', 'crop', 'replace'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be append|crop|replace' });

        if (mode === 'replace') await execFileP('mpc', ['-h', mpdHost, 'clear']);
        if (mode === 'crop') await execFileP('mpc', ['-h', mpdHost, 'crop']);

        const args = ['-h', mpdHost, '-f', '%file%', 'find', 'album', album];
        if (artist) args.push('artist', artist);
        let filesOut = '';
        try {
          const { stdout } = await execFileP('mpc', args, { maxBuffer: 16 * 1024 * 1024 });
          filesOut = String(stdout || '');
        } catch {
          const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', 'album', album], { maxBuffer: 16 * 1024 * 1024 });
          filesOut = String(stdout || '');
        }
        const files = Array.from(new Set(String(filesOut || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean)));
        for (const f of files) {
          await execFileP('mpc', ['-h', mpdHost, 'add', f]);
        }
        if (mode === 'replace' && files.length > 0) {
          await execFileP('mpc', ['-h', mpdHost, 'play', '1']);
        }

        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, album, artist, mode, added: files.length, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'addartistshuffle') {
        const artist = String(req.body?.artist || '').trim();
        const mode = String(req.body?.mode || 'append').trim().toLowerCase();
        const minRatingRaw = Number(req.body?.minRating);
        const minRating = Number.isFinite(minRatingRaw) ? Math.max(0, Math.min(5, Math.round(minRatingRaw))) : 2;
        const excludeGenreEnabled = String(req.body?.excludeGenreEnabled || '').trim().toLowerCase();
        const excludeGenre = String(req.body?.excludeGenre || '').trim();
        const excludeOn = ['1','true','yes','on'].includes(excludeGenreEnabled) || (!!excludeGenre);
        if (!artist) return res.status(400).json({ ok: false, error: 'artist is required for addartistshuffle' });
        if (!['append', 'crop', 'replace'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be append|crop|replace' });

        if (mode === 'replace') await execFileP('mpc', ['-h', mpdHost, 'clear']);
        if (mode === 'crop') await execFileP('mpc', ['-h', mpdHost, 'crop']);

        const pull = async (field) => {
          const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', field, artist], { maxBuffer: 24 * 1024 * 1024 });
          return String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
        };
        const dedup = Array.from(new Set([...(await pull('artist')), ...(await pull('albumartist'))]));

        const filtered = [];
        for (const f of dedup) {
          if (excludeOn && excludeGenre) {
            try {
              const { stdout: gOut } = await execFileP('mpc', ['-h', mpdHost, '-f', '%genre%', 'find', 'file', f], { maxBuffer: 1024 * 1024 });
              const g = String(gOut || '').trim().toLowerCase();
              if (g && g.includes(String(excludeGenre || '').trim().toLowerCase())) continue;
            } catch {}
          }
          let rating = 0;
          try { rating = Number(await getRatingForFile(f)) || 0; } catch {}
          if (rating >= minRating) filtered.push(f);
        }

        for (let i = filtered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = filtered[i]; filtered[i] = filtered[j]; filtered[j] = t;
        }
        for (const f of filtered) await execFileP('mpc', ['-h', mpdHost, 'add', f]);
        if (mode === 'replace' && filtered.length > 0) await execFileP('mpc', ['-h', mpdHost, 'play', '1']);

        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, artist, mode, minRating, excludeGenre: excludeOn ? excludeGenre : '', matched: dedup.length, added: filtered.length, randomOn, status: String(afterStatus || '') });
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
      let name = String(req.query?.name || '').trim();
      const file = String(req.query?.file || '').trim();

      if (!name && file) {
        let stationMap = new Map();
        let recentRadioMap = new Map();
        let aliases = {};
        try { stationMap = await loadRadioCatalogMap(); } catch {}
        try { recentRadioMap = await loadRadioQueueMap(); } catch {}
        try { aliases = await loadRadioLogoAliases(); } catch {}
        const fKey = stationKey(file);
        const fHost = stationHost(file);
        const q = recentRadioMap.get(file) || recentRadioMap.get(`key:${fKey}`) || recentRadioMap.get(`host:${fHost}`) || {};
        const c1 = stationMap.get(file) || {};
        const c2 = stationMap.get(fKey) || {};
        const c3 = stationMap.get(`host:${fHost}`) || {};
        const aliasName = String(aliases?.[fHost] || aliases?.[fKey] || '').trim();
        name = String(q.stationName || c1.stationName || c2.stationName || c3.stationName || aliasName || fHost || '').trim();
      }

      if (!name) return res.status(400).end('missing name');

      const cached = await readCachedRadioLogo(name);
      if (cached) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(cached);
      }

      const tryFetchLogo = async (nm) => {
        const u = `http://${mpdHost}/imagesw/radio-logos/${encodeURIComponent(nm)}.jpg`;
        const r = await fetch(u, { redirect: 'follow' });
        if (!r.ok) return null;
        const ab = await r.arrayBuffer();
        return { r, buf: Buffer.from(ab), nameUsed: nm };
      };

      let got = await tryFetchLogo(name);
      if (!got) {
        const aliases = await loadRadioLogoAliases();
        const aliasTarget = String(aliases?.[name] || aliases?.[String(name).toLowerCase()] || '').trim();
        if (aliasTarget && aliasTarget.toLowerCase() !== String(name).toLowerCase()) {
          got = await tryFetchLogo(aliasTarget);
        }
      }
      if (!got) return res.status(404).end('not found');

      const { r, buf, nameUsed } = got;
      await writeCachedRadioLogo(nameUsed || name, buf);
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      // Treat freshly fetched logos as cacheable for a full day to reduce repeat latency.
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(buf);
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
      const consumeOn = /consume:\s*on/i.test(st);
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
      let logoAliases = {};
      try { stationMap = await loadRadioCatalogMap(); } catch {}
      try { recentRadioMap = await loadRadioQueueMap(); } catch {}
      try { logoAliases = await loadRadioLogoAliases(); } catch {}

      const lines = String(qOut || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean);
      const ytHint = (typeof getYoutubeNowPlayingHint === 'function') ? (getYoutubeNowPlayingHint() || {}) : {};
      const ytHintFresh = (Date.now() - Number(ytHint?.setAt || 0)) < (6 * 60 * 60 * 1000);
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
        const fKey = stationKey(f);
        const fHost = stationHost(f);
        const queueMeta = recentRadioMap.get(f) || recentRadioMap.get(`key:${fKey}`) || recentRadioMap.get(`host:${fHost}`) || {};
        const catMetaDirect = stationMap.get(f) || {};
        const catMetaKey = stationMap.get(fKey) || {};
        const catMetaHost = stationMap.get(`host:${fHost}`) || {};

        const aliasName = String(logoAliases?.[fHost] || logoAliases?.[fKey] || '').trim();
        let stationNameTxt = String(name || '').trim()
          || String(queueMeta.stationName || '').trim()
          || String(catMetaDirect.stationName || '').trim()
          || String(catMetaKey.stationName || '').trim()
          || String(catMetaHost.stationName || '').trim()
          || aliasName;
        const stationGenreTxt = String(queueMeta.genre || '').trim()
          || String(catMetaDirect.genre || '').trim()
          || String(catMetaKey.genre || '').trim()
          || String(catMetaHost.genre || '').trim();
        const stationFavorite = !!(queueMeta.isFavorite || catMetaDirect.isFavorite || catMetaKey.isFavorite || catMetaHost.isFavorite);

        const isStream = isStreamUrl(f);
        if (isStream && !stationNameTxt) {
          stationNameTxt = stationHost(f) || stationKey(f);
        }
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
        const logoLooksHost = !!streamLogoName && /\./.test(streamLogoName) && !/\s/.test(streamLogoName);
        const stationLogo = (streamLogoName && !logoLooksHost)
          ? stationLogoUrlFromAlbum(streamLogoName)
          : (f ? `/art/radio-logo.jpg?file=${encodeURIComponent(f)}` : '');
        const streamArtFallback = String(cleaned.artUrl || '').trim();
        const isHead = Number.isFinite(pos) && pos === headPos;
        const ytStream = !!(isStream && /googlevideo\.com|youtube\.com|youtu\.be|\/youtube\/proxy\//i.test(f));
        if (ytStream) {
          const byFile = (typeof getYoutubeQueueHint === 'function') ? (getYoutubeQueueHint(f) || null) : null;
          const hTitle = String(byFile?.title || (ytHintFresh ? ytHint?.title : '') || '').trim();
          const hChan = String(byFile?.channel || (ytHintFresh ? ytHint?.channel : '') || '').trim();
          if (hTitle) titleTxt = hTitle;
          if (hChan) artistTxt = hChan;
          stationNameTxt = String(artistTxt || titleTxt || 'YouTube').trim();
        }

        const thumbUrl = ytStream
          ? (String(((typeof getYoutubeQueueHint === 'function') ? (getYoutubeQueueHint(f)?.thumbnail || '') : '') || (ytHintFresh ? ytHint?.thumbnail : '') || '').trim() || '/art/current.jpg')
          : (isStream
              ? (stationLogo || streamArtFallback || (isHead ? '/art/current.jpg' : ''))
              : (f ? `/art/track_640.jpg?file=${encodeURIComponent(f)}` : ''));
        items.push({
          position: pos,
          isHead,
          isStream,
          isYoutube: ytStream,
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
      return res.json({ ok: true, count: items.length, headPos, randomOn, repeatOn, consumeOn, playbackState, ratingsEnabled, items });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
