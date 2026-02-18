import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

const CACHE_FILE = path.resolve(process.cwd(), 'data', 'animated-art-cache.json');
const DISCOVERY_FILE = path.resolve(process.cwd(), 'data', 'animated-art-discovery.json');
const H264_DIR = path.resolve(process.cwd(), 'data', 'animated-art-h264');

const KNOWN_APPLE_URL_OVERRIDES = {
  'john mayer|sob rock': 'https://music.apple.com/us/album/sob-rock/1568819304',
  "michael mcdonald|if that's what it takes": 'https://music.apple.com/us/album/if-thats-what-it-takes/358567891',
};

const KNOWN_MP4_OVERRIDES = {
  'john mayer|sob rock': 'https://mvod.itunes.apple.com/itunes-assets/HLSMusic126/v4/3c/c4/43/3cc4432f-aeb7-2ccc-e011-242d85a518c8/P359476653_Anull_video_gr290_sdr_1080x1080-.mp4',
  "michael mcdonald|if that's what it takes": 'https://mvod.itunes.apple.com/itunes-assets/HLSVideo221/v4/8d/6f/65/8d6f6572-0e8c-e7a3-b95f-ebff0c533581/P1220875422_Anull_video_gr585_sdr_1080x1080-.mp4',
};

function pickKnownOverrideUrl(artist, album) {
  const exact = String(KNOWN_APPLE_URL_OVERRIDES[albumKey(artist, album)] || '').trim();
  if (exact) return exact;
  const a = normText(artist);
  const b = normText(album);
  const ar = String(artist || '').toLowerCase();
  const al = String(album || '').toLowerCase();
  if ((a === 'michael mcdonald' || ar.includes('michael mcdonald')) && (
    b === 'if that s what it takes' || b.includes('if that s what it takes') ||
    al.includes("if that's what it takes") || al.includes("if that\\'s what it takes") || al.includes('if thats what it takes')
  )) {
    return 'https://music.apple.com/us/album/if-thats-what-it-takes/358567891';
  }
  if (a === 'john mayer' && b === 'sob rock') {
    return 'https://music.apple.com/us/album/sob-rock/1568819304';
  }
  return '';
}

let activeJob = null;
let discoverJob = null;
let appleLookupBackoffUntil = 0;
let appleItunesNextAllowedTs = 0;
const runtimeLookupInFlight = new Map();
const h264TranscodeInFlight = new Map();

async function fetchJsonWithTimeout(url, ms = 12000, init = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, Number(ms) || 12000));
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    const j = await r.json().catch(() => ({}));
    return { response: r, json: j };
  } finally {
    clearTimeout(t);
  }
}

function hashUrl(url) {
  return crypto.createHash('sha1').update(String(url || ''), 'utf8').digest('hex');
}

function h264FilenameForSource(url) {
  return `${hashUrl(url)}.mp4`;
}

function h264PublicUrlForSource(req, sourceUrl) {
  const name = h264FilenameForSource(sourceUrl);
  return `${req.protocol}://${req.get('host')}/config/library-health/animated-art/media/${name}`;
}

function h264PathFromPublicUrl(url) {
  const m = String(url || '').match(/\/media\/([a-f0-9]{40}\.mp4)$/i);
  if (!m) return '';
  return path.join(H264_DIR, m[1]);
}

async function h264PublicUrlExists(url) {
  const p = h264PathFromPublicUrl(url);
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

async function ensureH264ForSource(sourceUrl) {
  const src = String(sourceUrl || '').trim();
  if (!src) return '';

  const name = h264FilenameForSource(src);
  const outPath = path.join(H264_DIR, name);
  const tmpPath = `${outPath}.tmp.mp4`;

  try {
    await fs.access(outPath);
    return outPath;
  } catch {}

  let p = h264TranscodeInFlight.get(src);
  if (!p) {
    p = (async () => {
      await fs.mkdir(H264_DIR, { recursive: true });
      await execFileP('/usr/bin/ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', src,
        '-an',
        '-vf', 'scale=720:720:flags=lanczos',
        '-r', '24',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '30',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        tmpPath,
      ], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
      await fs.rename(tmpPath, outPath);
      return outPath;
    })().finally(async () => {
      h264TranscodeInFlight.delete(src);
      try { await fs.unlink(tmpPath); } catch {}
    });
    h264TranscodeInFlight.set(src, p);
  }

  return p;
}

async function waitForAppleItunesSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, appleItunesNextAllowedTs - now);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  // keep below 20/min (3s); use 3.4s safety margin for batch jobs
  appleItunesNextAllowedTs = Date.now() + 3400;
}

function normKeyPart(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\\'+/g, "'")
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function albumKey(artist, album) {
  return `${normKeyPart(artist)}|${normKeyPart(album)}`;
}

async function readJsonFile(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const j = JSON.parse(raw);
    return (j && typeof j === 'object') ? j : fallback;
  } catch {
    return fallback;
  }
}

async function readCache() {
  return readJsonFile(CACHE_FILE, { updatedAt: new Date().toISOString(), entries: {} });
}

async function writeCache(cache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function readDiscovery() {
  return readJsonFile(DISCOVERY_FILE, { updatedAt: new Date().toISOString(), entries: {} });
}

async function writeDiscovery(obj) {
  await fs.mkdir(path.dirname(DISCOVERY_FILE), { recursive: true });
  await fs.writeFile(DISCOVERY_FILE, JSON.stringify(obj, null, 2));
}

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\b(deluxe|expanded|remaster(?:ed)?|anniversary|edition|bonus|explicit|clean|version|mono|stereo)\b/g, ' ')
    .replace(/\bfeat\.?\b.*$/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreAlbumCandidate(targetArtist, targetAlbum, candArtist, candAlbum) {
  const ta = normText(targetArtist);
  const tb = normText(targetAlbum);
  const ca = normText(candArtist);
  const cb = normText(candAlbum);
  let score = 0;
  if (ca && ta && (ca === ta)) score += 5;
  if (cb && tb && (cb === tb)) score += 8;
  if (tb && cb && (cb.includes(tb) || tb.includes(cb))) score += 4;
  if (ta && ca && (ca.includes(ta) || ta.includes(ca))) score += 2;
  return score;
}

async function itunesAlbumCandidates(term, limit = 8) {
  const q = String(term || '').trim();
  if (!q) return [];
  const u = `https://itunes.apple.com/search?entity=album&limit=${Math.max(1, Math.min(20, limit))}&term=${encodeURIComponent(q)}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForAppleItunesSlot();
    const { response: r, json: j } = await fetchJsonWithTimeout(u, 12000, {
      cache: 'no-store',
      headers: { 'user-agent': 'now-playing-next/1.0 (+https://moode.brianwis.com)' },
    });
    if (r.ok) {
      return Array.isArray(j?.results) ? j.results : [];
    }
    if (r.status === 429) {
      appleLookupBackoffUntil = Math.max(appleLookupBackoffUntil || 0, Date.now() + (45 * 60 * 1000));
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      continue;
    }
    return [];
  }
  return [];
}

async function lookupAppleAlbumCandidates(artist, album, limit = 6) {
  if (appleLookupBackoffUntil && Date.now() < appleLookupBackoffUntil) return [];
  const a = String(artist || '').trim();
  const b = String(album || '').trim();
  const attempts = [
    `${a} ${b}`.trim(),
    `${normText(a)} ${normText(b)}`.trim(),
    `${b}`.trim(),
    `${normText(b)}`.trim(),
  ].filter(Boolean);

  const scored = [];
  for (const term of attempts) {
    const rows = await itunesAlbumCandidates(term, 10);
    for (const it of rows) {
      const url = String(it?.collectionViewUrl || '').trim().split('?')[0];
      if (!url) continue;
      const candArtist = String(it?.artistName || '');
      const ta = normText(a);
      const ca = normText(candArtist);
      const artistLooksRelated = !ta || !ca || ca.includes(ta) || ta.includes(ca);
      const s = scoreAlbumCandidate(a, b, candArtist, it?.collectionName);
      // Guard against unrelated albums (e.g., generic "Rock" matches).
      if (!artistLooksRelated && s < 10) continue;
      scored.push({ url, score: s });
    }
  }

  const seen = new Set();
  const ordered = scored
    .sort((x, y) => (y.score - x.score))
    .filter((x) => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });

  return ordered.slice(0, Math.max(1, Math.min(20, Number(limit) || 6)));
}

async function lookupAppleAlbumUrl(artist, album) {
  const rows = await lookupAppleAlbumCandidates(artist, album, 1);
  return rows[0]?.url || '';
}

function pickMp4FromCovers(covers) {
  const square = Array.isArray(covers?.master_Streams?.square) ? covers.master_Streams.square : [];
  if (!square.length) return '';
  const list = square
    .map((x) => ({ uri: String(x?.uri || ''), width: Number(x?.width || 0), bw: Number(x?.bandwidth || 0) }))
    .filter((x) => x.uri.includes('.m3u8'))
    .sort((a, b) => (a.width - b.width) || (a.bw - b.bw));
  if (!list.length) return '';
  const choice = list.filter((x) => x.width >= 700 && x.width <= 1200).slice(-1)[0] || list.slice(-1)[0];
  return String(choice.uri || '').replace(/\.m3u8(?:\?.*)?$/i, '-.mp4');
}

async function lookupMotionForAlbum(artist, album) {
  if (appleLookupBackoffUntil && Date.now() < appleLookupBackoffUntil) {
    return { ok: false, reason: 'backoff-active' };
  }

  const key = albumKey(artist, album);
  const overrideUrl = pickKnownOverrideUrl(artist, album);
  // Hard pin known-problem albums before search to prevent candidate drift.
  const pinnedMp4 = String(KNOWN_MP4_OVERRIDES[key] || '').trim();
  if (overrideUrl && pinnedMp4) {
    return { ok: true, appleUrl: overrideUrl, mp4: pinnedMp4 };
  }
  if (overrideUrl) {
    const endpoint = `https://api.aritra.ovh/v1/covers?url=${encodeURIComponent(overrideUrl)}`;
    const out = await fetchJsonWithTimeout(endpoint, 20000, { cache: 'no-store' }).catch(() => null);
    const r = out?.response || null;
    const j = out?.json || {};
    if (r?.ok) {
      const mp4 = pickMp4FromCovers(j);
      if (mp4) return { ok: true, appleUrl: overrideUrl, mp4 };
    }
  }

  const candidateRows = await lookupAppleAlbumCandidates(artist, album, 8);
  const minAcceptScore = 6;
  const candidateUrls = candidateRows.filter((r) => Number(r?.score || 0) >= minAcceptScore).map((r) => r.url);
  const appleUrls = [overrideUrl, ...candidateUrls].filter(Boolean).filter((u, i, arr) => arr.indexOf(u) === i);
  if (!appleUrls.length) return { ok: false, reason: 'no-apple-url' };

  let lastReason = 'no-motion';
  let lastUrl = appleUrls[0] || '';

  for (const appleUrl of appleUrls) {
    const endpoint = `https://api.aritra.ovh/v1/covers?url=${encodeURIComponent(appleUrl)}`;

    let r = null;
    let j = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const out = await fetchJsonWithTimeout(endpoint, 12000, { cache: 'no-store' }).catch(() => null);
      r = out?.response || null;
      j = out?.json || {};
      if (r?.ok) break;
      if (r?.status === 429) {
        appleLookupBackoffUntil = Math.max(appleLookupBackoffUntil || 0, Date.now() + (45 * 60 * 1000));
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      break;
    }

    if (!r || !r.ok) {
      lastReason = `covers-http-${r?.status || 0}`;
      lastUrl = appleUrl;
      continue;
    }
    const mp4 = pickMp4FromCovers(j);
    if (mp4) return { ok: true, appleUrl, mp4 };
    lastReason = 'no-motion';
    lastUrl = appleUrl;
  }

  return { ok: false, reason: lastReason, appleUrl: lastUrl };
}

async function listLibraryAlbums(limitAlbums = 0) {
  const mpdHost = String(MPD_HOST || '10.0.0.254');
  const fmt = '%artist%\t%album%\t%file%';
  const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], { maxBuffer: 64 * 1024 * 1024 });
  const rows = String(stdout || '').split(/\r?\n/).map((ln) => {
    const [artist = '', album = '', file = ''] = ln.split('\t');
    return { artist: String(artist || '').trim(), album: String(album || '').trim(), file: String(file || '').trim() };
  }).filter((x) => x.artist && x.album && x.file && /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(x.file));

  const map = new Map();
  for (const r of rows) {
    const k = albumKey(r.artist, r.album);
    if (!map.has(k)) map.set(k, { artist: r.artist, album: r.album, tracks: 0, key: k });
    map.get(k).tracks += 1;
  }
  const out = Array.from(map.values()).sort((a, b) => b.tracks - a.tracks);
  return limitAlbums > 0 ? out.slice(0, limitAlbums) : out;
}

async function runBuildJob({ limitAlbums = 0, force = false, onlyKeys = [] } = {}) {
  // Seed immediately so polling sees running state right away.
  activeJob = {
    status: 'running', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), total: 0,
    processed: 0, matched: 0, misses: 0, skipped: 0, errors: 0, message: 'Preparing album list…'
  };

  const cache = await readCache();
  const entries = cache.entries || {};
  let albums = await listLibraryAlbums(limitAlbums);
  const keySet = new Set((Array.isArray(onlyKeys) ? onlyKeys : []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  if (keySet.size) albums = albums.filter((a) => keySet.has(String(a.key || '').toLowerCase()));
  const total = albums.length;

  activeJob.total = total;
  activeJob.updatedAt = new Date().toISOString();
  activeJob.message = 'Starting…';

  for (const row of albums) {
    const key = albumKey(row.artist, row.album);
    activeJob.updatedAt = new Date().toISOString();
    activeJob.message = `${row.artist} — ${row.album}`;

    if (!force && entries[key] && entries[key].mp4) {
      activeJob.processed += 1;
      activeJob.skipped += 1;
      continue;
    }

    try {
      const hit = await lookupMotionForAlbum(row.artist, row.album);
      entries[key] = {
        key,
        artist: row.artist,
        album: row.album,
        tracks: row.tracks,
        appleUrl: String(hit.appleUrl || ''),
        mp4: String(hit.mp4 || ''),
        hasMotion: !!hit.ok,
        reason: String(hit.reason || ''),
        updatedAt: new Date().toISOString(),
      };
      if (hit.ok) activeJob.matched += 1; else activeJob.misses += 1;
    } catch (e) {
      entries[key] = {
        key,
        artist: row.artist,
        album: row.album,
        tracks: row.tracks,
        appleUrl: '',
        mp4: '',
        hasMotion: false,
        reason: String(e?.message || e),
        updatedAt: new Date().toISOString(),
      };
      activeJob.errors += 1;
    }

    activeJob.processed += 1;
    if ((activeJob.processed % 25) === 0) await writeCache({ updatedAt: new Date().toISOString(), entries });
    await new Promise((resolve) => setTimeout(resolve, 90));
  }

  await writeCache({ updatedAt: new Date().toISOString(), entries });
  activeJob.status = 'done';
  activeJob.updatedAt = new Date().toISOString();
  activeJob.message = 'Completed';
}

async function runDiscoverJob({ limitAlbums = 0 } = {}) {
  // Seed immediately so UI polling doesn't drop back to idle during setup.
  discoverJob = {
    status: 'running', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), total: 0,
    processed: 0, found: 0, misses: 0, errors: 0, message: 'Preparing album list…'
  };

  const discovery = await readDiscovery();
  const entries = discovery.entries || {};
  const albums = await listLibraryAlbums(limitAlbums);
  discoverJob.total = albums.length;
  discoverJob.updatedAt = new Date().toISOString();
  discoverJob.message = 'Starting…';

  for (const row of albums) {
    const key = albumKey(row.artist, row.album);
    discoverJob.updatedAt = new Date().toISOString();
    discoverJob.message = `${row.artist} — ${row.album}`;
    try {
      const hit = await lookupMotionForAlbum(row.artist, row.album);
      entries[key] = {
        key,
        artist: row.artist,
        album: row.album,
        tracks: row.tracks,
        appleUrl: String(hit.appleUrl || ''),
        mp4: String(hit.mp4 || ''),
        hasMotion: !!hit.ok,
        reason: String(hit.reason || ''),
        updatedAt: new Date().toISOString(),
      };
      if (hit.ok) discoverJob.found += 1; else discoverJob.misses += 1;
    } catch (e) {
      entries[key] = {
        key,
        artist: row.artist,
        album: row.album,
        tracks: row.tracks,
        appleUrl: '',
        mp4: '',
        hasMotion: false,
        reason: String(e?.message || e),
        updatedAt: new Date().toISOString(),
      };
      discoverJob.errors += 1;
    }
    discoverJob.processed += 1;
    if ((discoverJob.processed % 25) === 0) await writeDiscovery({ updatedAt: new Date().toISOString(), entries });
    await new Promise((resolve) => setTimeout(resolve, 90));
  }

  await writeDiscovery({ updatedAt: new Date().toISOString(), entries });
  discoverJob.status = 'done';
  discoverJob.updatedAt = new Date().toISOString();
  discoverJob.message = 'Completed';
}

export function registerConfigLibraryHealthAnimatedArtRoutes(app, deps) {
  const { requireTrackKey } = deps;

  app.get('/config/library-health/animated-art/media/:name', async (req, res) => {
    try {
      const name = String(req.params?.name || '').trim();
      if (!/^[a-f0-9]{40}\.mp4$/i.test(name)) return res.status(400).end();
      const file = path.join(H264_DIR, name);
      return res.sendFile(file, { headers: { 'cache-control': 'public, max-age=604800, immutable' } });
    } catch {
      return res.status(404).end();
    }
  });

  app.get('/config/library-health/animated-art/cache', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const cache = await readCache();
      const entries = Object.values(cache.entries || {});
      const total = entries.length;
      const matched = entries.filter((e) => !!e?.hasMotion && !!e?.mp4).length;
      const ordered = entries.sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
      return res.json({ ok: true, updatedAt: cache.updatedAt, total, matched, entries: ordered });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/animated-art/discovery', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const d = await readDiscovery();
      const entries = Object.values(d.entries || {});
      const found = entries.filter((e) => !!e?.hasMotion && !!e?.mp4).length;
      return res.json({ ok: true, updatedAt: d.updatedAt, total: entries.length, found, entries: entries.slice(0, 1000) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/animated-art/job', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return res.json({ ok: true, job: activeJob || { status: 'idle' } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/animated-art/discover-job', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return res.json({ ok: true, job: discoverJob || { status: 'idle' } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/animated-art/lookup', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.query?.artist || '').trim();
      const album = String(req.query?.album || '').trim();
      const resolveOnMiss = String(req.query?.resolve || '1').trim().toLowerCase() !== '0';
      if (!artist || !album) return res.status(400).json({ ok: false, error: 'artist and album are required' });

      const key = albumKey(artist, album);
      const cache = await readCache();
      const entries = cache.entries || {};
      const existing = entries[key] || null;

      // Fast path: cached motion hit
      if (existing?.hasMotion && existing?.mp4) {
        let hit = existing;
        const wantH264 = String(req.query?.h264 || '1').trim().toLowerCase() !== '0';
        if (wantH264 && existing?.sourceCodec === 'h264' && existing?.mp4H264) {
          const okLocal = await h264PublicUrlExists(existing.mp4H264);
          if (okLocal) {
            hit = { ...existing, mp4: String(existing.mp4H264) };
          } else {
            // stale cache pointer to missing local file: force re-resolve below.
            hit = null;
          }
        } else if (wantH264) {
          try {
            const outPath = await ensureH264ForSource(existing.mp4);
            if (outPath) {
              hit = { ...existing, mp4Source: String(existing.mp4Source || existing.mp4 || ''), mp4H264: h264PublicUrlForSource(req, existing.mp4), mp4: h264PublicUrlForSource(req, existing.mp4), sourceCodec: 'h264' };
              const liveCache = await readCache();
              liveCache.entries = liveCache.entries || {};
              liveCache.entries[key] = { ...(liveCache.entries[key] || {}), ...hit, updatedAt: new Date().toISOString() };
              liveCache.updatedAt = new Date().toISOString();
              await writeCache(liveCache);
            }
          } catch (e) {
            console.warn('[animated-art] h264 transcode failed (cache-hit):', e?.message || e);
            // fallback to original mp4 URL
          }
        }
        if (hit) return res.json({ ok: true, key, hit, source: 'cache-hit' });
      }

      // Optional miss resolution (default ON): one-shot runtime lookup for current playing album.
      if (!resolveOnMiss) {
        return res.json({ ok: true, key, hit: existing, source: 'cache-miss-no-resolve' });
      }

      // De-duplicate concurrent lookups by album key.
      let p = runtimeLookupInFlight.get(key);
      if (!p) {
        p = (async () => {
          try {
            const hit = await lookupMotionForAlbum(artist, album);
            const nextEntry = {
              key,
              artist,
              album,
              tracks: Number(existing?.tracks || 0),
              appleUrl: String(hit?.appleUrl || ''),
              mp4: String(hit?.mp4 || ''),
              hasMotion: !!hit?.ok,
              reason: String(hit?.reason || ''),
              updatedAt: new Date().toISOString(),
            };
            const liveCache = await readCache();
            liveCache.entries = liveCache.entries || {};
            const prior = liveCache.entries[key] || null;
            // Never clobber a known motion hit with a no-motion probe.
            if (prior?.hasMotion && prior?.mp4 && !nextEntry.hasMotion) {
              return prior;
            }
            liveCache.entries[key] = nextEntry;
            liveCache.updatedAt = new Date().toISOString();
            await writeCache(liveCache);
            return nextEntry;
          } finally {
            runtimeLookupInFlight.delete(key);
          }
        })();
        runtimeLookupInFlight.set(key, p);
      }

      let resolved = await p;
      const wantH264 = String(req.query?.h264 || '1').trim().toLowerCase() !== '0';
      if (wantH264 && resolved?.hasMotion && resolved?.mp4) {
        try {
          const outPath = await ensureH264ForSource(resolved.mp4);
          if (outPath) {
            resolved = { ...resolved, mp4Source: String(resolved.mp4Source || resolved.mp4 || ''), mp4H264: h264PublicUrlForSource(req, resolved.mp4), mp4: h264PublicUrlForSource(req, resolved.mp4), sourceCodec: 'h264' };
            const liveCache = await readCache();
            liveCache.entries = liveCache.entries || {};
            liveCache.entries[key] = { ...(liveCache.entries[key] || {}), ...resolved, updatedAt: new Date().toISOString() };
            liveCache.updatedAt = new Date().toISOString();
            await writeCache(liveCache);
          }
        } catch (e) {
          console.warn('[animated-art] h264 transcode failed (resolved):', e?.message || e);
          // fallback to original mp4 URL
        }
      }
      return res.json({ ok: true, key, hit: resolved, source: resolved?.hasMotion ? 'resolved-hit' : 'resolved-miss' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/animated-art/clear', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const keyRaw = String(req.body?.key || '');
      const artist = String(req.body?.artist || '').trim();
      const album = String(req.body?.album || '').trim();
      const requestedKey = keyRaw || albumKey(artist, album);
      if (!String(requestedKey || '').trim()) return res.status(400).json({ ok: false, error: 'key or artist+album required' });

      const cache = await readCache();
      cache.entries = cache.entries || {};

      // Resolve key robustly (handles historical trailing-space keys)
      const keys = Object.keys(cache.entries || {});
      const reqNorm = String(requestedKey).trim().toLowerCase();
      let key = keys.find((k) => String(k || '').toLowerCase() === String(requestedKey || '').toLowerCase()) ||
                keys.find((k) => String(k || '').trim().toLowerCase() === reqNorm) || '';
      if (!key && artist && album) {
        const canonical = albumKey(artist, album);
        key = keys.find((k) => String(k || '').trim().toLowerCase() === canonical) || canonical;
      }

      const existing = cache.entries[key] || null;
      if (existing?.mp4H264) {
        const p = h264PathFromPublicUrl(existing.mp4H264);
        if (p) {
          try { await fs.unlink(p); } catch {}
        }
      }
      delete cache.entries[key];
      cache.updatedAt = new Date().toISOString();
      await writeCache(cache);
      return res.json({ ok: true, cleared: key });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/animated-art/discover', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (discoverJob && discoverJob.status === 'running') {
        return res.status(409).json({ ok: false, error: 'discovery already running', job: discoverJob });
      }
      const limitAlbums = Math.max(0, Math.min(20000, Number(req.body?.limitAlbums || 0)));
      discoverJob = {
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        total: 0,
        processed: 0,
        found: 0,
        misses: 0,
        errors: 0,
        message: 'Queued…',
      };
      runDiscoverJob({ limitAlbums }).catch((e) => {
        discoverJob = { ...(discoverJob || {}), status: 'error', message: String(e?.message || e), updatedAt: new Date().toISOString() };
      });
      return res.json({ ok: true, started: true, job: discoverJob });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/animated-art/build', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (activeJob && activeJob.status === 'running') {
        return res.status(409).json({ ok: false, error: 'build already running', job: activeJob });
      }
      const limitAlbums = Math.max(0, Math.min(20000, Number(req.body?.limitAlbums || 0)));
      const force = !!req.body?.force;
      const onlyKeys = Array.isArray(req.body?.onlyKeys) ? req.body.onlyKeys : [];
      activeJob = {
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        total: 0,
        processed: 0,
        matched: 0,
        misses: 0,
        skipped: 0,
        errors: 0,
        message: 'Queued…',
      };
      runBuildJob({ limitAlbums, force, onlyKeys }).catch((e) => {
        activeJob = {
          ...(activeJob || {}),
          status: 'error',
          message: String(e?.message || e),
          updatedAt: new Date().toISOString(),
        };
      });
      return res.json({ ok: true, started: true, job: activeJob });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
