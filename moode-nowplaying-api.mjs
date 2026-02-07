#!/usr/bin/env node
/**
 * moode-nowplaying-api.mjs -- moOde Now-Playing API (Pi4)
 *
 * Stable endpoints:
 *   GET  /now-playing
 *   GET  /next-up
 *   GET  /art/*
 *   GET/POST /rating
 *   POST /queue/*
 *   POST /mpd/*
 *
 * Optional (gated):
 *   GET /track           (ENABLE_ALEXA=0)
 *   GET /_debug/mpd
 *
 * This pass: organization + guardrails (avoid empty resolver calls) + comments only.
 * pm2 restart api --update-env && pm2 logs api --lines 20
 */

// =========================
// Imports (ESM / Node 16+)
// =========================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { exec, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import os from "node:os";



// If you already have FETCH_HEADERS, keep it; otherwise ensure it includes a UA.
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";


// Lazy-load podcast ops so API can boot even if podcast module is broken
let _podOps;
async function podOps() {
  if (_podOps) return _podOps;
  _podOps = await import('./podcasts/podcastOps.js'); // we will create this file next
  return _podOps;
}

import express from 'express';
import cors from 'cors';
import sharp from 'sharp';
const execFileP = promisify(execFile);


// ---- MUST BE BEFORE importing undici ----
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';

// Node 18 often has Blob but not File; undici expects File to exist globally.
if (!globalThis.Blob && NodeBlob) globalThis.Blob = NodeBlob;
if (!globalThis.File && NodeFile) globalThis.File = NodeFile;
// ----------------------------------------

import { ProxyAgent, setGlobalDispatcher, Agent } from 'undici';
import {
  FFMPEG, CURL, MPD_PLAYLIST_DIR, FAVORITES_PATH, MOODE_SSH_USER, MOODE_SSH_HOST, PORT,
  MOODE_BASE_URL, PUBLIC_BASE_URL, LOCAL_ADDRESS, MPD_HOST, MPD_PORT, MOODE_USB_PREFIX,
  PI4_MOUNT_BASE, METAFLAC, TRACK_KEY, ENABLE_ALEXA, TRANSCODE_TRACKS, TRACK_CACHE_DIR,
  FAVORITES_PLAYLIST_NAME, FAVORITES_REFRESH_MS, ITUNES_SEARCH_URL, ITUNES_COUNTRY,
  ITUNES_TIMEOUT_MS, ITUNES_TTL_HIT_MS, ITUNES_TTL_MISS_MS, ART_CACHE_DIR, ART_CACHE_LIMIT,
  ART_640_PATH, ART_BG_PATH, PODCAST_DL_LOG, MOODE_SSH, FAVORITES_M3U
} from './src/config.mjs';
import { log } from './src/lib/log.mjs';
import { execFileStrict } from './src/lib/exec.mjs';
import {
  mpdEscapeValue, mpdHasACK, parseMpdFirstBlock, parseMpdKeyVals,
  mpdGetStatus, mpdPlay, mpdPause, mpdStop, mpdQueryRaw
} from './src/services/mpd.service.mjs';
import { registerRatingRoutes } from './src/routes/rating.routes.mjs';
import { registerQueueRoutes } from './src/routes/queue.routes.mjs';
import { registerTrackRoutes } from './src/routes/track.routes.mjs';
import { registerArtRoutes } from './src/routes/art.routes.mjs';
import { registerPodcastSubscriptionRoutes } from './src/routes/podcasts-subscriptions.routes.mjs';

async function downloadLatestForRss({ rss, count = 10 }) {
  const items = readSubs();
  const sub = items.find(it => normUrl(it?.rss) === normUrl(rss));
  if (!sub) throw new Error("Subscription not found");

  await fsp.mkdir(sub.dir, { recursive: true });

  const feed = await fetchPodcastRSS(rss, Math.max(1, count));
  const episodes = Array.isArray(feed?.items) ? feed.items.slice(0, count) : [];

  function shortId(s) {
    const txt = String(s || "").trim();
    if (!txt) return "";
    return crypto.createHash("sha1").update(txt).digest("hex").slice(0, 12);
  }

  function pickDate(item) {
    return (
      item?.isoDate ||
      item?.pubDate ||
      item?.published ||
      item?.date ||
      item?.datePublished ||
      ""
    );
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  const localItems = []; // ✅ add this

  for (const item of episodes) {
    const enc = String(item?.enclosure || "").trim();
    if (!enc) continue;

    let ext = ".mp3";
    try {
      const u = new URL(enc);
      const base = path.basename(u.pathname) || "";
      const m = base.toLowerCase().match(/\.(mp3|m4a|aac|mp4)$/);
      if (m) ext = `.${m[1]}`;
    } catch {}

    const guidRaw = String(item?.guid || "").trim();
    const id = shortId(guidRaw || enc) || "episode";

    let filename = `${id}${ext}`;
    filename = safeFileName(filename, `episode${ext}`);

    const outPath = path.join(sub.dir, filename);

    // ✅ capture metadata now (even if already exists)
    const meta = {
      filename,
      enclosureUrl: enc,                        // key candidate
      title: String(item?.title || "").trim(),
      date: yyyyMmDd(pickDate(item)),           // YYYY-MM-DD
      published: (() => {
        const d = new Date(pickDate(item));
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      })()
    };

    if (fs.existsSync(outPath)) {
      skipped++;
      localItems.push(meta);
      continue;
    }

    try {
      await downloadWithFetch(enc, outPath);

      // tag (your existing code)
      try {
        await tagAudioFileWithFfmpeg(outPath, {
          title: meta.title || id,
          album: String(sub.title || "").trim() || "Podcast",
          artist: String(sub.title || "").trim() || "Podcast",
          date: meta.date || "",
          genre: "Podcast",
          comment: enc,
        });
      } catch {}

      downloaded++;
      localItems.push(meta);
    } catch (e) {
      failed++;
      // don’t add to localItems if it failed (so map reflects reality)
    }
  }

  return {
    ok: failed === 0,
    rss,
    dir: sub.dir,
    downloaded,
    skipped,
    failed,
    attempted: episodes.length,
    localItems // ✅ return it
  };
}




async function buildLocalPlaylistForRss({ rss, newestFirst = true }) {
  void newestFirst;

  const items = readSubs();
  const sub = items.find(it => normUrl(it?.rss) === normUrl(rss));
  if (!sub) throw new Error("Subscription not found after writeSubs()");

  const folder =
    path.basename(String(sub.mpdPrefix || sub.dir || "").trim()) || "podcast";

  const showDir = `/media/SamsungMoode/Podcasts/${folder}`;
  const plName  = folder; // <— no “-local”

  try {
    const { stdout, stderr } = await execFileStrict(
      "bash",
      ["/usr/local/bin/podcast_playlist.sh", showDir, plName]
    );

    console.log("[podcast_playlist] ok", { rss, showDir, plName });
    if ((stdout || "").trim()) console.log("[podcast_playlist] stdout:", stdout.trim());
    if ((stderr || "").trim()) console.log("[podcast_playlist] stderr:", stderr.trim());

    return { showDir, plName };
  } catch (e) {
    console.log("[podcast_playlist] FAIL", { rss, showDir, plName, error: e?.message || String(e) });
    throw e;
  }
}


const FETCH_HEADERS = {
    'user-agent': 'Mozilla/5.0',
    'accept': '*/*',
};

let lastArtKeyBuilt = '';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

function artKeyToSafeId(key) {
  // stable, short, filename-safe id
  return crypto.createHash('sha1').update(String(key || ''), 'utf8').digest('hex').slice(0, 20);
}

function artPath640ForKey(key) {
  return path.join(ART_CACHE_DIR, `${artKeyToSafeId(key)}_640.jpg`);
}

function artPathBgForKey(key) {
  return path.join(ART_CACHE_DIR, `${artKeyToSafeId(key)}_bg_640_blur.jpg`);
}

// --- Mother Earth metadata adapter (side-channel JSON API) ---

const MOTHER_EARTH = [
  {
    key: 'motherearth_jazz',
    match: /motherearth[_\.]?jazz/i, // matches motherearth_jazz or motherearth.jazz
    api: 'https://motherearth.streamserver24.com/api/nowplaying_static/motherearth_jazz.json',
    sourceLabel: 'Mother Earth Radio — Jazz',
    hiresLabel: '24/192',
  },
];

const meCache = new Map(); // key -> { ts, trackKey, meta }
const ME_TTL_MS = 5000;    // poll no more than every 5s per station

async function fetchMotherEarthMeta(entry) {
  const now = Date.now();
  const cached = meCache.get(entry.key);

  if (cached && (now - cached.ts) < ME_TTL_MS) return cached.meta;

  const res = await fetch(entry.api, { cache: 'no-store', agent: agentForUrl(entry.api) });
  if (!res.ok) throw new Error(`MotherEarth meta HTTP ${res.status}`);

  const j = await res.json();
  const np = j?.now_playing || null;
  const s  = np?.song || null;

  if (!np || !s) {
    if (cached) return cached.meta;
    return null;
  }

  const artist =
    (typeof s.artist === 'string' ? s.artist : '') ||
    (typeof s.artist?.name === 'string' ? s.artist.name : '') ||
    '';

  const title = String(s.title || '').trim();
  const album = String(s.album || '').trim();
  const art   = String(s.art || '').trim();
  const id    = String(s.id || '').trim();

  const trackKey = id || `${artist}||${title}||${album}`.toLowerCase();

  if (cached && cached.trackKey === trackKey) {
    cached.ts = now;
    meCache.set(entry.key, cached);
    return cached.meta;
  }

  const meta = {
    trackKey,
    artist,
    title,
    album,
    art,
    elapsed: Number(np.elapsed || 0),
    duration: Number(np.duration || 0),
    is_request: !!np.is_request,
  };

  meCache.set(entry.key, { ts: now, trackKey, meta });
  return meta;
}

function matchMotherEarthStation(currentFile) {
  if (!currentFile) return null;
  return MOTHER_EARTH.find(e => e.match.test(currentFile)) || null;
}

/* =========================
 * Express
 * ========================= */

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
 * Agents: LAN-bound vs default
 * ========================= */

const lanHttpAgent = new http.Agent({ keepAlive: true, localAddress: LOCAL_ADDRESS });
const lanHttpsAgent = new https.Agent({ keepAlive: true, localAddress: LOCAL_ADDRESS });
const defaultHttpAgent = new http.Agent({ keepAlive: true });
const defaultHttpsAgent = new https.Agent({ keepAlive: true });

function agentForUrl(url) {
  const s = String(url || '');
  const isLan =
    s.startsWith(MOODE_BASE_URL) ||
    s.startsWith('http://10.') ||
    s.startsWith('http://192.168.') ||
    s.startsWith('http://172.16.');

  const isHttps = s.startsWith('https:');
  if (isLan) return isHttps ? lanHttpsAgent : lanHttpAgent;
  return isHttps ? defaultHttpsAgent : defaultHttpAgent;
}

/* =========================
 * Podcasts
 * ========================= */



const PODCAST_MAP_DIR = "/home/brianwis/album_art/podcasts";

let _podcastCache = { loadedAt: 0, maps: [] };
const PODCAST_CACHE_MS = 60_000; // refresh once a minute

async function loadPodcastMaps() {
  const now = Date.now();
  if (now - _podcastCache.loadedAt < PODCAST_CACHE_MS) return _podcastCache.maps;

  const maps = [];
  try {
    const files = await fsp.readdir(PODCAST_MAP_DIR);

    for (const f of files) {
      if (!f.toLowerCase().endsWith(".json")) continue;

      const full = path.join(PODCAST_MAP_DIR, f);
      try {
        const raw = await fsp.readFile(full, "utf8");
        const parsed = JSON.parse(raw);

        // Only accept our lookup-map shape
        if (parsed && typeof parsed === "object" && parsed.itemsByUrl && typeof parsed.itemsByUrl === "object") {
          maps.push(parsed);
        }
      } catch {
        // ignore bad json
      }
    }
  } catch {
    // ignore missing dir, etc
  }

  _podcastCache = { loadedAt: now, maps };
  return maps;
}

function looksUnknownArtist(a) {
  if (!a) return true;
  const s = String(a).trim().toLowerCase();
  return s === "" || s === "unknown" || s === "unknown artist";
}

async function enrichPodcastNowPlaying(payload) {
    try {
        if (!payload || typeof payload !== 'object') return payload;

        const fileRaw = String(payload.file || '').trim();
        if (!fileRaw) return payload;

        // Only touch when artist is missing/unknown
        const artistIsMissing =
            !String(payload.artist || '').trim() || looksUnknownArtist(payload.artist);
        if (!artistIsMissing) return payload;

        const maps = await loadPodcastMaps();
        if (!Array.isArray(maps) || maps.length === 0) return payload;

        const isHttp = /^https?:\/\//i.test(fileRaw);

        // Build candidate keys
        const keys = [];

        if (isHttp) {
            const rawNoQ = fileRaw.split(/[?#]/)[0];
            const canon = canonicalizePodcastUrl(fileRaw);
            const canonNoQ = String(canon || '').split(/[?#]/)[0];

            keys.push(fileRaw, rawNoQ, canon, canonNoQ);

            const id = extractMegaphoneId(canonNoQ) || extractMegaphoneId(rawNoQ);
            if (id) keys.push(`id:${id}`);
        } else {
            // Local file path: match via id:<NPR...>
            const id = extractNprId(fileRaw) || extractMegaphoneId(fileRaw);
            if (id) keys.push(`id:${id}`);
        }

        for (const m of maps) {
            const itemsByUrl = m?.itemsByUrl;
            if (!itemsByUrl || typeof itemsByUrl !== 'object') continue;

            let hit = null;
            for (const k of keys) {
                if (!k) continue;
                hit = itemsByUrl[k];
                if (hit) break;
            }
            if (!hit) continue;

            const showTitle = String(
                hit.podcastTitle ||
                hit.showTitle ||
                hit.show ||
                hit.artist ||
                hit.album ||
                ''
            ).trim();

            const episodeTitle = String(hit.title || '').trim();
            const albumFromFeed = String(hit.album || '').trim();

            const publishedTs = hit.startDate ?? hit.published ?? hit.pubDate ?? null;
            const prettyDate = formatPodcastDate(publishedTs);

            if (showTitle) payload.artist = showTitle;
            if (episodeTitle) payload.title = episodeTitle;
            payload.album = albumFromFeed || prettyDate || payload.album || '';

            const img = String(hit.imageUrl || hit.image || '').trim();
            if (img) payload.albumArtUrl = img;

            payload.podcast = true;
            payload.isPodcast = true;
            payload.published = publishedTs;
            payload.episodeId = hit.episodeId ?? hit.guid ?? null;

            // For local files, playbackUrl can stay as fileRaw; for http prefer canon
            payload.playbackUrl = isHttp ? (canonicalizePodcastUrl(fileRaw) || fileRaw) : fileRaw;

            return payload;
        }

        return payload;
    } catch (e) {
        log.debug('[podcast] enrich failed', e?.message || String(e));
        return payload;
    }
}

/* =========================
 * UPnP Identify helpers
 * ========================= */


async function embedEpisodeArtMp3(inPath, imageUrl, opts = {}) {
  const logp = opts.logp || (() => {});
  if (!imageUrl) return { ok: false, skipped: true, reason: "no imageUrl" };

  // Optional: skip if already has embedded art
  if (opts.skipIfPresent) {
    try {
      const j = await execFileP("ffprobe", [
        "-v", "error",
        "-show_streams",
        "-of", "json",
        inPath
      ]);
      const parsed = JSON.parse(j.stdout || j); // depending on your exec wrapper
      const n = (parsed.streams || []).filter(s => s?.disposition?.attached_pic === 1).length;
      if (n > 0) return { ok: true, skipped: true, reason: "already has art" };
    } catch {}
  }

  const tmpImg = path.join(
    os.tmpdir(),
    `podart-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`
  );
  const tmpOut = `${inPath}.arttmp.mp3`;

  try {
    await downloadWithFetch(imageUrl, tmpImg);

    await execFileP("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-y",
      "-i", inPath,
      "-i", tmpImg,

      // audio + attached pic
      "-map", "0:a",
      "-map", "1:v",

      // preserve existing tags/chapters from the mp3
      "-map_metadata", "0",
      "-map_chapters", "0",

      "-c:a", "copy",
      "-c:v", "mjpeg",
      "-disposition:v:0", "attached_pic",

      // MP3 tagging compatibility
      "-id3v2_version", "3",

      "-metadata:s:v:0", "title=Album cover",
      "-metadata:s:v:0", "comment=Cover (Front)",

      tmpOut
    ]);

    // replace atomically-ish
    await fsp.rename(tmpOut, inPath).catch(async () => {
      await fsp.copyFile(tmpOut, inPath);
      await fsp.unlink(tmpOut).catch(() => {});
    });

    logp("embedded art", { inPath, imageUrl });
    return { ok: true, skipped: false };
  } finally {
    await fsp.unlink(tmpImg).catch(() => {});
    await fsp.unlink(tmpOut).catch(() => {});
  }
}

function isUpnpMediaItemUrl(file) {
  const f = String(file || '');
  return f.includes(':8200/MediaItems/');
}

function getStreamKind(file) {
  if (!isStreamPath(file)) return '';
  if (isUpnpMediaItemUrl(file)) return 'upnp';
  return 'radio';
}

/* =========================
 * Fetch helpers
 * ========================= */

// Robust downloader:
// - Uses fetch with browser-ish headers
// - Captures final URL + short body snippet on errors (helps diagnose CDN blocks)
// - Falls back to curl for 403/AccessDenied cases (Simplecast commonly does this)
// - Uses atomic temp file -> rename to avoid partial files
// - Retries with backoff

// Merge/override headers so we always have a decent UA.
function buildFetchHeaders(extra = {}) {
  const base = (typeof FETCH_HEADERS === "object" && FETCH_HEADERS) ? FETCH_HEADERS : {};
  const h = { ...base, ...extra };

  // Ensure some basics exist; CDNs sometimes gate on these.
  if (!h["User-Agent"] && !h["user-agent"]) h["User-Agent"] = DEFAULT_UA;
  if (!h["Accept"] && !h["accept"]) h["Accept"] = "*/*";
  if (!h["Accept-Language"] && !h["accept-language"]) h["Accept-Language"] = "en-US,en;q=0.9";
  if (!h["Connection"] && !h["connection"]) h["Connection"] = "keep-alive";

  return h;
}

async function safeUnlink(p) {
  try { await fsp.unlink(p); } catch {}
}

async function downloadToFileCurl(url, outPath, { timeoutSec = 180, retries = 3 } = {}) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.part`;

  await safeUnlink(tmp);

  // -f fail on HTTP errors
  // -L follow redirects
  // --retry for transient failures
  // -A set UA (critical for some CDNs)
  const args = [
    "-fLsS",
    "-L",
    "--retry", String(retries),
    "--retry-delay", "1",
    "--connect-timeout", "10",
    "--max-time", String(timeoutSec),
    "-A", DEFAULT_UA,
    "-o", tmp,
    url,
  ];

  try {
    await execFileP(CURL, args);
    await fsp.rename(tmp, outPath);
    return true;
  } finally {
    await safeUnlink(tmp);
  }
}

function isLikelyCdnBlock(errMsg, status, bodySnippet) {
  const s = String(errMsg || "");
  const b = String(bodySnippet || "");
  return (
    status === 403 ||
    /HTTP\s*403/i.test(s) ||
    /AccessDenied/i.test(s) ||
    /Access Denied/i.test(s) ||
    /<Code>AccessDenied<\/Code>/i.test(b) ||
    /cloudfront/i.test(b)
  );
}

async function downloadToFile(url, outPath, {
  retries = 3,
  timeoutMs = 120000,
  preferCurl = false,      // set true if you want to always use curl
  curlFallback = true,     // set false if you don't want curl fallback
  ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
} = {}) {
  const srcUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(srcUrl)) throw new Error(`downloadToFile: invalid url: ${srcUrl}`);
  if (!outPath) throw new Error(`downloadToFile: invalid outPath`);

  await ensureDir(path.dirname(outPath));

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function unlinkQuiet(p) { try { await fsp.unlink(p); } catch {} }

  async function curlDownload(u) {
    const maxTimeSec = Math.max(10, Math.ceil(timeoutMs / 1000));
    // -f fail on HTTP errors, -L follow redirects, -sS quiet but show errors, --compressed ok
    const args = [
      '-fLsS', '-L',
      '--max-time', String(maxTimeSec),
      '-A', ua,
      '-H', 'Accept: */*',
      '-o', outPath,
      u,
    ];

    // execFileP already exists in your file
    await execFileP('curl', args, { maxBuffer: 1024 * 1024 });
    const st = await fsp.stat(outPath);
    return { bytes: st.size || 0, finalUrl: null, method: 'curl' };
  }

  async function fetchDownload(u) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const r = await fetch(u, {
        redirect: 'follow',
        headers: {
          ...(typeof FETCH_HEADERS === 'object' ? FETCH_HEADERS : {}),
          'User-Agent': ua,
          'Accept': '*/*',
        },
        signal: controller.signal,
      });

      const finalUrl = r.url || u;

      if (!r.ok || !r.body) {
        // Try to capture a tiny bit of body for debugging (often XML AccessDenied)
        let bodySnippet = '';
        try {
          const txt = await r.text();
          bodySnippet = String(txt || '').slice(0, 300);
        } catch {}
        throw new Error(`HTTP ${r.status} finalUrl=${finalUrl} body=${bodySnippet}`);
      }

      // Stream to file
      const ws = fs.createWriteStream(outPath);
      const rs = Readable.fromWeb(r.body); // Node 18+
      await pipeline(rs, ws);

      const st = await fsp.stat(outPath);
      return { bytes: st.size || 0, finalUrl, method: 'fetch' };
    } finally {
      clearTimeout(t);
    }
  }

  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      await unlinkQuiet(outPath);

      const result = preferCurl
        ? await curlDownload(srcUrl)
        : await fetchDownload(srcUrl);

      await logPodcastDownload({
        ts: new Date().toISOString(),
        ok: true,
        url: srcUrl,
        outPath,
        bytes: result.bytes,
        ms: Date.now() - started,
        attempt,
        method: result.method,
        finalUrl: result.finalUrl || '',
      });

      return true;

    } catch (e) {
      lastErr = e;
      await unlinkQuiet(outPath);

      await logPodcastDownload({
        ts: new Date().toISOString(),
        ok: false,
        url: srcUrl,
        outPath,
        err: String(e?.message || e),
        ms: Date.now() - started,
        attempt,
      });

      // If fetch fails with 403/404-ish and curlFallback is enabled, try curl immediately
      const msg = String(e?.message || e);
      const looksLike403or404 = /HTTP\s+(403|404)\b/.test(msg) || /AccessDenied/i.test(msg);

      if (!preferCurl && curlFallback && looksLike403or404) {
        try {
          const r2 = await curlDownload(srcUrl);
          await logPodcastDownload({
            ts: new Date().toISOString(),
            ok: true,
            url: srcUrl,
            outPath,
            bytes: r2.bytes,
            ms: Date.now() - started,
            attempt,
            method: r2.method,
            finalUrl: '',
          });
          return true;
        } catch (e2) {
          lastErr = e2;
          await unlinkQuiet(outPath);
        }
      }

      if (attempt < retries) await sleep(750 * attempt);
    }
  }

  throw lastErr || new Error('download failed');
}


async function safeRmDir(p) {
  try {
    if (!p) return;
    await fsp.rm(p, { recursive: true, force: true });
  } catch {}
}

async function ensureDir(p) {
  const s = String(p || '').trim();
  if (!s) throw new Error('ensureDir: empty path');

  const dir = path.extname(s) ? path.dirname(s) : s;
  await fs.promises.mkdir(dir, { recursive: true });
}


async function hasAttachedPic(mp3Path) {
  // returns true if ffprobe finds attached_pic stream
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-of', 'json',
      mp3Path
    ], { timeout: 10000 });

    const j = JSON.parse(stdout || '{}');
    const streams = Array.isArray(j.streams) ? j.streams : [];
    return streams.some(s => s?.disposition?.attached_pic === 1);
  } catch {
    return false;
  }
}

async function embedArtWithFfmpeg({ mp3In, imgIn, mp3Out, title, show, date }) {
  // date: prefer YYYY-MM-DD; show = podcast name; title = episode title
  const args = [
    "-hide_banner", "-y", "-loglevel", "error",
    "-i", mp3In,
    "-i", imgIn,
    "-map", "0:a",
    "-map", "1:v",
    "-c", "copy",

    // IMPORTANT: do NOT inherit random source tags
    "-map_metadata", "-1",

    // Prefer v4 so TDRC can hold full YYYY-MM-DD.
    "-id3v2_version", "4",

    "-metadata", `title=${title || ""}`,
    "-metadata", `artist=${show || ""}`,
    "-metadata", `album=${show || ""}`,
    "-metadata", `genre=Podcast`,

    // Full date (v2.4). If you keep id3v2_version 3, this often collapses to just the year.
    ...(date ? ["-metadata", `TDRC=${date}`] : []),

    "-metadata:s:v", "title=Cover (front)",
    "-metadata:s:v", "comment=Cover (front)",
    "-disposition:v:0", "attached_pic",

    mp3Out
  ];

  await execFileP(FFMPEG, args, { maxBuffer: 1024 * 1024 * 20 });
}

// atomic replace within same filesystem
async function replaceFileAtomic(src, dest) {
  const dir = path.dirname(dest);
  await ensureDir(dir);

  const tmp = path.join(dir, `.${path.basename(dest)}.${process.pid}.${Date.now()}.tmp`);
  await fsp.copyFile(src, tmp);
  await fsp.rename(tmp, dest);
}

function sha256Hex(buf) {
  try { return crypto.createHash('sha256').update(buf).digest('hex'); }
  catch { return 'sha256_err'; }
}  
  
  
// ---- single writer of pod-*.json and pod-*.m3u
// Reads disk -> writes mapJson + outM3u
async function rebuildPodcastLocalIndex(sub, opts = {}) {
    const logp = opts.logp || ((...a) => console.log("[rebuild]", ...a));

    const dir = String(sub?.dir || "").trim();
    const mpdPrefix = String(sub?.mpdPrefix || "").replace(/\/+$/, "");
    const mapJson = String(sub?.mapJson || "").trim();
    const outM3u = String(sub?.outM3u || "").trim();

    if (!dir || !mpdPrefix || !mapJson || !outM3u) {
        throw new Error("rebuildPodcastLocalIndex: sub missing dir/mpdPrefix/mapJson/outM3u");
    }

    const AUDIO_RE = /\.(mp3|m4a|aac|mp4|ogg|flac)$/i;

    // 1) Read disk (SMB-safe: no withFileTypes)
    const localByStem = Object.create(null); // stem -> { filename, mtimeMs, size }
    let names = [];
    try {
        names = await fsp.readdir(dir);
    } catch (e) {
        // Directory missing/unmounted: write empty map/m3u
        names = [];
    }

    for (const name of names) {
        if (!AUDIO_RE.test(name)) continue;

        const stem = String(name).replace(/\.[^.]+$/, "").trim().toLowerCase();
        if (!stem) continue;

        const full = path.join(dir, name);
        try {
            const st = await fsp.stat(full);
            if (!st.isFile()) continue;
            localByStem[stem] = { filename: name, mtimeMs: st.mtimeMs || 0, size: st.size || 0 };
        } catch {}
    }

    const stems = Object.keys(localByStem);
    logp("disk scan", { dir, localCount: stems.length });

    // 2) (Optional) Enrich from RSS so titles/dates are accurate
    // This keeps pod-*.json meaningful, but doesn't affect modal correctness.
    let rssMetaByStem = Object.create(null);

    if (opts.enrichFromRss !== false && sub?.rss) {
        try {
            const scanLimit = Math.max(1, Math.min(500, Number(opts.limit || sub.limit || 200)));
            const feed = await fetchPodcastRSS(sub.rss, scanLimit);
            const feedItems = Array.isArray(feed?.items) ? feed.items : [];

            // cache canonicalization to avoid repeated resolves in one rebuild
            const canonCache = new Map();

            async function stemForFeedItem(ep) {
                const guid = String(ep?.guid || "").trim();
                if (guid) {
                    return crypto.createHash("sha1").update(guid).digest("hex").slice(0, 12).toLowerCase();
                }

                const rawUrl = String(ep?.enclosure || "").trim();
                if (!rawUrl) return "";

                let canonUrl = canonCache.get(rawUrl);
                if (!canonUrl) {
                    let finalUrl = "";
                    try { finalUrl = await resolveFinalUrl(rawUrl); } catch {}
                    canonUrl = stripQueryHash(finalUrl || rawUrl);
                    canonCache.set(rawUrl, canonUrl);
                }

                if (!canonUrl) return "";
                return crypto.createHash("sha1").update(canonUrl).digest("hex").slice(0, 12).toLowerCase();
            }

            for (const ep of feedItems) {
                const stem = await stemForFeedItem(ep);
                if (!stem) continue;

                // only store meta if that stem exists locally (keeps it fast and relevant)
                if (!localByStem[stem]) continue;

                rssMetaByStem[stem] = {
                    title: String(ep?.title || "").trim(),
                    date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || ""),
                    published:
                        (typeof ep?.published === "number") ? ep.published :
                        (() => {
                            const d = new Date(ep?.isoDate || ep?.pubDate || ep?.date || "");
                            const t = d.getTime();
                            return Number.isFinite(t) ? t : null;
                        })()
                };
            }

            logp("rss enrich", { rss: sub.rss, matchedLocal: Object.keys(rssMetaByStem).length });
        } catch (e) {
            logp("rss enrich failed (non-fatal)", { error: e?.message || String(e) });
        }
    }

    // 3) Build itemsByUrl + m3u lines (local only)
    const showTitle = String(sub?.title || "Podcast").trim() || "Podcast";
    const imageUrl = String(sub?.imageUrl || "").trim();

    // Order: newest first by RSS published if present, else by mtime
    const ordered = stems
        .map(stem => {
            const local = localByStem[stem];
            const meta = rssMetaByStem[stem] || {};
            return {
                stem,
                filename: local.filename,
                mtimeMs: local.mtimeMs || 0,
                title: meta.title || "",
                date: meta.date || "",
                published: (typeof meta.published === "number") ? meta.published : null
            };
        })
        .sort((a, b) => (b.published || 0) - (a.published || 0) || (b.mtimeMs - a.mtimeMs));

    const itemsByUrl = Object.create(null);
    const lines = [];

    for (const it of ordered) {
        const key = `id:${it.stem}`;
        const mpdFile = `${mpdPrefix}/${it.filename}`;

        itemsByUrl[key] = {
            artist: showTitle,
            album: showTitle,
            title: it.title || "(untitled)",
            date: it.date || "",
            genre: "Podcast",
            imageUrl,
            file: mpdFile,
            filename: it.filename
        };

        lines.push(mpdFile);
    }

    // 4) Write files atomically
    await fsp.mkdir(path.dirname(mapJson), { recursive: true });
    await fsp.writeFile(mapJson, JSON.stringify({ itemsByUrl }, null, 2) + "\n", "utf8");

    await fsp.mkdir(path.dirname(outM3u), { recursive: true });
    await fsp.writeFile(outM3u, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");

    return {
        localCount: stems.length,
        mapCount: Object.keys(itemsByUrl).length,
        m3uCount: lines.length
    };
}

function stemFromFilename(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function yyyyMmDd(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// List locally-downloaded audio files for a subscription.
// Returns: [{ filename, path, size, mtimeMs }]


async function syncSubscriptionInitial({ sub, limit, downloadCount }) {
  // 1) Download N newest (this should be the ONLY place that decides episode art embedding)
  const dl = await downloadLatestForRss({
    rss: sub.rss,
    count: downloadCount
  });

  // 2) SINGLE WRITER (disk -> pod-*.json + pod-*.m3u, with RSS enrich)
  const rebuilt = await rebuildPodcastLocalIndex(sub, {
    enrichFromRss: true,
    limit: Math.max(1, Math.min(500, Number(limit || sub.limit || 200)))
  });

  // 3) Keep moOde playlist in sync
  await buildLocalPlaylistForRss({ rss: sub.rss });

  return {
    downloaded: dl.downloaded,
    skipped: dl.skipped,
    failed: dl.failed,
    mapCount: rebuilt.mapCount,
    m3uCount: rebuilt.m3uCount
  };
}

async function downloadCoverForSub(sub, feed) {
  // IMPORTANT:
  // - Show cover must be show-level ONLY (channel itunes:image / channel image.url)
  // - Never fall back to items[0].image (that’s “latest episode art everywhere”)
  const imgUrl =
    String(feed?.imageUrl || "").trim() ||
    String(feed?.titleImage || "").trim(); // optional future field

  if (!imgUrl) {
    console.log("[podcast_cover] no SHOW image url in feed", { rss: sub.rss, title: sub.title });
    return { ok: false, reason: "no-show-image-url" };
  }

  const outPath = path.join(sub.dir, "cover.jpg");

  try {
    await downloadWithFetch(imgUrl, outPath);
    console.log("[podcast_cover] ok", { imgUrl, outPath });
    return { ok: true, imgUrl, outPath };
  } catch (e) {
    console.log("[podcast_cover] fail", { imgUrl, outPath, error: e?.message || String(e) });
    return { ok: false, imgUrl, outPath, error: e?.message || String(e) };
  }
}

function moodePathFromPi4Mount(p) {
  // Pi4 sees Samba mount as /mnt/..., moOde uses /media/...
  return String(p || '').replace(/^\/mnt\//, '/media/');
}

function shQuote(s) {
  // safe for single-quoted shell strings
  return `'${String(s || '').replace(/'/g, `'\\''`)}'`;
}

async function pushPlaylistCoverToMoode(sub) {
  const showTitle = String(sub?.title || 'Podcast').trim() || 'Podcast';

  // Source is the cover you already downloaded into the show folder (on moOde's filesystem)
  const moodeShowDir = moodePathFromPi4Mount(sub.dir);
  const src = path.join(moodeShowDir, 'cover.jpg');

  // Destination is moOde's playlist cover cache
  const dst = `/var/local/www/imagesw/playlist-covers/${safeFileName(showTitle, 'Podcast')}.jpg`;

  // You already have ssh working (you used it manually), so automate it:
  // - copy cover into playlist-covers
  // - fix perms so nginx can serve it
  const cmd =
    `sudo cp -f ${shQuote(src)} ${shQuote(dst)} && ` +
    `sudo chmod 644 ${shQuote(dst)} && ` +
    `sudo chown root:root ${shQuote(dst)} && ` +
    `ls -lah ${shQuote(dst)}`;

  // Reuse whatever SSH helper you already have for Favorites (favoritesSetViaSsh etc).
  // If you DON'T have a generic helper, simplest is execFile('ssh', ...)
  await execFileP('ssh', ['moode@10.0.0.254', cmd]);

  console.log('[podcast_cover] pushed playlist cover', { src, dst });
  return { ok: true, src, dst };
}

async function fetchFollow(url, headers, maxHops = 10) {
  let current = url;

  for (let hop = 0; hop < maxHops; hop++) {
    const resp = await fetch(current, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    // Follow 3xx ourselves so we can re-send headers each hop
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) throw new Error(`Redirect ${resp.status} without Location (at hop ${hop})`);
      const next = new URL(loc, current).toString();
      console.log("[podcast_dl] redirect", { hop, status: resp.status, from: current, to: next });
      current = next;
      continue;
    }

    return { resp, finalUrl: current, hop };
  }

  throw new Error(`Too many redirects (>${maxHops})`);
}

async function downloadWithFetch(enclosureUrl, outPath) {
  const headers = {
    // Keep these across hops
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Accept": "*/*",
    // Important: your successful curl used Range
    "Range": "bytes=0-",
  };

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const { resp, finalUrl } = await fetchFollow(enclosureUrl, headers);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.log("[podcast_dl] FAIL", {
      status: resp.status,
      finalUrl,
      body: body.slice(0, 300),
    });
    throw new Error(`HTTP ${resp.status} finalUrl=${finalUrl} body=${body.slice(0, 120)}`);
  }

  // Stream to disk
  const fileHandle = await fs.promises.open(outPath, "w");
  try {
    const nodeStream = Readable.fromWeb(resp.body);
    await pipeline(nodeStream, fileHandle.createWriteStream());
  } finally {
    await fileHandle.close();
  }

  console.log("[podcast_dl] OK", { finalUrl, outPath, status: resp.status });
  return { ok: true, finalUrl, status: resp.status };
}

function dispatcherForUrl(url) {
  const u = new URL(url);
  const proxy =
    (u.protocol === 'https:' ? process.env.HTTPS_PROXY : process.env.HTTP_PROXY) ||
    process.env.ALL_PROXY;

  if (proxy) return new ProxyAgent(proxy);
  return undefined; // no custom dispatcher needed
}

function getArg(flag) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return '';
    const v = process.argv[i + 1];
    return (v && !v.startsWith('--')) ? v : '';
}

function getArgNum(flag, fallback) {
    const v = getArg(flag);
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
 
export async function fetchPodcastRSS(url, limit = 10) {
  const xml = await (await fetch(url)).text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(xml);

  const channel = feed?.rss?.channel;
  if (!channel) return { title: "", imageUrl: "", items: [] };

  const title = String(channel?.title || "").trim();

  const showImageUrl = String(
    channel?.["itunes:image"]?.["@_href"] ||
    channel?.image?.url ||
    ""
  ).trim();

  const rawItems = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  const n = Math.max(0, Number(limit) || 0);
  const items = rawItems.slice(0, n);

  const mapped = items.map((i) => {
    const enclosure = String(i?.enclosure?.["@_url"] || "").trim();
    const guid = String(i?.guid?.["#text"] || i?.guid || "").trim();

    // Episode-level artwork (preferred for embedding) if present
    const episodeImageUrl = String(i?.["itunes:image"]?.["@_href"] || "").trim();

    // For UI display, fall back to show art if no episode art
    const image = String(
      i?.["itunes:image"]?.["@_href"] ||
      i?.["itunes:image"]?.["#text"] ||
      i?.["media:thumbnail"]?.["@_url"] ||
      i?.["media:content"]?.["@_url"] ||
      showImageUrl ||
      ""
    ).trim();

    let date = null;
    if (i?.pubDate) {
      const d = new Date(i.pubDate);
      if (Number.isFinite(d.getTime())) date = d;
    }

    return {
      podcastTitle: title,
      title: String(i?.title || "").trim(),
      date,
      enclosure,
      guid,
      image,           // display
      episodeImageUrl, // embed preference
    };
  });

  return {
    title,
    imageUrl: showImageUrl,
    items: mapped,
  };
}

function canonicalizePodcastUrl(u) {
  const s0 = String(u || '').trim();
  if (!s0) return '';

  // Strip query/hash early (stable key)
  const s = s0.split(/[?#]/)[0];

  // 1) Already a direct Megaphone URL? Normalize host to traffic.megaphone.fm
  //    Handles:
  //    - https://traffic.megaphone.fm/NPR123.mp3
  //    - https://dcs.megaphone.fm/NPR123.mp3
  //    - .../traffic.megaphone.fm/NPR123.mp3 (wrapped)
  //    - .../dcs.megaphone.fm/NPR123.mp3 (wrapped)
  {
    const m = s.match(/(?:^|\/)(?:traffic|dcs)\.megaphone\.fm\/([^\/]+\.mp3)$/i);
    if (m && m[1]) return `https://traffic.megaphone.fm/${m[1]}`;
  }

  // 2) NPR-style IDs anywhere after megaphone.fm/
  //    (covers odd wrappers where host/path changes but the MP3 ID is still there)
  {
    const m = s.match(/megaphone\.fm\/(NPR[^\/]+\.mp3)$/i);
    if (m && m[1]) return `https://traffic.megaphone.fm/${m[1]}`;
  }

  // 3) Generic: find *any* megaphone mp3 filename at the end of the URL
  //    (keeps working if they ever stop using NPR-prefixed ids)
  {
    const m = s.match(/megaphone\.fm\/([^\/]+\.mp3)$/i);
    if (m && m[1]) return `https://traffic.megaphone.fm/${m[1]}`;
  }

  // Fallback: just the stripped URL
  return s;
}

function prettyDate(d) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// Build + write a JSON sidecar ({ itemsByUrl }) alongside an .m3u playlist
export async function writePodcastUrlMap({ episodes, outM3u }) {
  if (!Array.isArray(episodes)) {
    throw new Error("writePodcastUrlMap: episodes must be an array");
  }

  const m3uPath = String(outM3u || "").trim();
  if (!m3uPath) {
    throw new Error("writePodcastUrlMap: missing outM3u");
  }

  const itemsByUrl = Object.create(null);
  let episodeCount = 0;

  function toValidDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  for (const ep of episodes) {
    const rawUrl = String(ep?.enclosure || "").trim();
    if (!rawUrl) continue;

    const canonUrl = canonicalizePodcastUrl(rawUrl);
    if (!canonUrl) continue;

    episodeCount++;

    const podcastTitle = String(ep?.podcastTitle || "").trim() || "Podcast";
    const publishedDate = toValidDate(ep?.date);

    const item = {
      // ---- CANONICAL PODCAST TAGS (keep stable for moOde + MPD)
      artist: podcastTitle, // show
      album: podcastTitle,  // show
      title: String(ep?.title || "").trim(),
      date: publishedDate ? publishedDate.toISOString().slice(0, 10) : "", // YYYY-MM-DD
      genre: "Podcast",

      // ---- EXTRAS (UI / debugging)
      published: publishedDate ? publishedDate.getTime() : null,
      imageUrl: String(ep?.image || "").trim(),
      guid: String(ep?.guid || "").trim(),
    };

    // Keys that MPD may report as the "current file"
    const keys = new Set();

    // 1) Canonical enclosure URL
    keys.add(canonUrl);

    // 2) Raw URL without query/hash
    const rawNoQ = rawUrl.split(/[?#]/)[0].trim();
    if (rawNoQ) keys.add(rawNoQ);

    // 3) Canonicalized no-query URL
    const canonNoQ = rawNoQ ? canonicalizePodcastUrl(rawNoQ) : "";
    if (canonNoQ) keys.add(canonNoQ);

    // 4) Stable ID key (NPR-style)
    const stableId =
      extractNprId(canonUrl) ||
      extractNprId(rawNoQ) ||
      extractNprId(rawUrl);

    if (stableId) keys.add(`id:${stableId}`);

    // First key wins (preserve earliest mapping for each key)
    for (const k of keys) {
      if (!k) continue;
      if (itemsByUrl[k] === undefined) itemsByUrl[k] = item;
    }
  }

  const outJson = m3uPath.replace(/\.m3u$/i, ".json");
  await fsp.writeFile(outJson, JSON.stringify({ itemsByUrl }, null, 2), "utf8");

  const keyCount = Object.keys(itemsByUrl).length;
  log.info(`[podcast] wrote map -> ${outJson} (episodes=${episodeCount}, keys=${keyCount})`);

  return { outJson, episodeCount, keyCount };
}

/**
 * Art cache directory alias:
 * We keep ART_DIR as your “public-known” name, but internally we can refer to ART_CACHE_DIR
 * without renaming everything.
 */


async function fetchText(url, accept = 'text/plain') {
  const resp = await fetch(url, {
    headers: { Accept: accept },
    agent: agentForUrl(url),
    cache: 'no-store',
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 200)}`);
  return text;
}

async function fetchJson(url) {
  const text = await fetchText(url, 'application/json');
  if (!text.trim()) throw new Error(`Empty JSON body from ${url}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Bad JSON from ${url}: ${e.message}. Body: ${text.slice(0, 200)}`);
  }
}

async function fetchJsonWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      agent: agentForUrl(url),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 200)}`);
    if (!text.trim()) throw new Error(`Empty JSON body from ${url}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/* =========================
 * Basic helpers
 * ========================= */
 
function sha1_12(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex").slice(0, 12);
}


function metaByStemFromFeed(feed) {
  const m = Object.create(null);
  const items = Array.isArray(feed?.items) ? feed.items : [];

  for (const ep of items) {
    const guid = String(ep?.guid || "").trim();
    const rawUrl = String(ep?.enclosure || "").trim();

    // MUST match your download naming: seed = guid || canonUrl
    // For rebuild we can safely use guid when present (Pivot has guid).
    const stem = guid ? sha1_12(guid) : (rawUrl ? sha1_12(stripQueryHash(rawUrl)) : "");
    if (!stem) continue;

    m[stem] = {
      title: String(ep?.title || "").trim(),
      date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ""),
      published: (() => {
        const d = new Date(ep?.isoDate || ep?.pubDate || ep?.published || "");
        return Number.isFinite(d.getTime()) ? d.getTime() : null;
      })(),
      enclosure: rawUrl,
      guid
    };
  }

  return m;
}

function safeMeta(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}


async function tagAudioFileWithFfmpeg(inPath, meta) {
  const dir = path.dirname(inPath);
  const ext = (path.extname(inPath) || ".mp3").toLowerCase();
  const tmp = path.join(dir, `.tmp_tag_${crypto.randomBytes(6).toString("hex")}${ext}`);

  const args = [
    "-y",
    "-i", inPath,
    "-map", "0",
    "-c", "copy",

    // MP3: make ID3 tags readable everywhere
    ...(ext === ".mp3" ? ["-id3v2_version", "3", "-write_id3v1", "1"] : []),

    "-metadata", `title=${safeMeta(meta?.title)}`,
    "-metadata", `album=${safeMeta(meta?.album)}`,
    "-metadata", `artist=${safeMeta(meta?.artist)}`,
    ...(meta?.date ? ["-metadata", `date=${safeMeta(meta.date)}`] : []),
    "-metadata", `genre=${safeMeta(meta?.genre || "Podcast")}`,
    ...(meta?.comment ? ["-metadata", `comment=${safeMeta(meta.comment)}`] : []),

    tmp,
  ];

  await execFileStrict(FFMPEG, args);
  await fsp.rename(tmp, inPath);
}
 
async function writeFileAtomic(destPath, data) {
  const p = String(destPath || '').trim();
  if (!p) throw new Error('writeFileAtomic: empty destPath');

  const dir = path.dirname(p);
  await fs.promises.mkdir(dir, { recursive: true });

  // Unique temp name in same directory (atomic rename on same filesystem)
  const tmp = path.join(
    dir,
    `.${path.basename(p)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );

  // Write + fsync file to reduce risk of truncated/corrupt outputs
  const fh = await fs.promises.open(tmp, 'w');
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fh.writeFile(buf);
    await fh.sync();
  } finally {
    await fh.close().catch(() => {});
  }

  // Atomic replace
  await fs.promises.rename(tmp, p);

  // Best-effort: fsync directory entry (helps on power loss)
  try {
    const dh = await fs.promises.open(dir, 'r');
    try { await dh.sync(); } finally { await dh.close(); }
  } catch {
    // ignore
  }
}
 
function normalizeArtKey(input) {
  const s = String(input || '').trim();
  if (!s) return '';

  // Treat moOde-relative paths as stable keys too
  // Examples:
  //  - /coverart.php/USB/...
  //  - https://npr.brightspotcdn.com/...
  //  - http://10.0.0.254/coverart.php/...
  try {
    // If it's an absolute URL, normalize it (strip trivial differences)
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      // Normalize host casing + remove default ports
      u.host = u.host.toLowerCase();
      if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
        u.port = '';
      }
      // Keep query because some CDNs use it for cache-busting; but you can optionally prune known junk.
      return u.toString();
    }
  } catch {
    // fall through
  }

  // For relative paths (like /coverart.php/...), keep as-is but collapse duplicate slashes
  return s.replace(/\/{2,}/g, '/');
}

// Write an .m3u playlist from episode enclosure URLs
export async function writePodcastM3u({ episodes, outM3u }) {
  if (!Array.isArray(episodes)) throw new Error('writePodcastM3u: episodes must be an array');
  if (!outM3u) throw new Error('writePodcastM3u: missing outM3u');

  await fsp.mkdir(path.dirname(outM3u), { recursive: true });

  const lines = ['#EXTM3U'];
  let n = 0;

  for (const ep of episodes) {
    const url = String(ep?.enclosure || '').trim();
    if (!url) continue;

    const title  = String(ep?.title || '').trim();
    const artist = String(ep?.podcastTitle || 'Podcast').trim();

    // Duration unknown; MPD will fetch the URL directly
    lines.push(`#EXTINF:-1,${artist} - ${title}`);
    lines.push(url);
    n++;
  }

  await fsp.writeFile(outM3u, lines.join('\n') + '\n', 'utf8');
  return { outM3u, count: n };
}
 
function formatPodcastDate(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
 
function parseQuotedAttrs(raw) {
  const s = String(raw || '');
  if (!/title\s*=\s*"/i.test(s) && !/artist\s*=\s*"/i.test(s)) return null;

  const out = {};
  // matches: key="value" allowing newlines inside value
  const re = /([A-Za-z0-9_]+)\s*=\s*"([\s\S]*?)"/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const k = m[1].toLowerCase();
    const v = m[2].replace(/\s+/g, ' ').trim(); // collapse weird whitespace/newlines
    out[k] = v;
  }

  // Only “accept” it if it looks like the iHeart style blob
  if (!out.title && !out.artist) return null;
  return out;
}
 
function parseIheartTitleBlob(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    // ✅ iHeart sponsor ads: hard stop
    if (/(^|[\s,])adContext="[^"]+"/i.test(s)) {
        return {
            artist: 'Sponsor Ad',
            title: 'Sponsor Ad',
            artUrl: '',
            raw: s,
            fields: {},
        };
    }

    // 1) Prefix artist: everything before ' - text='
    let artistPrefix = '';
    {
        const m = s.match(/^(.*?)\s*-\s*text="/i);
        if (m && m[1]) artistPrefix = m[1].trim();
    }

    // 2) Extract key="value" pairs
    const out = {};
    const re = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        out[m[1]] = m[2];
    }

    const cleanTitle = (out.text || '').trim();
    const art = (out.amgArtworkURL || '').trim();

    return {
        artist: artistPrefix,
        title: cleanTitle,
        artUrl: art,
        raw: s,
        fields: out,
    };
}
 
function splitTitlePerformersProgram(titleLine) {
  const raw = String(titleLine || '').trim();
  if (!raw) return null;

  // Normalize spacing around dashes
  const parts = raw.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);

  if (parts.length < 3) return null; // need "work - performers - program" shape

  const program = parts.pop();        // last
  const perfRaw = parts.pop();        // second last
  const work    = parts.join(' - ');  // rest (preserve inner dashes)

  // Turn "David Zinman, Baltimore Symphony Orchestra" into separate-ish personnel items
  const personnel = perfRaw
    .split(/\s*,\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  return { work, personnel, program };
}

function clampRating(v) {
  // Accept number or numeric string; return integer 0..5, or null if invalid
  if (v === null || v === undefined) return null;

  const n = Number(v);
  if (!Number.isFinite(n)) return null;

  const i = Math.round(n); // or Math.trunc(n) if you prefer
  if (i < 0 || i > 5) return null;
  return i;
}

function isStreamPath(file) {
  return !!file && file.includes('://');
}

function isAirplayFile(file) {
  return String(file || '').toLowerCase() === 'airplay active';
}


function moodeValByKey(raw, keyOrIndex) {
  if (!raw) return '';

  if (typeof keyOrIndex === 'number') {
    const s = raw?.[String(keyOrIndex)];
    if (typeof s !== 'string') return '';
    const i = s.indexOf(':');
    return i >= 0 ? s.slice(i + 1).trim() : s.trim();
  }

  const want = String(keyOrIndex).toLowerCase().trim() + ':';
  for (const v of Object.values(raw)) {
    if (typeof v !== 'string') continue;
    const line = v.trim();
    if (line.toLowerCase().startsWith(want)) {
      const i = line.indexOf(':');
      return i >= 0 ? line.slice(i + 1).trim() : line.trim();
    }
  }
  return '';
}

function normalizeMoodeStatus(raw) {
  const state = moodeValByKey(raw, 'state');
  const timeStr = moodeValByKey(raw, 'time');
  const elapsedStr = moodeValByKey(raw, 'elapsed');
  const durationStr = moodeValByKey(raw, 'duration');

  let elapsed = 0;
  let duration = 0;

  if (timeStr && String(timeStr).includes(':')) {
    const parts = String(timeStr).trim().split(':').map(s => s.trim());
    if (parts.length >= 2) {
      const e = Number.parseFloat(parts[0]);
      const d = Number.parseFloat(parts[1]);
      if (Number.isFinite(e)) elapsed = e;
      if (Number.isFinite(d)) duration = d;
    }
  }

  if (!(duration > 0)) {
    const e2 = Number.parseFloat(elapsedStr);
    const d2 = Number.parseFloat(durationStr);
    if (Number.isFinite(e2)) elapsed = e2;
    if (Number.isFinite(d2)) duration = d2;
  }

  const percent = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
  return { state, elapsed, duration, percent, time: timeStr };
}

function normalizeCoverUrl(coverurl, baseUrl = MOODE_BASE_URL) {
  const s = String(coverurl || '').trim();
  if (!s) return '';

  if (/^https?:\/\//i.test(s)) return s;

  // Fix accidental "http://host/http://host/..." duplication
  const m = s.match(/^(https?:\/\/[^/]+)\/(https?:\/\/.+)$/i);
  if (m) return m[2];

  const prefix = s.startsWith('/') ? '' : '/';
  return `${baseUrl}${prefix}${s}`;
}

function extractYear(str) {
  const m = String(str || '').match(/\b(\d{4})\b/);
  return m ? m[1] : '';
}

function requireTrackKey(req, res) {
  if (!TRACK_KEY) return true;
  const k = String(req.query.k || '') || String(req.headers['x-track-key'] || '');
  if (k !== TRACK_KEY) {
    res.status(403).send('Forbidden');
    return false;
  }
  return true;
}
/* =========================
 * MPD helpers
 * ========================= */
 
async function getMpdCurrentDateTag() {
  try {
    // Uses your existing execFileP and MPD_HOST/MPD_PORT envs
    const args = ['-h', String(MPD_HOST || '127.0.0.1'), '-p', String(MPD_PORT || '6600'), '-f', '%date%', 'current'];
    const { stdout } = await execFileP('mpc', args, { timeout: 4000 });

    const s = String(stdout || '').trim();
    // common cases: "2026-02-05" or "20260205" or "2026"
    return s;
  } catch {
    return '';
  }
}

async function podcastsListHandler(req, res) {
  const items = readSubs();

  const enriched = items.map(it => {
    let n = null;
    let lastBuilt = "";

    // Prefer mapJson for count + time
    try {
      if (it.mapJson && fs.existsSync(it.mapJson)) {
        const st = fs.statSync(it.mapJson);
        lastBuilt = st.mtime.toISOString();

        const j = JSON.parse(fs.readFileSync(it.mapJson, "utf8"));
        const keys = j?.itemsByUrl ? Object.keys(j.itemsByUrl) : [];
        n = keys.length;
      }
    } catch {}

    // Fallback: if we have an M3U, use its mtime (and optionally count URLs)
    try {
      if ((!lastBuilt || n === null) && it.outM3u && fs.existsSync(it.outM3u)) {
        const st = fs.statSync(it.outM3u);
        if (!lastBuilt) lastBuilt = st.mtime.toISOString();

        if (n === null) {
          const txt = fs.readFileSync(it.outM3u, "utf8");
          // count non-empty, non-# lines (URLs)
          n = txt.split(/\r?\n/).filter(line => {
            const s = line.trim();
            return s && !s.startsWith("#");
          }).length;
        }
      }
    } catch {}

    return { ...it, items: n, lastBuilt };
  });

  res.json({ ok: true, items: enriched });
}

// Returns: [{ filename, path, size, mtimeMs, title, date, published }]
async function getLocalItemsForSub(sub, metaByStem = null) {
  const dir = String(sub?.dir || '').trim();
  if (!dir) return [];

  let names = [];
  try {
    names = await fsp.readdir(dir); // IMPORTANT: no withFileTypes (SMB mounts can lie)
  } catch {
    return [];
  }
  
  console.log('[getLocalItemsForSub] names count=', names.length, 'sample=', names.slice(0, 10));
  
  const AUDIO_RE = /\.(mp3|m4a|aac|ogg|flac|mp4)$/i;

  const out = [];
  for (const filename of names) {
    if (!AUDIO_RE.test(filename)) continue;

    const full = path.join(dir, filename);

    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) continue;

      const stem = stemFromFilename(filename);
      const meta = (metaByStem && stem) ? metaByStem[stem] : null;

      out.push({
        filename,
        path: full,
        size: st.size,
        mtimeMs: st.mtimeMs,
        title: String(meta?.title || ''),
        date: String(meta?.date || ''),
        published: meta?.published ?? null
      });
      console.log('[getLocalItemsForSub] audio count=', audioNames.length, 'sample=', audioNames.slice(0, 10));
    } catch {
      // ignore unreadable
    }
  }

  // Prefer published if present; else mtime
  out.sort(
    (a, b) =>
      (b.published || 0) - (a.published || 0) ||
      (b.mtimeMs || 0) - (a.mtimeMs || 0)
  );

  return out;
}
 
async function buildPodcastMap({ rss, outM3u }) {
  const items = readSubs();
  const sub = items.find(it => normUrl(it?.rss) === normUrl(rss));
  if (!sub) throw new Error("Subscription not found");

  // Scan local directory for downloaded audio
  const files = (await fsp.readdir(sub.dir))
    .filter(f => /\.(mp3|m4a|aac|mp4)$/i.test(f));

  const episodes = files.map(f => ({
    title: path.basename(f, path.extname(f)),
    enclosure: path.join(sub.mpdPrefix, f),
    podcastTitle: sub.title
  }));

  const m3u = await writePodcastM3u({ episodes, outM3u });
  const map = await writePodcastUrlMap({ episodes, outM3u });

  return {
    outM3u: m3u.outM3u,
    m3uCount: m3u.count,
    outJson: map.outJson,
    mapCount: map.keyCount
  };
}

async function buildPodcastMapFromLocalItems({ sub, items, outM3u, mapJson }) {
  const itemsByUrl = Object.create(null);
  const lines = [];

  const mpdPrefix = String(sub?.mpdPrefix || '').replace(/\/+$/, '');
  const showTitle = String(sub?.title || 'Podcast').trim() || 'Podcast';

  for (const it of (items || [])) {
    const filename = String(it?.filename || '').trim();
    if (!filename) continue;

    const stem = filename.replace(/\.[^.]+$/, '');
    const key = `id:${stem}`;

    const mpdFile = mpdPrefix ? `${mpdPrefix}/${filename}` : filename;

    itemsByUrl[key] = {
      artist: showTitle,
      album: showTitle,
      title: String(it?.title || '').trim() || '(untitled)',
      date: String(it?.date || '').trim(),
      genre: 'Podcast',

      imageUrl: String(sub?.imageUrl || '').trim(),
      file: mpdFile,
      filename
    };

    lines.push(mpdFile);
  }

  await fsp.mkdir(path.dirname(mapJson), { recursive: true });
  await fsp.writeFile(
    mapJson,
    JSON.stringify({ itemsByUrl }, null, 2) + '\n',
    'utf8'
  );

  await fsp.mkdir(path.dirname(outM3u), { recursive: true });
  await fsp.writeFile(
    outM3u,
    lines.join('\n') + (lines.length ? '\n' : ''),
    'utf8'
  );

  return {
    mapCount: Object.keys(itemsByUrl).length,
    m3uCount: lines.length
  };
}

function extractNprId(s) {
    const str = String(s || '');
    const m = str.match(/\b(NPR\d+)\.mp3\b/i);
    return m ? m[1].toUpperCase() : '';
}
 
 
function extractMegaphoneId(s) {
    const str = String(s || '').trim();
    if (!str) return '';

    // Local file path: .../NPR1234567890.mp3
    const m1 = str.match(/(?:^|\/)(NPR\d+)\.mp3$/i);
    if (m1 && m1[1]) return m1[1].toUpperCase();

    // Any URL that contains .../traffic.megaphone.fm/NPR123....mp3 (or variants)
    const m2 = str.match(/megaphone\.fm\/(NPR\d+)\.mp3/i);
    if (m2 && m2[1]) return m2[1].toUpperCase();

    return '';
}
 
function isLocalPodcastFile(file) {
    return /^USB\/.*\/Podcasts\//i.test(file);
}
 
// safe single-quote escape for shell
function shQ(s) {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

async function favoritesSetViaSsh(file, want) {
  const f = String(file || '').trim();
  if (!f) return { changed: false, isFavorite: false };

  // This runs on moOde:
  // - ensures file exists
  // - remove exact matching lines when want=false
  // - add exact line once when want=true
  // - prints RESULT=0/1
  const remoteCmd = `
set -e
p=${shQ(FAVORITES_M3U)}
f=${shQ(f)}
sudo touch "$p"
sudo chown root:audio "$p" || true
sudo chmod 664 "$p" || true

if ${want ? 'true' : 'false'}; then
  if sudo grep -Fxq "$f" "$p"; then
    echo "RESULT=1"
  else
    echo "$f" | sudo tee -a "$p" >/dev/null
    echo "RESULT=1"
  fi
else
  if sudo grep -Fxq "$f" "$p"; then
    # delete exact line matches
    sudo sed -i "\\|^${f.replace(/\\/g,'\\\\').replace(/\|/g,'\\|')}$|d" "$p"
  fi
  if sudo grep -Fxq "$f" "$p"; then
    echo "RESULT=1"
  else
    echo "RESULT=0"
  fi
fi
`;

  const { stdout } = await execFileP('ssh', ['-o', 'BatchMode=yes', MOODE_SSH, remoteCmd], {
    timeout: 8000,
    maxBuffer: 1024 * 1024,
  });

  const isFavorite = /RESULT=1/.test(String(stdout || ''));
  return { changed: true, isFavorite };
}
 
async function sshMoode(cmd) {
  const host = `${MOODE_SSH_USER}@${MOODE_SSH_HOST}`;
  // IMPORTANT: wrap remote command in bash -lc so quoting behaves
  const full = `ssh -o BatchMode=yes -o StrictHostKeyChecking=yes ${host} ${mpdEscapeShellArg(`bash -lc ${mpdEscapeShellArg(cmd)}`)}`;
  return await execShell(full); // whatever you already use to run shell commands and capture stdout/stderr
}

// Minimal shell-arg escaper (single-quote safe)
function mpdEscapeShellArg(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function setFavoriteByEditingPlaylistFile(file, want) {
  const f = String(file || '').trim();
  if (!f) return { ok: false, error: 'no-file' };

  // remote script: idempotent add/remove, exact-line match, safe delimiter
  const script = `
p=${mpdEscapeShellArg(FAVORITES_PATH)}
f=${mpdEscapeShellArg(f)}
sudo touch "$p"
if ${want ? 'false' : 'true'}; then :; fi

if ${want ? 'true' : 'false'}; then
  sudo grep -Fxq "$f" "$p" || echo "$f" | sudo tee -a "$p" >/dev/null
else
  sudo sed -i "\\|^$(printf %s "$f" | sed 's/[.[\\*^$(){}+?|]/\\\\&/g')$|d" "$p"
fi

# report truth
if sudo grep -Fxq "$f" "$p"; then
  echo "IS_FAV=1"
else
  echo "IS_FAV=0"
fi
`;

  const out = await sshMoode(script);
  const isFavorite = /IS_FAV=1/.test(String(out || ''));
  return { ok: true, isFavorite };
}
 
// =========================
// MPD stickers over TCP (mpdQueryRaw)
// =========================

function parseStickerGetValue(raw, key) {
  // Example MPD response line: "sticker: rating=5"
  const want = `${String(key || '').trim().toLowerCase()}=`;
  const lines = String(raw || '').split('\n');

  for (const line0 of lines) {
    const line = String(line0 || '').trim();
    const m = line.match(/^sticker:\s*(.+)$/i);
    if (!m) continue;

    const rhs = String(m[1] || '').trim(); // "rating=5"
    if (rhs.toLowerCase().startsWith(want)) {
      return rhs.slice(want.length).trim(); // "5"
    }
  }
  return '';
}

async function mpdStickerGetSong(file, key) {
  const f = String(file || '').trim();
  const k = String(key || '').trim();
  if (!f || !k) return '';
  if (isStreamPath(f) || isAirplayFile(f)) return '';

  const raw = await mpdQueryRaw(`sticker get song ${mpdEscapeValue(f)} ${k}`);
  if (!raw || mpdHasACK(raw)) return '';
  return parseStickerGetValue(raw, k);
}

async function mpdStickerSetSong(file, key, value) {
  const f = String(file || '').trim();
  const k = String(key || '').trim();
  const v = String(value ?? '').trim();

  if (!f || !k) throw new Error('mpdStickerSetSong: missing file/key');
  if (isStreamPath(f) || isAirplayFile(f)) throw new Error('mpdStickerSetSong: not a local file');

  const raw = await mpdQueryRaw(
    `sticker set song ${mpdEscapeValue(f)} ${k} ${mpdEscapeValue(v)}`
  );
  if (!raw || mpdHasACK(raw)) throw new Error('mpd sticker set failed');
  return true;
}

async function mpdStickerDeleteSong(file, key) {
  const f = String(file || '').trim();
  const k = String(key || '').trim();
  if (!f || !k) return false;
  if (isStreamPath(f) || isAirplayFile(f)) return false;

  const raw = await mpdQueryRaw(`sticker delete song ${mpdEscapeValue(f)} ${k}`);
  // If sticker doesn't exist, MPD may ACK. That's fine: goal is "no sticker".
  return !!raw;
}

async function setRatingForFile(file, rating0to5) {
  const fileStr = String(file || '').trim();
  if (!fileStr) throw new Error('setRatingForFile: missing file');

  const r = Math.max(0, Math.min(5, Number(rating0to5) || 0));

  if (r === 0) {
    // Prefer delete (true unrated), but fall back to set 0.
    try {
      await mpdStickerDeleteSong(fileStr, 'rating');
    } catch {
      await mpdStickerSetSong(fileStr, 'rating', '0');
    }
    return 0;
  }

  await mpdStickerSetSong(fileStr, 'rating', String(r));
  return r;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}



app.post('/mpd/prime', async (req, res) => {
  try {
    const result = await mpdPrimeIfIdle(); // new safe prime
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) ? e.message : String(e) });
  }
});



// You need these four primitives implemented in YOUR style:
// - mpdGetStatus(): returns { state: 'play'|'pause'|'stop', song: number|null, playlistlength: number }
// - mpdPlay(): starts playback (or mpdPlay(0) if you prefer)
// - mpdPause(on): pauses if on===true
// - mpdStop(): stops (optional alternative to pause)

async function mpdPrimeIfIdle() {
  const st = await mpdGetStatus();

  const state = String(st && st.state ? st.state : '').trim().toLowerCase();
  const song = (st && st.song !== undefined && st.song !== null && String(st.song).trim() !== '')
    ? Number(st.song)
    : null;
  const playlistlength = (st && st.playlistlength !== undefined && st.playlistlength !== null)
    ? Number(st.playlistlength)
    : 0;

  // 1) If MPD is engaged, never touch it
  if (state === 'play' || state === 'pause') {
    return { primed: false, skipped: true, reason: 'mpd_active', state: state };
  }

  // 2) If stopped but already has a current song selected, no need to prime
  if (state === 'stop' && song !== null && Number.isFinite(song) && song >= 0) {
    return { primed: false, skipped: true, reason: 'already_has_current', state: state, song: song };
  }

  // 3) If playlist empty, nothing to do
  if (!Number.isFinite(playlistlength) || playlistlength <= 0) {
    return { primed: false, skipped: true, reason: 'empty_playlist', state: state };
  }

  // 4) Only now do we "manufacture" a current song
  await mpdPlay();          // or mpdPlay(0)
  await sleep(900);         // IMPORTANT: give moOde time to form currentsong/status JSON
  await mpdPause(true);     // or await mpdStop();

  return { primed: true, skipped: false, reason: 'idle_primed', state_before: state };
}

/* =========================
 * Ratings (stickers)
 * ========================= */

async function mpdStickerSet(file, key, value) {
  const f = String(file || '').trim();
  const k = String(key || '').trim();
  if (!f || !k || isStreamPath(f) || isAirplayFile(f)) return false;

  const v = String(value ?? '').trim();
  const raw = await mpdQueryRaw(`sticker set song ${mpdEscapeValue(f)} ${k} ${mpdEscapeValue(v)}`);
  if (mpdHasACK(raw)) throw new Error(`MPD sticker set failed: ${raw.split('\n').find(l => l.startsWith('ACK')) || 'ACK'}`);
  return true;
}


// =========================
// Rating cache (shared)
// =========================
const RATING_CACHE_MS = 2500;

let ratingCache = {
  file: '',
  ts: 0,
  rating: 0,
  disabled: true,
  err: '',
};


// Cached wrapper used by /now-playing
// - Honors "disabled" (streams/airplay) if caller passes that in later (optional)
// - Never returns disabled:true just because cache is stale
// - Treats cache as authoritative immediately after bumpRatingCache()
async function getRatingForFileCached(file) {
  const f = String(file || '').trim();
  if (!f) return { rating: 0, disabled: true, err: 'no-file' };

  const now = Date.now();

  // Cache hit
  if (
    ratingCache &&
    ratingCache.file === f &&
    Number.isFinite(ratingCache.ts) &&
    (now - ratingCache.ts) < RATING_CACHE_MS
  ) {
    return {
      rating: Number(ratingCache.rating) || 0,
      disabled: !!ratingCache.disabled,
      err: String(ratingCache.err || ''),
      source: 'cache',
    };
  }

  // Cache miss → ask MPD
  try {
    const rating = Number(await getRatingForFile(f)) || 0;

    ratingCache = {
      file: f,
      ts: now,
      rating,
      disabled: false,
      err: '',
    };

    return { rating, disabled: false, err: '', source: 'mpd' };
  } catch (e) {
    const msg = e?.message || String(e);

    // IMPORTANT: don't poison the cache with "disabled:true" permanently.
    // Instead, cache the error briefly so we don't spam MPD, but keep "disabled:false"
    // so the UI doesn't hide stars just because MPD hiccupped.
    ratingCache = {
      file: f,
      ts: now,
      rating: Number(ratingCache?.file === f ? ratingCache.rating : 0) || 0,
      disabled: false,
      err: msg,
    };

    return {
      rating: Number(ratingCache.rating) || 0,
      disabled: false,
      err: msg,
      source: 'error',
    };
  }
}

// Used by POST /rating/current so UI updates immediately
function bumpRatingCache(file, rating) {
  const f = String(file || '').trim();
  if (!f) return;
  ratingCache = { file: f, ts: Date.now(), rating: clampRating(rating) ?? 0, disabled: false, err: '' };
}

async function getRatingForFile(file) {
  const f = String(file || '').trim();
  if (!f || isStreamPath(f) || isAirplayFile(f)) return 0;

  const v = await mpdStickerGetSong(f, 'rating'); // "5" or ""
  const n = clampRating(v);
  return n ?? 0;
}


/* =========================
 * Local file mapping + tag reading
 * ========================= */

function mpdFileToLocalPath(mpdFile) {
  const f = String(mpdFile || '').trim();
  if (!f || isStreamPath(f) || isAirplayFile(f)) return '';
  if (!f.startsWith(MOODE_USB_PREFIX)) return '';

  // Build a clean absolute path on the Pi4 mount
  const rel = f.slice(MOODE_USB_PREFIX.length).replace(/^\/+/, '');
  return path.join(PI4_MOUNT_BASE, rel);
}

function safeIsFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

async function runCmdQuiet(cmd, args) {
  try {
    const { stdout } = await execFileP(cmd, args, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return (stdout || '').trim();
  } catch {
    return '';
  }
}

async function metaflacTag(tag, filePath) {
  const out = await runCmdQuiet(METAFLAC, [`--show-tag=${tag}`, filePath]);
  const line = out.split('\n').find((l) => l.includes('='));
  return line ? line.split('=', 2)[1].trim() : '';
}

async function metaflacTagMulti(tag, filePath) {
  const out = await runCmdQuiet(METAFLAC, [`--show-tag=${tag}`, filePath]);
  return out
    .split('\n')
    .map((l) => l.split('=', 2)[1]?.trim())
    .filter(Boolean);
}

const deepTagCache = new Map();
const DEEP_TAG_CACHE_MAX = Number(process.env.DEEP_TAG_CACHE_MAX || '2000');

function deepTagCacheSet(key, value) {
  // Simple cap to avoid unbounded growth. Oldest eviction is fine here.
  if (deepTagCache.size >= DEEP_TAG_CACHE_MAX) {
    const firstKey = deepTagCache.keys().next().value;
    if (firstKey !== undefined) deepTagCache.delete(firstKey);
  }
  deepTagCache.set(key, value);
}

async function getDeepMetadataCached(mpdFile) {
  const empty = { year: '', label: '', producer: '', performers: [] };
  const f = String(mpdFile || '').trim();
  if (!f) return empty;

  const cached = deepTagCache.get(f);
  if (cached) return cached;

  const p = mpdFileToLocalPath(f);
  if (!p || !safeIsFile(p)) {
    deepTagCacheSet(f, empty);
    return empty;
  }

  const dateRaw = await metaflacTag('DATE', p);
  const year =
    (await metaflacTag('ORIGINALYEAR', p)) ||
    extractYear(await metaflacTag('ORIGINALDATE', p)) ||
    extractYear(dateRaw) ||
    '';

  const deep = {
    year,
    label: await metaflacTag('LABEL', p),
    producer: await metaflacTag('PRODUCER', p),
    performers: await metaflacTagMulti('PERFORMER', p),
  };

  deepTagCacheSet(f, deep);
  return deep;
}


function isRelativeMoodeCover(s) {
  const t = String(s || '').trim();
  return t.startsWith('/coverart.php/') || t.startsWith('/');
}


async function buildArtDerivatives(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) throw new Error('art url empty');

  // allow relative moOde cover refs like "/coverart.php/..."
  if (isRelativeMoodeCover(url) && !/^https?:\/\//i.test(url)) {
    url = normalizeCoverUrl(url, MOODE_BASE_URL);
  }

  const r = await fetch(url, { dispatcher: dispatcherForUrl(url), cache: 'no-store' });
  if (!r.ok) throw new Error(`art fetch failed: ${r.status}`);
  const input = Buffer.from(await r.arrayBuffer());

  const out640 = await sharp(input)
    .rotate()
    .resize(640, 640, { fit: 'cover' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const outBG = await sharp(input)
    .rotate()
    .resize(640, 640, { fit: 'cover' })
    .blur(18)
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  return { out640, outBG };
}



async function updateArtCacheIfNeeded(rawArtUrl) {
  const key = normalizeArtKey(rawArtUrl);
  if (!key) return;

  await ensureDir(ART_CACHE_DIR);

  const p640 = artPath640ForKey(key);
  const pbg  = artPathBgForKey(key);

  // If cached, refresh the "current_*" pointers when the key changes
  if (safeIsFile(p640) && safeIsFile(pbg)) {
    if (key !== lastArtKeyBuilt) {
      try {
        const [buf640, bufBG] = await Promise.all([
          fs.promises.readFile(p640),
          fs.promises.readFile(pbg),
        ]);

        await Promise.all([
          writeFileAtomic(ART_640_PATH, buf640),
          writeFileAtomic(ART_BG_PATH,  bufBG),
        ]);

        lastArtKeyBuilt = key;
      } catch {
        // ignore; caller will fall back to direct fetch/resize
      }
    }
    return;
  }

  // Not cached yet → build derivatives from the provided URL
  const { out640, outBG } = await buildArtDerivatives(rawArtUrl);

  // Persist keyed cache + update "current_*" pointers
  await Promise.all([
    writeFileAtomic(p640, out640),
    writeFileAtomic(pbg,  outBG),
    writeFileAtomic(ART_640_PATH, out640),
    writeFileAtomic(ART_BG_PATH,  outBG),
  ]);

  lastArtKeyBuilt = key;
  log.debug('[art] rebuilt', { key, p640, pbg });
}

// =========================
// Favorites (via MPD playlist, NOT filesystem)
// =========================

let favoritesCache = {
  ts: 0,
  set: new Set(),
  err: '',
};

function parseListPlaylistFiles(raw) {
  // listplaylist returns lines like: "file: USB/....flac"
  const out = new Set();
  const lines = String(raw || '').split('\n');

  for (const line0 of lines) {
    const line = String(line0 || '').trim();
    if (!line) continue;

    // ✅ ignore greeting
    if (line.startsWith('OK MPD ')) continue;

    // ✅ stop only on terminal OK
    if (line === 'OK') break;

    // stop on error
    if (/^ACK\b/.test(line)) break;

    const m = line.match(/^file:\s*(.+)\s*$/i);
    if (m && m[1]) out.add(m[1].trim());
  }

  return out;
}

async function refreshFavoritesFromMpd() {
  const name = String(FAVORITES_PLAYLIST_NAME || 'Favorites').trim();
  const raw = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(name)}`);

  if (!raw || mpdHasACK(raw)) {
    favoritesCache = { ts: Date.now(), set: new Set(), err: 'playlist-missing-or-ack' };
    return favoritesCache;
  }

  favoritesCache = {
    ts: Date.now(),
    set: parseListPlaylistFiles(raw),
    err: '',
  };
  return favoritesCache;
}

async function isFavoriteInPlaylist(mpdFile, debugObj = null) {
  const f = String(mpdFile || '').trim();
  if (!f || isStreamPath(f) || isAirplayFile(f)) return false;

  const now = Date.now();
  const ttl = Number(FAVORITES_REFRESH_MS || 3000);

  // Refresh if stale OR cache empty OR cache doesn't contain the file (one forced retry)
  let didRefresh = false;

  const maybeRefresh = async (why) => {
    didRefresh = true;
    try {
      await refreshFavoritesFromMpd();
    } catch {}
    if (debugObj) debugObj.refreshWhy = why;
  };

  if (!favoritesCache.ts || (now - favoritesCache.ts) > ttl) {
    await maybeRefresh('stale');
  } else if (!favoritesCache.set || favoritesCache.set.size === 0) {
    await maybeRefresh('empty');
  }

  let has = favoritesCache.set.has(f);

  // If not found, force ONE refresh (covers “poisoned” cache + MPD changes)
  if (!has && !didRefresh) {
    await maybeRefresh('miss-force');
    has = favoritesCache.set.has(f);
  }

  if (debugObj) {
    debugObj.file = f;
    debugObj.cacheAgeMs = favoritesCache.ts ? (now - favoritesCache.ts) : null;
    debugObj.cacheSize = favoritesCache.set ? favoritesCache.set.size : null;
    debugObj.cacheErr = favoritesCache.err || '';
    debugObj.has = has;
    // helpful: show first few entries (sanitized)
    debugObj.sample = Array.from(favoritesCache.set).slice(0, 3);
  }

  return has;
}

async function mpdDeletePos0(pos0) {
  const n = Number(pos0);
  if (!Number.isFinite(n) || n < 0) throw new Error('bad pos0');
  await mpdQueryRaw(`delete ${n}`);
  return true;
}

async function mpdDeleteId(songid) {
  const id = Number(songid);
  if (!Number.isFinite(id) || id < 0) throw new Error('bad songid');
  await mpdQueryRaw(`deleteid ${id}`);
  return true;
}

async function mpdPlaylistInfoById(songid) {
  if (songid === '' || songid === null || songid === undefined) return null;
  const raw = await mpdQueryRaw(`playlistid ${songid}`);
  if (!raw || mpdHasACK(raw)) return null;

  const kv = parseMpdFirstBlock(raw);
  const file = kv.file || '';
  const title = kv.title || '';
  const artist = kv.artist || '';
  const album = kv.album || '';
  const id = kv.id || String(songid);
  const pos = kv.pos || '';

  if (!file && !title && !artist) return null;
  return { file, title, artist, album, songid: id, songpos: pos };
}

async function mpdPlaylistInfoByPos(songpos) {
  const n = Number(songpos);
  if (!Number.isFinite(n) || n < 0) return null;

  const raw = await mpdQueryRaw(`playlistinfo ${n}:${n + 1}`);
  if (!raw || mpdHasACK(raw)) return null;

  const kv = parseMpdFirstBlock(raw);
  const file   = kv.file   || '';
  const title  = kv.title  || '';
  const artist = kv.artist || '';
  const album  = kv.album  || '';
  const id     = kv.id     || '';
  const pos    = kv.pos    || String(n);

  if (!file && !title && !artist) return null;
  return { file, title, artist, album, songid: id, songpos: pos };
}

function isLibraryFile(mpdFile) {
  const f = String(mpdFile || '').trim();
  return !!f && !isStreamPath(f) && !isAirplayFile(f) && f.startsWith(MOODE_USB_PREFIX);
}

async function mpdFindFirstLocalByTag(tag, value) {
  if (!tag || !value) return '';

  const raw = await mpdQueryRaw(`find ${tag} ${mpdEscapeValue(value)}`);
  if (!raw || mpdHasACK(raw)) return '';

  // Minimal parse: find first "file:" occurrence
  const lines = String(raw).split('\n');
  for (const line of lines) {
    if (!line.toLowerCase().startsWith('file:')) continue;
    const f = line.slice(line.indexOf(':') + 1).trim();
    if (isLibraryFile(f)) return f;
  }
  for (const line of lines) {
    if (!line.toLowerCase().startsWith('file:')) continue;
    const f = line.slice(line.indexOf(':') + 1).trim();
    if (f && !isStreamPath(f) && !isAirplayFile(f)) return f;
  }
  return '';
}

/**
 * Resolve a UPnP/HTTP stream track to a local library file, when possible.
 * Guarded so we do nothing (and log nothing) when inputs are empty.
 */
async function resolveLibraryFileForStream(inputs, debugLog = null) {
  const songid  = String(inputs?.songid  || '').trim();
  const songpos = String(inputs?.songpos || '').trim();
  let title     = String(inputs?.title   || '').trim();
  let artist    = String(inputs?.artist  || '').trim();
  let album     = String(inputs?.album   || '').trim();
  let track     = String(inputs?.track   || '').trim();

  // If literally nothing to resolve, bail silently.
  if (!songid && !songpos && !title && !artist && !album && !track) return '';

  let mbTrackId = '';

  // Prefer songpos → playlistinfo (pulls musicbrainz_trackid when available)
  if (songpos) {
    const n = Number(songpos);
    if (Number.isFinite(n) && n >= 0) {
      const cmd = `playlistinfo ${n}:${n + 1}`;
      const raw = await mpdQueryRaw(cmd);

      if (debugLog) {
        debugLog('[resolver:playlistinfo-raw]', {
          cmd,
          rawLen: raw.length,
          hasACK: mpdHasACK(raw),
          head: raw.slice(0, 500),
        });
      }

      if (raw && !mpdHasACK(raw)) {
        const kv = parseMpdFirstBlock(raw);
        mbTrackId = kv.musicbrainz_trackid || '';
        title  = kv.title  || title  || '';
        artist = kv.artist || artist || '';
        album  = kv.album  || album  || '';
        track  = kv.track  || track  || '';
      }
    }
  }

  if (debugLog) {
    debugLog('[resolver:after-songpos]', { songpos, songid, mbTrackId, title, artist, album, track });
  }

  // Fallback songid → playlistid
  if (!mbTrackId && songid) {
    const raw = await mpdQueryRaw(`playlistid ${songid}`);
    if (raw && !mpdHasACK(raw)) {
      const kv = parseMpdFirstBlock(raw);
      mbTrackId = kv.musicbrainz_trackid || '';
      title  = title  || kv.title  || '';
      artist = artist || kv.artist || '';
      album  = album  || kv.album  || '';
      track  = track  || kv.track  || '';
    }
  }

  if (mbTrackId) {
    const f = await mpdFindFirstLocalByTag('MUSICBRAINZ_TRACKID', mbTrackId);
    if (f) return f;
  }

  // Loose fallback heuristics
  if (title) {
    const f1 = await mpdFindFirstLocalByTag('Title', title);
    if (f1) return f1;
  }
  if (album) {
    const f2 = await mpdFindFirstLocalByTag('Album', album);
    if (f2) return f2;
  }
  if (track && album) {
    const f3 = await mpdFindFirstLocalByTag('Track', track);
    if (f3) return f3;
  }

  return '';
}

async function mpdPlaylistAdd(name, mpdFile) {
  await mpdQueryRaw(`playlistadd ${mpdEscapeValue(name)} ${mpdEscapeValue(mpdFile)}`);
  return true;
}

async function mpdPlaylistDeleteByFile(name, mpdFile) {
  const raw = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(name)}`);
  if (!raw || mpdHasACK(raw)) return false;

  const target = String(mpdFile || '').trim();
  if (!target) return false;

  const lines = String(raw).split('\n');
  const positions = [];
  let pos = 0;

  for (const line0 of lines) {
    const line = String(line0 || '').trim();
    if (!line) continue;
    if (line === 'OK') break;
    if (/^ACK\b/.test(line)) break;

    // MPD may return either:
    //   "file: <path>"
    // OR just "<path>"
    let f = '';
    const m = line.match(/^file:\s*(.+)\s*$/i);
    if (m && m[1]) f = m[1].trim();
    else f = line;

    if (f === target) positions.push(pos);
    pos++;
  }

  // delete from bottom to top so indices don’t shift
  positions.sort((a, b) => b - a);
  for (const p of positions) {
    await mpdQueryRaw(`playlistdelete ${mpdEscapeValue(name)} ${p}`);
  }

  return positions.length > 0;
}

/* =========================
 * iTunes artwork cache (radio)
 * ========================= */

const itunesArtCache = new Map();

function pickArtFromItunesItem(item) {
  let art = item?.artworkUrl100 || '';
  if (art) art = art.replace(/\/\d+x\d+bb\./, '/600x600bb.');
  return art;
}

function pickAlbumAndYearFromItunesItem(item) {
  const album = item?.collectionName || '';
  const year = item?.releaseDate ? String(item.releaseDate).slice(0, 4) : '';
  return { album, year };
}

/* ============================================================
 * Radio/classical title cleanup for iTunes
 * ============================================================ */

function normalizeDashSpacing(s) {
  return String(s || '')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function decodeHtmlEntities(str) {
  // Server-side: you may not have DOM. If your upstream can include entities,
  // keep it conservative: only decode a few common ones.
  // If you already decode upstream, you can replace this with: return String(str||'');
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function looksLikeEnsembleOrConductor(s) {
  const t = String(s || '').toLowerCase();

  // quick structural tells
  if (t.includes(' / ')) return true;        // "Orch / Conductor"
  if (t.includes('orch')) return true;
  if (t.includes('orchestra')) return true;

  return /orchester|orchestra|ensemble|phil(harm|harmon)|symph|sinfon|choir|chor|quartet|quintet|trio|dirig|conduct|conductor/i.test(s);
}

function looksLikeLabelish(s) {
  const t = String(s || '').trim().toLowerCase();
  return /^(telarc|decca|dg|dgg|sony|emi|rca|naxos|hyperion|harmonia\s+mundi|chandos|philips|warner|erato|ecm|blue\s+note|verve)$/i.test(t);
}

function looksLikePersonName(s) {
  // 2–4 words, name-like (helps detect composer in classical strings)
  const t = String(s || '').trim();
  return /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+){1,3}$/.test(t);
}

function teaseWorkAndComposerFromTitle(titleLine, radioAlbum = '') {
  const raw = normalizeDashSpacing(decodeHtmlEntities(String(titleLine || '').trim()));
  if (!raw) return { composer: '', work: '' };

  const album = normalizeDashSpacing(decodeHtmlEntities(String(radioAlbum || '').trim()));

  // Split on " - " (this is what your stream is using)
  const parts = raw.split(' - ').map(p => p.trim()).filter(Boolean);

  // Pattern: "Composer - Work - Ensemble/Conductor - Album - Label"
  if (parts.length >= 2 && looksLikePersonName(parts[0])) {
    const candidateWork = parts[1];
    if (
      candidateWork &&
      !looksLikeEnsembleOrConductor(candidateWork) &&
      !looksLikeLabelish(candidateWork)
    ) {
      return { composer: parts[0], work: candidateWork };
    }
  }

  // Pattern: "Composer: Work -- Movement" or "Composer: Work - ..."
  const m = raw.match(/^([^:]{3,60})\s*:\s*(.+)$/);
  if (m) {
    const composer = m[1].trim();
    const rest = m[2].trim();
    if (composer && rest) {
      const restParts = rest.split(' - ').map(p => p.trim()).filter(Boolean);
      return { composer, work: restParts[0] || rest };
    }
  }

  // If album appears in parts, choose the segment immediately before it
  if (album && parts.length >= 2) {
    const idx = parts.findIndex(p => p.toLowerCase() === album.toLowerCase());
    if (idx > 0) {
      const candidate = parts[idx - 1];
      if (
        candidate &&
        !looksLikeEnsembleOrConductor(candidate) &&
        !looksLikeLabelish(candidate)
      ) {
        const composer = looksLikePersonName(parts[0]) ? parts[0] : '';
        return { composer, work: candidate };
      }
    }
  }

  // Fallback: first segment after the first that doesn't look like ensemble/label/album
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (album && p.toLowerCase() === album.toLowerCase()) continue;
    if (looksLikeLabelish(p)) continue;
    if (looksLikeEnsembleOrConductor(p)) continue;
    return { composer: looksLikePersonName(parts[0]) ? parts[0] : '', work: p };
  }

  // Last resort: use raw (but don’t pretend we extracted)
  return { composer: '', work: raw };
}

function buildItunesTerm(artist, title, opts = {}) {
  const aRaw = String(artist || '').trim();
  const tRaw = String(title || '').trim();
  const album = String(opts.radioAlbum || '').trim();

  // If title is clearly a “metadata soup” classic pattern, try teasing it.
  const teased = teaseWorkAndComposerFromTitle(tRaw, album);

  // Decide what we trust:
  // - If we successfully teased a "work" that is shorter/cleaner, prefer it.
  // - Keep composer if present (even if artist is junky).
  const work = String(teased.work || '').trim();
  const composer = String(teased.composer || '').trim();

  // Heuristic: if teased work is materially shorter than raw and not ensemble-ish, use it.
  const useTeased =
    !!work &&
    work.length >= 3 &&
    work.length <= 80 &&
    work.length < (tRaw.length * 0.75) &&
    !looksLikeEnsembleOrConductor(work) &&
    !looksLikeLabelish(work);

  const finalTitle = useTeased ? work : tRaw;

  // Artist selection:
  // - If composer exists, it’s often better than a polluted "artist" field.
  // - Otherwise keep artist if present.
  const finalArtist = composer || aRaw;

  const term = `${finalArtist} ${finalTitle}`.trim();

  return {
    term,
    debug: {
      aRaw,
      tRaw,
      album,
      composer,
      work,
      useTeased,
      finalArtist,
      finalTitle,
    },
  };
}

/* ============================================================
 * iTunes lookup (rewritten)
 * - keeps your caching behavior
 * - uses cleaned term for classical/radio soup titles
 * ============================================================ */

async function lookupItunesFirst(artist, title, debug = false, opts = {}) {
  const a = String(artist || '').trim();
  const t = String(title || '').trim();

  // ✅ Always return a consistent shape
  const empty = (reason, extra = {}) => ({
    url: '',
    album: '',
    year: '',
    trackUrl: '',
    albumUrl: '',
    reason,
    ...(debug ? extra : {}),
  });

  if (!a || !t) return empty('missing-artist-or-title');

  // Build a smarter search term (and use it in cache key)
  const built = buildItunesTerm(a, t, opts) || {};
  const termStr = String(built.term || `${a} ${t}`).trim();
  const termDebug = built.debug || {};

  if (!termStr) return empty('missing-term', { term: termStr, termDebug });

  const cacheKey = `song|${termStr.toLowerCase()}`;
  const now = Date.now();

  // ✅ Cache hit (only when not debugging)
  const cached = itunesArtCache.get(cacheKey);
  if (cached && !debug) {
    const ttl = cached.url ? ITUNES_TTL_HIT_MS : ITUNES_TTL_MISS_MS;
    if ((now - (cached.ts || 0)) < ttl) {
      return {
        url: cached.url || '',
        album: cached.album || '',
        year: cached.year || '',
        trackUrl: cached.trackUrl || '',
        albumUrl: cached.albumUrl || '',
        reason: cached.url ? 'cache-hit' : 'cache-hit-empty',
      };
    }
    itunesArtCache.delete(cacheKey);
  }

  const queryUrl =
    `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(termStr)}&media=music&entity=song&limit=5&country=${ITUNES_COUNTRY}`;

  try {
    const data = await fetchJsonWithTimeout(queryUrl, ITUNES_TIMEOUT_MS);
    const results = Array.isArray(data?.results) ? data.results : [];

    let url = '';
    let album = '';
    let year = '';
    let trackUrl = '';
    let albumUrl = '';

    for (const item of results) {
      const art = pickArtFromItunesItem(item);
      if (!art) continue;

      url = art;

      const picked = pickAlbumAndYearFromItunesItem(item) || {};
      album = String(picked.album || '');
      year  = String(picked.year  || '');

      // ✅ FIX: "links" was undefined; pull URLs from the item (or a helper if you have one)
      trackUrl = String(item?.trackViewUrl || '');
      albumUrl = String(item?.collectionViewUrl || '');

      break;
    }

    // ✅ Cache both hits and misses, including URLs if present
    itunesArtCache.set(cacheKey, {
      url,
      album,
      year,
      trackUrl,
      albumUrl,
      ts: now,
    });

    const reason = url ? 'ok:bestMatch' : 'no-art';

    if (debug) {
      return {
        url,
        album,
        year,
        trackUrl,
        albumUrl,
        reason,
        queryUrl,
        term: termStr,
        termDebug,
      };
    }

    return { url, album, year, trackUrl, albumUrl, reason };
  } catch (e) {
    // ✅ Cache miss on error too (prevents hammering)
    itunesArtCache.set(cacheKey, {
      url: '',
      album: '',
      year: '',
      trackUrl: '',
      albumUrl: '',
      ts: now,
    });

    const name = e?.name || 'Error';
    const msg  = e?.message || String(e);
    const reason = `error:${name}:${msg}`;

    if (debug) {
      return empty(reason, {
        queryUrl,
        term: termStr,
        termDebug,
      });
    }

    return empty(reason);
  }
}
async function pickBestArtUrlForCurrentSong({ preferItunesForRadio = true } = {}) {
  const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
  const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);

  const file = String(song.file || '').trim();
  const stream = isStreamPath(file);
  const airplay = isAirplayFile(file) || String(song.encoded || '').toLowerCase() === 'airplay';

  // --- BRAKES: do NOT change AirPlay behavior right now ---
  if (airplay) {
    // What you currently do: rely on coverurl if present, else nothing.
    if (song.coverurl) return normalizeCoverUrl(song.coverurl, MOODE_BASE_URL);
    return '';
  }

  // Local file => always correct
  if (!stream && file) {
    return `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(file)}`;
  }

  // Stream handling (radio vs upnp)
  if (stream) {
    const streamKind = String(getStreamKind(file) || '').trim();

    // UPnP: keep your existing resolver behavior (already working)
    if (streamKind === 'upnp') {
      const songpos = String(moodeValByKey(statusRaw, 'song') || '').trim();
      const songid  = String(moodeValByKey(statusRaw, 'songid') || '').trim();

      const realFile = await resolveLibraryFileForStream({
        songid,
        songpos,
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        track: song.track || '',
      }, null);

      if (realFile) return `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(realFile)}`;

      // If resolver fails, fall back to station coverurl if present
      if (song.coverurl) return normalizeCoverUrl(song.coverurl, MOODE_BASE_URL);
      return '';
    }

    // RADIO: iTunes replacement (this is the fix)
    if (streamKind === 'radio') {
      if (preferItunesForRadio) {
        const decodedTitle = decodeHtmlEntities(song.title || '');
        const parts = decodedTitle.split(' - ').map(s => s.trim()).filter(Boolean);

        // Your existing heuristic: "Artist - Title"
        if (parts.length >= 2) {
          const it = await lookupItunesFirst(parts[0], parts.slice(1).join(' - '), false);
          if (it.url) return it.url;
        }
      }

      // If iTunes fails, fall back to station logo
      if (song.coverurl) return normalizeCoverUrl(song.coverurl, MOODE_BASE_URL);
      return '';
    }

    // Unknown stream kind
    if (song.coverurl) return normalizeCoverUrl(song.coverurl, MOODE_BASE_URL);
    return '';
  }

  return '';
}

/* =========================
 * AirPlay aplmeta.txt
 * ========================= */

function parseAplmeta(txt) {
  const line = String(txt || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  const parts = line.split('~~~');

  const title = (parts[0] || '').trim();
  const artist = (parts[1] || '').trim();
  const album = (parts[2] || '').trim();
  const duration = (parts[3] || '').trim();
  const coverRel = (parts[4] || '').trim();
  const fmt = (parts[5] || '').trim();

  const coverUrl = coverRel ? normalizeCoverUrl('/' + coverRel.replace(/^\/+/, '')) : '';
  return { title, artist, album, duration, coverRel, coverUrl, format: fmt };
}



/* =========================
 * Last-good cache for now-playing
 * ========================= */

let lastNowPlayingOk = null;
let lastNowPlayingTs = 0;

import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

// --- small utils ---
function stripQueryHash(u) {
  return String(u || "").split("#")[0].split("?")[0];
}

function safeFileName(name, fallback = "episode.mp3") {
  const raw = String(name || "").trim();
  if (!raw) return fallback;

  // keep only safe chars
  let out = raw.replace(/[^a-zA-Z0-9._-]+/g, "_");

  // avoid hidden files or empty
  out = out.replace(/^_+/, "");
  if (!out || out === "." || out === "..") return fallback;

  return out;
}

function mpdPrefixFromDir(dir) {
  // /mnt/SamsungMoode/...  ->  USB/SamsungMoode/...
  const d = String(dir || "");
  if (!d.startsWith("/mnt/")) return "";
  return d.replace(/^\/mnt\//, "USB/");
}

async function resolveFinalUrl(url) {
  // Try HEAD first (fast), then fallback to GET (some hosts block HEAD)
  const u = String(url || "").trim();
  if (!u) return "";

  try {
    const r = await fetch(u, { method: 'HEAD', redirect: 'follow', headers: FETCH_HEADERS });
    if (r?.url) return r.url;
  } catch {}

  // GET fallback, but do NOT download the whole file (cancel immediately)
  const ac = new AbortController();
  const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: ac.signal, headers: FETCH_HEADERS });
  const finalUrl = r?.url || u;
  try { r.body?.cancel?.(); } catch {}
  try { ac.abort(); } catch {}
  return finalUrl;
}

async function logPodcastDownload(row) {
  try {
    await fsp.mkdir(path.dirname(PODCAST_DL_LOG), { recursive: true });
    await fsp.appendFile(PODCAST_DL_LOG, JSON.stringify(row) + "\n", "utf8");
  } catch {}
}



async function uniquePath(p) {
  // If file exists, add -1, -2, ...
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  let i = 1;
  let cand = p;

  while (true) {
    try {
      await fsp.access(cand, fs.constants.F_OK);
      cand = `${base}-${i}${ext}`;
      i++;
    } catch {
      return cand; // doesn't exist
    }
  }
}

/* =========================
 * Routes
 * ========================= */
 
app.post('/mpd/play-file', async (req, res) => {
  try {
    const file = String(req.body?.file || '').trim();

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: 'Missing file',
      });
    }

    // moOde expects URL-encoded path, no quotes
    const encodedPath = encodeURIComponent(file);

    const url = `${MOODE_BASE_URL}/command/?cmd=play_item%20${encodedPath}`;

    await fetch(url, { cache: 'no-store' });

    return res.json({
      ok: true,
      file,
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
});

app.post("/podcasts/_debug/rebuild-local", async (req, res) => {
    try {
        const rss = normUrl(req.body?.rss);
        if (!rss) return res.status(400).json({ ok: false, error: "Missing/invalid rss" });

        const subs = readSubs();
        const sub = subs.find(it => normUrl(it?.rss) === rss);
        if (!sub) return res.status(404).json({ ok: false, error: "Subscription not found", rss });

        const out = await rebuildPodcastLocalIndex(sub, { limit: 300 });

        return res.json({
            ok: true,
            rss,
            dir: sub.dir,
            mapJson: sub.mapJson,
            outM3u: sub.outM3u,
            ...out
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});

app.get('/podcasts/episodes/status', async (req, res) => {
  try {
    const rss = normUrl(req.query?.rss);
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 100)));

    if (!rss) {
      return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });
    }

    const subs = readSubs();
    const sub = subs.find(it => normUrl(it?.rss) === rss);
    if (!sub) {
      return res.status(404).json({ ok: false, error: 'Subscription not found', rss });
    }

    // 1) Local stems => filename  (SMB mounts: avoid withFileTypes/isFile)
    const localByStem = Object.create(null);
    try {
      const names = await fsp.readdir(sub.dir); // IMPORTANT: no withFileTypes

      for (const name of names) {
        const m = String(name).match(/^([a-f0-9]{12})\.(mp3|m4a|aac|mp4)$/i);
        if (!m) continue;

        const full = path.join(sub.dir, name);
        try {
          const st = await fsp.stat(full);
          if (!st.isFile()) continue;
          localByStem[m[1].toLowerCase()] = name;
        } catch {}
      }
    } catch {}

    // 2) Fetch RSS
    const feed = await fetchPodcastRSS(rss, limit);
    // ensure show cover exists on disk for moOde
    await downloadCoverForSub(sub, feed);
    const items = Array.isArray(feed?.items) ? feed.items : [];

    // 3) Compute the SAME id scheme you use for downloads (sha1(guid||canonUrl)[:12])
    const episodes = [];
    for (const ep of items) {
      const rawUrl = String(ep?.enclosure || '').trim();
      if (!rawUrl) continue;

      const finalUrl = await resolveFinalUrl(rawUrl);
      const canonUrl = stripQueryHash(finalUrl || rawUrl);

      const guid = String(ep?.guid || '').trim();
      const seed = guid || canonUrl;
      const id = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12).toLowerCase();

      const filename = localByStem[id] || '';
      episodes.push({
        id,
        title: String(ep?.title || '').trim(),
        date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || ''),
        enclosure: rawUrl,
        downloaded: !!filename,
        filename
      });
    }

    return res.json({ ok: true, rss, limit, episodes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /podcasts/episodes/list { rss, limit? }
// Returns: episodes[] with imageUrl (episode-first, then show-level fallback)
app.post('/podcasts/episodes/list', async (req, res) => {
  try {
    const rss = normUrl(req.body?.rss);
    if (!rss) return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });

    const subs = readSubs();
    const sub = subs.find(it => normUrl(it?.rss) === rss);
    if (!sub) return res.status(404).json({ ok: false, error: 'Subscription not found', rss });

    if (!sub.dir || !sub.mpdPrefix) {
      return res.status(400).json({
        ok: false,
        error: 'Subscription missing required fields (dir/mpdPrefix)',
        rss
      });
    }

    // 1) Pull feed (scan window)
    const scanLimit = Math.max(1, Math.min(200, Number(req.body?.limit ?? sub.limit ?? 100)));

    const feed = await fetchPodcastRSS(rss, scanLimit);
    const feedItems = Array.isArray(feed?.items) ? feed.items : [];

    // Show-level art fallback
    const showImageUrl = String(feed?.imageUrl || feed?.titleImage || '').trim();

    // 2) Disk reality: what files exist in sub.dir (SMB mounts: avoid withFileTypes/isFile)
    const AUDIO_RE = /\.(mp3|m4a|aac|mp4|ogg|flac)$/i;

    const localByStem = Object.create(null); // stem -> { filename, path, mtimeMs, size }
    try {
      const names = await fsp.readdir(sub.dir); // IMPORTANT: no withFileTypes
      for (const name of names) {
        if (!AUDIO_RE.test(name)) continue;

        const stem = String(name).replace(/\.[^.]+$/, '').trim();
        if (!stem) continue;

        const full = path.join(sub.dir, name);
        try {
          const st = await fsp.stat(full);
          if (!st.isFile()) continue;
          localByStem[stem] = { filename: name, path: full, mtimeMs: st.mtimeMs, size: st.size };
        } catch {}
      }
    } catch {
      // directory missing/unmounted -> treat as none downloaded
    }

    // 3) Helper to compute the SAME id stem your downloader uses:
    //    id = sha1(guid || stripQueryHash(enclosureUrl)).slice(0, 12)
    function idStemForFeedItem(ep) {
      const guid = String(ep?.guid || '').trim();
      if (guid) {
        return crypto.createHash('sha1').update(guid).digest('hex').slice(0, 12).toLowerCase();
      }

      const rawUrl = String(ep?.enclosure || '').trim();
      if (!rawUrl) return '';

      const seed = stripQueryHash(rawUrl);
      if (!seed) return '';

      return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12).toLowerCase();
    }

    // 3.5) Map episode art by enclosure (normalized) for extra safety
    // NOTE: this uses the already-mapped per-item ep.image from fetchPodcastRSS()
    const epImgByEnc = new Map();
    for (const it of feedItems) {
      const enc = String(it?.enclosure || '').trim();
      if (!enc) continue;
      const img = String(it?.image || it?.imageUrl || '').trim();
      if (!img) continue;
      epImgByEnc.set(stripQueryHash(enc), img);
    }

    // 4) Build merged list from feed
    const episodes = [];
    const seenStems = new Set();

    for (const ep of feedItems) {
      const enclosure = String(ep?.enclosure || '').trim(); // from RSS
      const stem = idStemForFeedItem(ep);
      if (!stem) continue;

      seenStems.add(stem);

      const local = localByStem[stem] || null;
      const downloaded = !!local;

      const title = String(ep?.title || '').trim();

      // Accept multiple incoming date shapes
      const date = yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || '');
      const published =
        (typeof ep?.published === 'number') ? ep.published :
        (() => {
          const d = new Date(ep?.isoDate || ep?.pubDate || ep?.date || '');
          const t = d.getTime();
          return Number.isFinite(t) ? t : null;
        })();

      // ✅ Episode-first art, then show fallback
      const episodeImageUrl =
        (enclosure ? (epImgByEnc.get(stripQueryHash(enclosure)) || '') : '') ||
        String(ep?.image || ep?.imageUrl || '').trim() ||
        showImageUrl ||
        '';

      episodes.push({
        id: stem,                  // 12-hex
        key: `id:${stem}`,         // what delete endpoint expects
        title: title || '(untitled)',
        date: date || '',
        published,
        enclosure,                 // for download-one
        imageUrl: episodeImageUrl, // ✅ UI will send this to /download-one
        downloaded,
        filename: downloaded ? local.filename : '',
        mpdPath: downloaded ? `${sub.mpdPrefix}/${local.filename}` : ''
      });
    }

    // 5) Also include downloaded files that are NOT in the current scan window
    for (const stem of Object.keys(localByStem)) {
      if (seenStems.has(stem)) continue;
      const local = localByStem[stem];

      episodes.push({
        id: stem,
        key: `id:${stem}`,
        title: '(downloaded — not in feed scan)',
        date: '',
        published: null,
        enclosure: '',
        imageUrl: showImageUrl || '',   // best available fallback
        downloaded: true,
        filename: local.filename,
        mpdPath: `${sub.mpdPrefix}/${local.filename}`
      });
    }

    // 6) Sort newest-first: published desc, else feed items before “downloaded-only”, else title
    episodes.sort((a, b) => {
      const ap = (typeof a.published === 'number') ? a.published : -1;
      const bp = (typeof b.published === 'number') ? b.published : -1;
      if (bp !== ap) return bp - ap;

      if (a.published === null && b.published !== null) return 1;
      if (b.published === null && a.published !== null) return -1;

      return String(a.title).localeCompare(String(b.title));
    });

    return res.json({
      ok: true,
      rss,
      scanLimit,
      downloadedCount: Object.keys(localByStem).length,
      showImageUrl,
      episodes
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post('/podcasts/episodes/delete', async (req, res) => {
  const reqId = `del-${Date.now().toString(36)}`;
  const logp = (...a) => console.log(`[episodes/delete][${reqId}]`, ...a);
  const errp = (...a) => console.error(`[episodes/delete][${reqId}]`, ...a);

  try {
    logp('REQUEST body =', req.body);

    const { rss, episodeUrls } = req.body || {};

    if (!rss || !Array.isArray(episodeUrls) || episodeUrls.length === 0) {
      logp('VALIDATION FAILED', { rss, episodeUrls });
      return res.status(400).json({
        ok: false,
        error: 'Missing rss or episodeUrls[]'
      });
    }

    /* --------------------------------------------------
     * 1) Load subscription
     * -------------------------------------------------- */
    logp('Loading subscriptions');
    const subs = readSubs();
    const sub = subs.find(s => s.rss === rss);

    if (!sub) {
      logp('Subscription not found', rss);
      return res.status(404).json({
        ok: false,
        error: 'Subscription not found'
      });
    }

    const mapPath = sub.mapJson;
    const m3uPath = sub.outM3u;
    const dirPath = sub.dir;

    logp('Resolved paths', { mapPath, m3uPath, dirPath });

    /* --------------------------------------------------
     * 2) Load map JSON
     * -------------------------------------------------- */
    logp('Reading map JSON');
    const raw = await fs.promises.readFile(mapPath, 'utf8');
    const map = JSON.parse(raw);

    const itemsByUrl = map.itemsByUrl || {};
    logp('Map loaded', {
      keys: Object.keys(itemsByUrl).length
    });

    const deleted = [];
    const missing = [];
    const fileErrors = [];

    /* --------------------------------------------------
     * 3) Delete episodes
     * -------------------------------------------------- */
    for (const url of episodeUrls) {
      logp('Processing episode', url);

      const it = itemsByUrl[url];
      if (!it) {
        logp('Episode not found in map', url);
        missing.push(url);
        continue;
      }

      // Resolve on-disk path.
      // NOTE: it.file is often an MPD path like:
      //   USB/SamsungMoode/Podcasts/ShowName/abcdef123.mp3
      // so joining dirPath + it.file produces a bogus path.
      let filePath = '';

      if (it?.path) {
        // absolute on-disk path (preferred)
        filePath = String(it.path).trim();
      } else if (it?.file) {
        // derive disk filename from whatever is in it.file
        const base = path.basename(String(it.file).trim());
        if (base) filePath = path.join(dirPath, base);
      }

      logp('Resolved file path', {
        url,
        dirPath,
        itFile: it?.file || '',
        itPath: it?.path || '',
        filePath
      });

      if (filePath) {
        try {
          await fs.promises.unlink(filePath);
          logp('File deleted', { url, filePath });
        } catch (e) {
          errp('File delete failed', { url, filePath, error: e?.message || String(e) });
          fileErrors.push({ url, filePath, error: e?.message || String(e) });
        }
      } else {
        errp('No file/path for episode', { url });
        fileErrors.push({ url, filePath: '(none)', error: 'No file/path in map item' });
      }

      delete itemsByUrl[url];
      deleted.push(url);
      
      }

    /* --------------------------------------------------
     * 4) Write updated map
     * -------------------------------------------------- */
    logp('Writing updated map JSON');
    map.itemsByUrl = itemsByUrl;

    await fs.promises.writeFile(
      mapPath,
      JSON.stringify(map, null, 2) + '\n',
      'utf8'
    );

    /* --------------------------------------------------
     * 5) Rebuild M3U
     * -------------------------------------------------- */
    logp('Rebuilding m3u');

    const eps = Object.entries(itemsByUrl).map(
      ([enclosureUrl, it]) => ({ enclosureUrl, ...it })
    );

    eps.sort((a, b) => (b.published || 0) - (a.published || 0));

    const lines = [];
    for (const ep of eps) {
      if (ep.mpdPath) {
        lines.push(ep.mpdPath);
      } else if (ep.file) {
        lines.push(path.posix.join(sub.mpdPrefix || '', ep.file));
      }
    }

    await fs.promises.writeFile(
      m3uPath,
      lines.join('\n') + (lines.length ? '\n' : ''),
      'utf8'
    );

    logp('DELETE COMPLETE', {
      deleted: deleted.length,
      missing: missing.length,
      fileErrors: fileErrors.length
    });

    return res.json({
      ok: true,
      deletedCount: deleted.length,
      missingCount: missing.length,
      fileErrorsCount: fileErrors.length,
      deleted,
      missing,
      fileErrors
    });

  } catch (e) {
    errp('FATAL ERROR', e);
    return res.status(500).json({
      ok: false,
      error: e.message,
      stack: e.stack
    });
  }
});

// =========================
// Podcast playlist builder
// =========================

function isAudioFile(name) {
  return /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(String(name || ""));
}

async function listDownloadedAudioFilesSorted(dir) {
  // returns array of { name, mtimeMs }
  const ents = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const ent of ents) {
    if (!ent.isFile()) continue;
    if (!isAudioFile(ent.name)) continue;

    const full = path.join(dir, ent.name);
    try {
      const st = await fsp.stat(full);
      files.push({ name: ent.name, mtimeMs: st.mtimeMs || 0 });
    } catch {
      // ignore races
    }
  }

  // Newest first (matches “download-latest” vibe)
  files.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.name.localeCompare(b.name));
  return files;
}

async function writeRemotePlaylistM3u({ sshTarget, playlistName, lines, timeoutMs = 15000 }) {
  if (!sshTarget) throw new Error("writeRemotePlaylistM3u: missing sshTarget");
  if (!playlistName) throw new Error("writeRemotePlaylistM3u: missing playlistName");

  const remote = `/var/lib/mpd/playlists/${playlistName}.m3u`;
  const content = (Array.isArray(lines) ? lines : []).join("\n") + "\n";

  // minimal single-quote escaper for remote shell strings
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

  await new Promise((resolve, reject) => {
    const remoteCmd = `sudo tee ${shq(remote)} >/dev/null`;

    const child = spawn(
      "ssh",
      ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=7", sshTarget, remoteCmd],
      { stdio: ["pipe", "ignore", "pipe"] }
    );

    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ssh/tee timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on("data", d => (err += d.toString()));
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(err.trim() || `ssh/tee failed (code=${code})`));
    });

    child.stdin.end(content); // end() with data is nice + atomic
  });

  return remote;
}

async function mpdUpdatePrefix(mpdPrefix) {
  // Best-effort: refresh MPD db so new downloads appear
  if (!mpdPrefix) return;
  try {
    await new Promise((resolve) => {
      execFile(
        "mpc",
        ["-h", String(MPD_HOST), "-p", String(MPD_PORT), "update", mpdPrefix],
        { timeout: 60_000 },
        () => resolve()
      );
    });
  } catch {
    // ignore; playlist may still load if MPD already indexed it
  }
}

// POST /podcasts/build-playlist  { rss: "...", name?: "optional-playlist-name", newestFirst?: true, limit?: 500 }
// Builds a moOde playlist from *downloaded* files in sub.dir (never remote URLs).
app.post("/podcasts/build-playlist", async (req, res) => {
  try {
    const rss = normUrl(req.body?.rss);
    const newestFirst = req.body?.newestFirst !== false; // default true
    const limit = Math.max(1, Math.min(5000, Number(req.body?.limit || 500)));

    if (!rss) return res.status(400).json({ ok: false, error: "Missing/invalid rss" });

    const items = readSubs();
    const sub = items.find(it => normUrl(it?.rss) === rss);
    if (!sub) return res.status(404).json({ ok: false, error: "Subscription not found", rss });

    const dir = String(sub.dir || "").trim();
    const mpdPrefix = String(sub.mpdPrefix || "").trim();
    if (!dir || !mpdPrefix) {
      return res.status(400).json({
        ok: false,
        error: "Subscription missing dir/mpdPrefix (download folder). Re-subscribe or fix subscriptions.json.",
        rss,
        dir: dir || null,
        mpdPrefix: mpdPrefix || null,
      });
    }

    // playlist name: explicit > sub.slug > hash id
    const base =
      String(req.body?.name || "").trim() ||
      String(sub.slug || "").trim() ||
      makePodcastId(rss);

    const playlistName = `${base}-local`; // downloaded-only
    const playlistFile = `/var/lib/mpd/playlists/${playlistName}.m3u`;

    // Find local audio files (SMB mounts: avoid withFileTypes/isFile)
    const exts = new Set([".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wav"]);
    const entries = [];

    let names = [];
    try {
      names = fs.readdirSync(dir); // IMPORTANT: no withFileTypes
    } catch {
      names = [];
    }

    for (const name of names) {
      if (!exts.has(path.extname(name).toLowerCase())) continue;

      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        entries.push({ name, full, mtimeMs: st.mtimeMs || 0 });
      } catch {
        // ignore unreadable
      }
    }

    if (!entries.length) {
      return res.json({
        ok: true,
        rss,
        playlistName,
        wrote: false,
        reason: "No local audio files found in dir yet",
        dir,
        mpdPrefix,
        count: 0,
      });
    }

    // Sort
    entries.sort((a, b) =>
      newestFirst ? (b.mtimeMs - a.mtimeMs) : (a.mtimeMs - b.mtimeMs)
    );

    // Limit + build MPD paths
    const chosen = entries.slice(0, limit);
    const lines = chosen.map(x => `${mpdPrefix}/${x.name}`).join("\n") + "\n";

    // Write playlist into moOde via ssh + trigger MPD update for that folder
    const MOODE_HOST = process.env.MOODE_HOST || "10.0.0.254";
    const MOODE_USER = process.env.MOODE_USER || "moode";
    const MPD_PORT = Number(process.env.MPD_PORT || 6600);

    const execFileP = (cmd, args, opts = {}) =>
      new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { ...opts }, (err, stdout, stderr) => {
          if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            return reject(err);
          }
          resolve({ stdout, stderr });
        });

        if (opts.input != null) {
          child.stdin.end(opts.input);
        }
      });

    // 1) write playlist file (sudo tee)
    await execFileP(
      "ssh",
      [
        `${MOODE_USER}@${MOODE_HOST}`,
        "sudo", "tee", playlistFile
      ],
      { input: lines, maxBuffer: 10 * 1024 * 1024 }
    );

    // 2) ask MPD to update that folder so it sees newly downloaded files
    await execFileP("mpc", ["-h", MOODE_HOST, "-p", String(MPD_PORT), "update", mpdPrefix]);

    return res.json({
      ok: true,
      rss,
      playlistName,
      playlistFile,
      dir,
      mpdPrefix,
      newestFirst,
      limit,
      count: chosen.length,
      sample: chosen.slice(0, 5).map(x => x.name),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// 1) Follow redirects and return a stable URL (no query/hash)
async function resolveFinalNoQueryUrl(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (!u) return "";

  // Try HEAD first (fast)
  try {
    const r = await fetch(u, { method: "HEAD", redirect: "follow" });
    const finalUrl = r.url || u;
    return finalUrl.split(/[?#]/)[0];
  } catch {}

  // Fallback: tiny GET (some hosts reject HEAD)
  try {
    const r = await fetch(u, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
    const finalUrl = r.url || u;
    return finalUrl.split(/[?#]/)[0];
  } catch {
    return u.split(/[?#]/)[0];
  }
}

// 2) Make a filesystem-safe filename from the final URL
function filenameFromUrl(finalNoQ) {
  const base = String(finalNoQ || "").split("/").pop() || "episode.mp3";
  // keep it simple + safe
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
}

// 3) Return full local output path for a podcast dir + url
async function planPodcastDownload({ podDir, rawUrl }) {
  const finalNoQ = await resolveFinalNoQueryUrl(rawUrl);
  const filename = filenameFromUrl(finalNoQ);
  const outPath = `${String(podDir).replace(/\/+$/,"")}/${filename}`;
  return { finalNoQ, filename, outPath };
}

// =========================
// Local disk truth helpers (for map/m3u rebuild)
// =========================

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|mp4)$/i;

function normalizeYyyyMmDd(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYYMMDD
  const m8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m8) return `${m8[1]}-${m8[2]}-${m8[3]}`;

  // YYYY-MM or YYYY
  const mY = s.match(/^(\d{4})(?:-(\d{2}))?/);
  if (mY) return mY[1];

  // try Date parse
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return '';
}

async function ffprobeTags(absPath) {
  // Requires: execFileP already exists in your file (you use it elsewhere)
  try {
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_entries', 'format_tags',
      absPath
    ], { timeout: 8000, maxBuffer: 1024 * 1024 });

    const j = JSON.parse(String(stdout || '{}'));
    const tags = j?.format?.tags || {};
    // common keys: title, artist, album, date, year, comment, description
    return tags;
  } catch {
    return {};
  }
}


app.post('/podcasts/download-one', async (req, res) => {
  try {
    // -----------------------------
    // Inputs + validation
    // -----------------------------
    const rss = normUrl(req.body?.rss);
    const id  = String(req.body?.id || '').trim().toLowerCase();
    const enclosure = String(req.body?.enclosure || '').trim();
    const imageUrl  = String(req.body?.imageUrl || '').trim();

    if (!rss) return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });
    if (!/^[a-f0-9]{12}$/.test(id)) return res.status(400).json({ ok: false, error: 'Missing/invalid id' });
    if (!/^https?:\/\//i.test(enclosure)) return res.status(400).json({ ok: false, error: 'Missing/invalid enclosure' });

    // -----------------------------
    // Subscription lookup
    // -----------------------------
    const subs = readSubs();
    const sub = subs.find(it => normUrl(it?.rss) === rss);
    if (!sub) return res.status(404).json({ ok: false, error: 'Subscription not found', rss });

    if (!sub.dir || !sub.mpdPrefix) {
      return res.status(400).json({
        ok: false,
        error: 'Subscription missing required fields (dir/mpdPrefix)',
        rss
      });
    }

    // -----------------------------
    // Derived metadata (compute once)
    // -----------------------------
    const rawTitle = String(req.body?.title || '').trim();
    const rawDate  = String(req.body?.date  || '').trim(); // prefer YYYY-MM-DD
    const show     = String(sub?.title || sub?.name || 'Podcast').trim();

    // Optional: normalize date/year tags (useful inside embedArtWithFfmpeg if you support both)
    const dateTag = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
    const yearTag =
      /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate.slice(0, 4) :
      /^\d{4}$/.test(rawDate) ? rawDate :
      '';

    // -----------------------------
    // Dest + temp files (same dir)
    // -----------------------------
    const finalName = `${id}.mp3`;
    const finalPath = path.join(sub.dir, finalName);
    await ensureDir(finalPath);

    const destDir = path.dirname(finalPath);
    const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    const mp3Tmp = path.join(destDir, `.${finalName}.${nonce}.dl.tmp.mp3`);
    const jpgTmp = path.join(destDir, `.${id}.${nonce}.tmp.jpg`);
    const outTmp = path.join(destDir, `.${finalName}.${nonce}.tagged.tmp.mp3`);

    let embeddedArt = false;

    try {
      // 1) Download MP3
      await downloadToFile(enclosure, mp3Tmp, { retries: 3 });

      // 2) Optionally embed art
      let toInstall = mp3Tmp;

      if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
        await downloadToFile(imageUrl, jpgTmp, { retries: 3 });

        await embedArtWithFfmpeg({
          mp3In: mp3Tmp,
          imgIn: jpgTmp,
          mp3Out: outTmp,

          // tags
          title: rawTitle,
          show,
          date: dateTag,     // YYYY-MM-DD or ''
          year: yearTag      // YYYY or ''
        });

        const ok = await hasAttachedPic(outTmp);
        if (ok) {
          toInstall = outTmp;
          embeddedArt = true;
        } else {
          toInstall = mp3Tmp;
          embeddedArt = false;
        }
      }

      // 3) Atomic install (same-dir rename strategy)
      await replaceFileAtomic(toInstall, finalPath);

      return res.json({
        ok: true,
        rss,
        id,
        filename: finalName,
        mpdPath: `${sub.mpdPrefix}/${finalName}`,
        embeddedArt
      });

    } finally {
      await safeUnlink(mp3Tmp);
      await safeUnlink(jpgTmp);
      await safeUnlink(outTmp);
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});


app.post("/podcasts/download-latest", async (req, res) => {
  try {
    const rss = normUrl(req.body?.rss);
    const count = Math.max(0, Math.min(50, Number(req.body?.count ?? 5))); // allow 0 = rebuild-only

    if (!rss) {
      return res.status(400).json({ ok: false, error: "Missing/invalid rss" });
    }

    const subs = readSubs();
    const sub = subs.find(it => normUrl(it?.rss) === rss);
    if (!sub) {
      return res.status(404).json({ ok: false, error: "Subscription not found", rss });
    }

    // Required for disk + moOde paths + map outputs
    if (!sub.dir || !sub.mpdPrefix || !sub.outM3u || !sub.mapJson) {
      return res.status(400).json({
        ok: false,
        error: "Subscription missing required fields (dir/mpdPrefix/outM3u/mapJson)",
        rss
      });
    }

    await fsp.mkdir(sub.dir, { recursive: true });

    // 1) Fetch RSS items (scan window)
    const limit = Number(sub.limit || 200);
    const scanN = Math.max(count, Math.min(limit, 200));

    // IMPORTANT: we want enough items even when count=0 so rebuild-only can repair titles
    const feed = await fetchPodcastRSS(rss, scanN);
    // refresh / repair cover if missing or replaced
    await downloadCoverForSub(sub, feed);
    const feedItems = Array.isArray(feed?.items) ? feed.items : [];
    const episodes = feedItems.slice(0, count);

    // 2) Existing downloaded filenames in the SAVE directory (Pi4 samba mount)
    const existing = new Set();
    try {
      for (const f of fs.readdirSync(sub.dir)) existing.add(f);
    } catch {}

    const results = [];

    // 3) Download newest N using stable local filenames (sha1(guid||canonUrl))
    for (const ep of episodes) {
      const rawUrl = String(ep?.enclosure || "").trim();
      if (!rawUrl) continue;

      const finalUrl = await resolveFinalUrl(rawUrl);
      const canonUrl = stripQueryHash(finalUrl || rawUrl);

      const guid = String(ep?.guid || "").trim();
      const seed = guid || canonUrl;
      const id = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);

      let ext = ".mp3";
      try {
        const u = new URL(canonUrl);
        const base = path.basename(u.pathname) || "";
        const m = base.toLowerCase().match(/\.(mp3|m4a|aac|mp4)$/);
        if (m) ext = `.${m[1]}`;
      } catch {}

      const filename = safeFileName(`${id}${ext}`, `episode${ext}`);

      if (existing.has(filename)) {
        results.push({ ok: true, skipped: true, id, filename });
        continue;
      }

      const outPath = path.join(sub.dir, filename);
      await downloadWithFetch(canonUrl, outPath);
      existing.add(filename);

      // Tag best-effort (don’t fail the request if tagging fails)
      try {
        await tagAudioFileWithFfmpeg(outPath, {
          title: String(ep?.title || "").trim() || id,
          album: String(sub.title || "").trim() || "Podcast",
          artist: String(sub.title || "").trim() || "Podcast",
          date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || ""),
          genre: "Podcast",
          comment: canonUrl
        });
      } catch {}

      results.push({
        ok: true,
        skipped: false,
        id,
        filename,
        saved: {
          path: outPath,
          mpdPath: `${sub.mpdPrefix}/${filename}`
        }
      });
    }

    // 4) Rebuild map/m3u from LOCAL DISK but enriched with RSS metadata (title/date)
    // Build metaByStem keyed by the SAME id derivation used for filenames (sha1(guid||canonUrl)).slice(0,12)
    const metaByStem = Object.create(null);

    for (const ep of feedItems) {
      const rawUrl = String(ep?.enclosure || "").trim();
      if (!rawUrl) continue;

      const finalUrl = await resolveFinalUrl(rawUrl);
      const canonUrl = stripQueryHash(finalUrl || rawUrl);

      const guid = String(ep?.guid || "").trim();
      const seed = guid || canonUrl;
      const id = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 12);

      metaByStem[id] = {
        title: String(ep?.title || "").trim(),
        date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || "")
      };
    }

    // Local truth = disk (which files exist), but enrich with RSS meta so titles aren’t "(untitled)"
    const localItems = await getLocalItemsForSub(sub, metaByStem);

    const mapRes = await buildPodcastMapFromLocalItems({
      sub,
      items: localItems,
      outM3u: sub.outM3u,
      mapJson: sub.mapJson
    });

    // 5) Rebuild moOde playlist (optional)
    try {
      await buildLocalPlaylistForRss({ rss: sub.rss });
    } catch {}

    return res.json({
      ok: true,
      rss,
      requested: count,
      processed: results.length,
      results,
      map: mapRes
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/podcasts/refresh", async (req, res) => {
  try {
    const items = readSubs();
    const results = [];

    for (const it of items) {
      const rss = normUrl(it.rss);
      const outM3u = String(it.outM3u || "").trim();
      const limit = Number(it.limit || 200);

      if (!rss || !outM3u) continue;

      try {
        const r = await buildPodcastMap({ rss, outM3u, limit });
        results.push({
          ok: true,
          rss,
          outM3u: r.outM3u,
          outJson: r.outJson,
          m3uItems: r.m3uCount,
          mapKeys: r.keyCount,
        });
      } catch (e) {
        results.push({
          ok: false,
          rss,
          outM3u,
          error: e?.message || String(e),
        });
      }
    }

    res.json({
      ok: true,
      refreshed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/podcasts/refresh", async (req, res) => {
  try {
    const items = readSubs();

    const next = await Promise.all(items.map(async (s) => {
      const dir = String(s?.dir || "").trim();
      let downloadedCount = 0;

      if (dir) {
        try {
          const names = await fsp.readdir(dir);
          downloadedCount = names.filter(n => /\.(mp3|m4a|aac|mp4)$/i.test(n)).length;
        } catch { /* ignore */ }
      }

      return { ...s, downloadedCount };
    }));

    // persist so the UI can just GET /podcasts afterward too
    writeSubs(next);

    res.json({ ok: true, items: next });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// DROP-IN: POST /podcasts/refresh-one  (+ GET alias like your /podcasts/refresh)
// Matches subscription by rss (preferred) or outM3u.
// Reuses your existing readSubs(), normUrl(), buildPodcastMap().

app.post("/podcasts/refresh-one", async (req, res) => {
  try {
    const items = readSubs();

    const rssIn = normUrl(req.body?.rss || req.query?.rss);
    const outM3uIn = String(req.body?.outM3u || req.query?.outM3u || "").trim();

    if (!rssIn && !outM3uIn) {
      return res.status(400).json({ ok: false, error: "Provide rss or outM3u" });
    }

    // find the one subscription
    const it = items.find(x => {
      const rss = normUrl(x?.rss);
      const outM3u = String(x?.outM3u || "").trim();
      return (rssIn && rss && rss === rssIn) || (outM3uIn && outM3u && outM3u === outM3uIn);
    });

    if (!it) {
      return res.status(404).json({
        ok: false,
        error: "Subscription not found",
        rss: rssIn || null,
        outM3u: outM3uIn || null,
      });
    }

    const rss = normUrl(it.rss);
    const outM3u = it.outM3u;
    const limit = Number(it.limit || 200);

    if (!rss || !outM3u) {
      return res.status(400).json({ ok: false, error: "Subscription missing rss/outM3u" });
    }

    const r = await buildPodcastMap({ rss, outM3u, limit });

    const result = {
      rss,
      outM3u: r.outM3u,
      outJson: r.outJson,
      m3uItems: r.m3uCount,
      mapKeys: r.keyCount,
    };

    res.json({ ok: true, refreshed: 1, results: [result] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/podcasts/refresh-one", async (req, res) => {
  try {
    const outM3u = String(req.query.outM3u || "").trim();
    if (!outM3u) {
      return res.status(400).json({ ok: false, error: "Missing outM3u", rss: null, outM3u: null });
    }

    const items = readSubs();
    const sub = items.find((it) => String(it?.outM3u || "").trim() === outM3u);

    if (!sub) {
      return res.status(404).json({ ok: false, error: "Subscription not found", rss: null, outM3u });
    }

    const rss = normUrl(sub.rss);
    const limit = Number(sub.limit || 200);

    if (!rss) {
      return res.status(400).json({ ok: false, error: "Subscription has invalid rss", rss: null, outM3u });
    }

    const r = await buildPodcastMap({ rss, outM3u, limit });

    return res.json({
      ok: true,
      refreshed: 1,
      results: [{
        rss,
        outM3u: r.outM3u,
        outJson: r.outJson,
        m3uItems: r.m3uCount,
        mapKeys: r.keyCount,
      }],
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}); 
const SUBS_FILE = "/home/brianwis/album_art/podcasts/subscriptions.json";

function readSubs() {
  try {
    const raw = fs.readFileSync(SUBS_FILE, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}

function writeSubs(items) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify({ items }, null, 2));
}

function normUrl(u) {
  return String(u || "").trim();
}

function slugFromUrl(u) {
  // stable-ish slug based on URL hash
  const h = crypto.createHash("sha1").update(u).digest("hex").slice(0, 10);
  return `pod-${h}`;
}

registerPodcastSubscriptionRoutes(app, {
  normUrl,
  readSubs,
  writeSubs,
  makePodcastId,
  fetchPodcastRSS,
  downloadCoverForSub,
  syncSubscriptionInitial,
  execFileP,
});

// =========================
// Favorites (toggle current track in Favorites.m3u)
// =========================
//
// Accepts either:
//   POST /favorites/toggle   { favorite: true|false }
//   POST /favorite/current   { favorite: true|false }   (alias)
//
// Response:
//   { ok:true, isFavorite:true|false, file:"...", disabled?:true }
//

async function favoriteHandler(req, res) {
  try {
    const want = !!req?.body?.favorite;

    const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
    const file = String(song?.file || '').trim();

    // disable for stream/airplay/no file
    if (!file || isStreamPath(file) || isAirplayFile(file)) {
      return res.json({ ok: true, file: file || '', isFavorite: false, disabled: true });
    }

    // ✅ Do the real change on moOde by editing Favorites.m3u
    const out = await favoritesSetViaSsh(file, want);

    // Refresh favorites cache (best effort)
    try { await refreshFavoritesFromMpd(); } catch {}

    // Trust the SSH result as truth
    return res.json({ ok: true, file, isFavorite: !!out.isFavorite });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

app.post('/favorites/toggle', favoriteHandler);
app.post('/favorite/current', favoriteHandler); // alias


app.get('/now-playing', async (req, res) => {
  const debug = req.query.debug === '1';
  const dlog = (...args) => { if (debug) log.debug(...args); };

  function serveCached(reason, errMsg = '') {
    if (lastNowPlayingOk) {
      const ageMs = Date.now() - lastNowPlayingTs;
      return res.status(200).json({
        ...lastNowPlayingOk,
        _stale: true,
        _staleAgeMs: ageMs,
        ...(debug ? { _staleReason: reason, _staleError: errMsg } : {}),
      });
    }
    return res.status(503).json({
      error: 'now-playing unavailable',
      ...(debug ? { reason, err: errMsg } : {}),
    });
  }

  // Minimal helper: "24/192" -> "24-bit / 192 kHz"
  function formatHiresLabel(label) {
    const s = String(label || '').trim();
    const m = s.match(/^(\d{2})\s*\/\s*(\d{2,3})(?:\.(\d+))?$/);
    if (!m) return s;
    const bit = m[1];
    const khz = m[2];
    const frac = m[3] ? `.${m[3]}` : '';
    return `${bit}-bit / ${khz}${frac} kHz`;
  }

  // RADIO helper: split "Artist - Title" patterns safely
  function splitArtistTitleFromTitle(rawTitle) {
    const t0 = decodeHtmlEntities(String(rawTitle || '').trim());
    if (!t0) return { artist: '', title: '' };

    const seps = [' - ', ' — ', ' – ', ' —', '–', '—'];
    for (const sep of seps) {
      if (!t0.includes(sep)) continue;
      const parts = t0.split(sep).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { artist: parts[0], title: parts.slice(1).join(sep.trim()) };
      }
    }
    return { artist: '', title: '' };
  }

  function artistLooksGeneric(a) {
    const s = String(a || '').trim();
    if (!s) return true;
    if (/^radio\s*station$/i.test(s)) return true;
    if (/^unknown$/i.test(s)) return true;
    if (/^stream$/i.test(s)) return true;
    return false;
  }

  // Build a deterministic Apple lookup term (keeps cache stable)
  function buildAppleLookupTerm({ artist, title, album }) {
    const a = String(artist || '').trim();
    const t = String(title || '').trim();
    const al = String(album || '').trim();

    const parts = [];
    if (a) parts.push(a);
    if (t) parts.push(t);
    if (al) parts.push(al);
    return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  try {
    // 1) Fetch moOde/MPD snapshots
    let song, statusRaw;
    try {
      song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
    } catch (e) {
      return serveCached('get_currentsong_failed', e?.message || String(e));
    }

    try {
      statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);
    } catch (e) {
      return serveCached('status_failed', e?.message || String(e));
    }

    const status = normalizeMoodeStatus(statusRaw);

    const songpos = String(moodeValByKey(statusRaw, 'song') || '').trim();
    const songid  = String(moodeValByKey(statusRaw, 'songid') || '').trim();

    const file = String(song.file || '').trim();
    const isLocalPodcast = isLocalPodcastFile(file);
    const stream = isStreamPath(file);
    const airplay =
      isAirplayFile(file) || (String(song.encoded || '').toLowerCase() === 'airplay');

    const streamKind = stream ? String(getStreamKind(file) || '').trim() : '';
    const isUpnp = streamKind === 'upnp';
    const isRadio = stream && streamKind === 'radio';

    // 2) Base metadata
    let artist = song.artist || '';
    let title  = song.title  || '';
    let album  = song.album  || '';

    // Machine-readable date for clients
    // - songs: keep YYYYMM (no day)
    // - podcasts: override from MPD via mpc (YYYY-MM-DD)
    let dateOut = '';

    {
      const s = String(song.date || '').trim();
      const m = s.match(/^(\d{4})(\d{2})/); // YYYYMM or YYYYMMDD
      if (m) dateOut = `${m[1]}${m[2]}`;    // month precision default
    }
    
    // ✅ Podcast date must come from MPD (moOde JSON loses day precision)
    if (isLocalPodcast) {
        const mpdDate = String(await getMpdCurrentDateTag()).trim();

        // Only override if MPD gives full day precision
        if (/^\d{4}-\d{2}-\d{2}$/.test(mpdDate)) {
            dateOut = mpdDate;
        }
    }
    
    // 3) Art + extras
    let altArtUrl = '';
    let producer = '';
    let personnel = [];

    let radioAlbum = '';
    let radioYear = '';
    let radioLabel = '';
    let radioComposer = '';
    let radioWork = '';
    let radioPerformers = '';

    let debugItunesReason = '';

    let stationLogoUrl = '';
    let primaryArtUrl = '';

    // ✅ Apple Music link fields (RADIO)
    let radioItunesUrl = '';
    let radioTrackUrl = '';
    let radioAlbumUrl = '';
    let radioLookupReason = '';
    let radioLookupTerm = '';

    // Default art scaffolding
    if (stream) {
      stationLogoUrl = song.coverurl ? normalizeCoverUrl(song.coverurl, MOODE_BASE_URL) : '';
      primaryArtUrl = stationLogoUrl || '';
    } else if (!airplay && file) {
      primaryArtUrl = `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(file)}`;
    }
    
    // =========================
    // RADIO: iHeart "blob" cleanup
    // =========================
    function looksLikeIheartBlob(t) {
        const s = String(t || '').trim();
        if (!s) return false;

        // ✅ Sponsor/ad blob (does NOT contain text="..." / TPID= reliably)
        if (/(^|[\s,])adContext="[^"]+"/i.test(s)) return true;

        // Existing “track blob” signature
        return /(^|\s)text="[^"]+"/i.test(s) && /\bTPID="\d+"/.test(s);
    }

    if (isRadio && looksLikeIheartBlob(title)) {
        const parsed = parseIheartTitleBlob(title);

        if (parsed?.artist) {
            artist = parsed.artist;
        }

        if (parsed?.title) {
            title = parsed.title;
        }

        if (debug) {
            dlog('[iheart] cleaned', {
                artist,
                title,
                art: parsed?.artUrl,
            });
        }
    }
    // --- per-request flag (do NOT keep podcast state globally)
    // Primary truth: local file path indicates "podcast mode" even if enrichment misses.
    let isPodcast = isLocalPodcast;
    let playbackUrl = '';

    // =========================
    // PODCAST: enrich using RSS-built JSON maps
    // =========================
    try {
        // Helper mutates payload in place.
        const tmp = {
                artist,
                title,
                album,
                file,
                albumArtUrl: '',
                encoded: song.encoded || '',
        };

        await enrichPodcastNowPlaying(tmp);

        // Treat any of these as “enriched podcast”
        const enrichedPodcast =
                tmp.podcast === true ||
                tmp.isPodcast === true ||
                tmp.podcastEpisode === true;

        if (enrichedPodcast) {
                isPodcast = true;

                // Show name: prefer explicit show fields; otherwise fall back to album/artist.
                // (NPR-style feeds often put the show title in album, with artist = "Unknown artist".)
                const showTitle = String(
                        tmp.podcastTitle ||
                        tmp.showTitle ||
                        tmp.show ||
                        tmp.album ||
                        tmp.artist ||
                        ''
                ).trim();

                // Episode title: prefer enriched title, else keep existing
                const episodeTitle = String(tmp.title || title || '').trim();

                // Human-friendly episode date (YYYY-MM-DD → "Feb 5, 2026")
                const epDateLine = formatPodcastDate(tmp.published);

                // ✅ Podcast display mapping
                //   artist → show name
                //   title  → episode title
                //   album  → published date (human-friendly)
                if (showTitle)      artist = showTitle;
                if (episodeTitle)   title  = episodeTitle;
                if (epDateLine)     album  = epDateLine;

                // Machine-readable date for clients (podcasts want day precision)
                // Prefer MPD tag (mpc) because moOde JSON can lose the day (e.g., "202602")
                const mpdDate = String(await getMpdCurrentDateTag()).trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(mpdDate)) {
                        dateOut = mpdDate;
                } else {
                        const pub = String(tmp.published || tmp.date || tmp.pubDate || '').trim();
                        if (pub) dateOut = pub; // expect YYYY-MM-DD
                }

                // Prefer stable playback URL (strip tracking / redirect wrappers)
                const canonUrl = canonicalizePodcastUrl(file);
                if (canonUrl) {
                        tmp.playbackUrl = canonUrl;
                        playbackUrl = canonUrl;
                }

                // Podcast art becomes primary art
                if (tmp.albumArtUrl) {
                        primaryArtUrl = tmp.albumArtUrl;
                        stationLogoUrl = '';
                }

                if (debug) {
                        dlog('[podcast] enriched', {
                                enrichedPodcast,
                                showTitle: artist,
                                episodeTitle: title,
                                dateLine: album,
                                primaryArtUrl,
                                published: tmp.published,
                                mpdDate,
                                dateOut,
                                episodeId: tmp.episodeId,
                                playbackUrl,
                        });
                }
        }
    } catch (e) {
        if (debug) dlog('[podcast] enrich failed', e?.message || String(e));
    }
   
    
    const aplArtUrl = `${PUBLIC_BASE_URL}/art/current_320.jpg`;

    // ✅ ratings allowed only for local files
    const ratingsAllowed = (!stream && !airplay && !!file);

    // =========================
    // AIRPLAY (authoritative aplmeta.txt, unchanged behavior)
    // =========================
    if (airplay) {
      let airplayInfoLine = 'AirPlay';
      try {
        const aplText = await fetchText(`${MOODE_BASE_URL}/aplmeta.txt`, 'text/plain');
        const ap = parseAplmeta(aplText);

        artist = ap.artist || artist || '';
        title  = ap.title  || title  || '';
        album  = ap.album  || album  || 'AirPlay Source';

        altArtUrl = ap.coverUrl || '';
        airplayInfoLine = ap.format || 'AirPlay';
      } catch {}

      const rawArtUrl = (altArtUrl && altArtUrl.trim())
        ? altArtUrl.trim()
        : (primaryArtUrl || '');

      if (rawArtUrl) {
        updateArtCacheIfNeeded(rawArtUrl).catch(e => console.warn('[art] failed', e.message));
      }

      const payload = {
        artist: artist || '',
        title: title || '',
        album: album || '',
        file: file || 'AirPlay Active',

        songpos,
        songid,

        albumArtUrl: primaryArtUrl || '',
        aplArtUrl,
        altArtUrl: altArtUrl || '',

        stationLogoUrl: '',

        // RADIO fields (empty on AirPlay)
        radioAlbum: '',
        radioYear: '',
        radioLabel: '',
        radioComposer: '',
        radioWork: '',
        radioPerformers: '',
        radioItunesUrl: '',
        radioTrackUrl: '',
        radioAlbumUrl: '',
        radioLookupReason: '',
        radioLookupTerm: '',

        state: status.state || song.state,
        elapsed: status.elapsed,
        duration: status.duration,
        percent: status.percent,

        year: '',
        label: '',
        producer: '',
        personnel: [],

        encoded: airplayInfoLine,
        bitrate: song.bitrate || '',
        outrate: song.outrate || '',
        volume: song.volume || '0',
        mute: song.mute || '0',
        track: song.track || '',
        date: dateOut || '',

        isStream: false,
        isAirplay: true,
        streamKind: '',
        isUpnp: false,

        isFavorite: false,

        // rating fields always present
        rating: 0,
        ratingDisabled: true,
        ratingFile: '',

        ...(debug ? { debugAplmetaUrl: `${MOODE_BASE_URL}/aplmeta.txt` } : {}),
      };
      
      await enrichPodcastNowPlaying(payload);

      lastNowPlayingOk = payload;
      lastNowPlayingTs = Date.now();
      return res.json(payload);
    }

    // =========================
    // STREAM: Mother Earth side-channel metadata (radio only)
    // =========================
    let meStation = null;
    let meMeta = null;

    if (isRadio) {
      meStation = matchMotherEarthStation(file);
      if (meStation) {
        try {
          meMeta = await fetchMotherEarthMeta(meStation);
          if (meMeta) {
            artist = meMeta.artist || artist || '';
            title  = meMeta.title  || title  || '';
            album  = meMeta.album  || album  || '';

            if (meMeta.art) primaryArtUrl = meMeta.art;

            radioAlbum = meMeta.album || radioAlbum || '';
          }
        } catch (e) {
          dlog('[mother-earth] meta failed:', e?.message || String(e));
        }
      }
    }

    // =========================
    // STREAM: UPnP resolver (upnp only)
    // =========================
    let debugArtUpgraded = false;
    let debugResolvedFile = '';
    let debugArtErr = '';

    if (stream && isUpnp) {
      try {
        const hasResolverInputs =
          !!songpos || !!songid ||
          !!String(song.title || '').trim() ||
          !!String(song.artist || '').trim() ||
          !!String(song.album || '').trim() ||
          !!String(song.track || '').trim();

        if (hasResolverInputs) {
          const realFile = await resolveLibraryFileForStream({
            songid,
            songpos,
            title: song.title || '',
            artist: song.artist || '',
            album: song.album || '',
            track: song.track || '',
          });

          debugResolvedFile = realFile || '';
          if (realFile) {
            primaryArtUrl = `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(realFile)}`;
            debugArtUpgraded = true;
          }
        }
      } catch (e) {
        debugArtErr = e?.message || String(e);
        dlog('UPnP/stream art upgrade failed:', debugArtErr);
      }
    }

    // =========================
    // RADIO: extract performers from verbose title lines
    // =========================
    if (isRadio && title) {
      const split = splitTitlePerformersProgram(title);
      if (split) {
        title = split.work;

        const set = new Set(
          (Array.isArray(personnel) ? personnel : [])
            .map(p => String(p).trim())
            .filter(Boolean)
        );

        for (const p of split.personnel) set.add(p);
        personnel = Array.from(set);
      }
    }

    // =========================
    // RADIO: normalize displayed artist/title from "Artist - Title"
    // =========================
    if (isRadio) {
      const a0 = String(artist || '').trim();

      if (artistLooksGeneric(a0)) {
        const split = splitArtistTitleFromTitle(title);
        if (split.artist && split.title) {
          artist = split.artist;
          title  = split.title;
        }
      } else {
        const decoded = decodeHtmlEntities(String(title || '').trim());
        const prefix = `${a0} - `;
        if (decoded.toLowerCase().startsWith(prefix.toLowerCase())) {
          title = decoded.slice(prefix.length).trim();
        }
      }
    }

    // =========================
    // FILE: deep tags
    // =========================
    const deep = stream
      ? { year: '', label: '', producer: '', performers: [] }
      : await getDeepMetadataCached(file);

    producer = deep.producer || '';
    personnel = deep.performers || [];

    // =========================
    // STREAM: iTunes art + album/year fallback (RADIO ONLY)
    // (Also captures links when available, without clobbering later.)
    // =========================
    if (isRadio && (!primaryArtUrl || primaryArtUrl === stationLogoUrl)) {
      const a = String(artist || '').trim();
      const t = String(title || '').trim();

      if (a && t && !artistLooksGeneric(a)) {
        const it = await lookupItunesFirst(a, t, debug, { radioAlbum: radioAlbum || album || '' });

        if (it.url) primaryArtUrl = it.url;

        radioAlbum = radioAlbum || it.album || '';
        radioYear  = it.year || '';

        // Links (best effort)
        if (!radioTrackUrl) radioTrackUrl = String(it.trackUrl || '').trim();
        if (!radioAlbumUrl) radioAlbumUrl = String(it.albumUrl || '').trim();
        if (!radioItunesUrl) radioItunesUrl = radioAlbumUrl || radioTrackUrl || '';

        dlog('[radio links]', { radioItunesUrl, radioAlbumUrl, radioTrackUrl });
        debugItunesReason = it.reason || '';
      } else {
        const decodedTitle = decodeHtmlEntities(song.title || '');
        const parts = decodedTitle.split(' - ').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const it = await lookupItunesFirst(parts[0], parts.slice(1).join(' - '), debug, { radioAlbum: radioAlbum || album || '' });
          if (it.url) primaryArtUrl = it.url;

          radioAlbum = radioAlbum || it.album || '';
          radioYear  = it.year || '';
          debugItunesReason = it.reason || '';

          // Links (best effort)
          if (!radioTrackUrl) radioTrackUrl = String(it.trackUrl || '').trim();
          if (!radioAlbumUrl) radioAlbumUrl = String(it.albumUrl || '').trim();
          if (!radioItunesUrl) radioItunesUrl = radioAlbumUrl || radioTrackUrl || '';
        } else {
          debugItunesReason = 'no-parse';
        }
      }

      if (!album && radioAlbum) album = radioAlbum;
    } else if (isRadio) {
      debugItunesReason = meStation ? 'skip:mother-earth-or-primary' : 'skip';
    } else if (stream) {
      debugItunesReason = `skip:${streamKind || 'stream'}`;
    }

    // Secondary art:
    if (stream && stationLogoUrl) altArtUrl = stationLogoUrl;

    // =========================
    // ✅ RADIO: Apple Music link lookup (USING lookupItunesFirst)
    // - No undefined helper
    // - Never blanks links on error
    // - Only fills if missing (won't clobber values from earlier steps)
    // =========================
    let debugAppleLookup = null;

    if (isRadio) {
      try {
        const albumForTerm = String(radioAlbum || album || '').trim();
        radioLookupTerm = buildAppleLookupTerm({ artist, title, album: albumForTerm });

        // Reuse existing iTunes lookup (it already returns trackUrl/albumUrl)
        const ap = await lookupItunesFirst(String(artist || '').trim(), String(title || '').trim(), debug, { radioAlbum: albumForTerm });

        const tUrl = String(ap?.trackUrl || '').trim();
        const aUrl = String(ap?.albumUrl || '').trim();
        const best = aUrl || tUrl;

        if (!radioTrackUrl && tUrl) radioTrackUrl = tUrl;
        if (!radioAlbumUrl && aUrl) radioAlbumUrl = aUrl;
        if (!radioItunesUrl && best) radioItunesUrl = best;

        radioLookupReason = String(ap?.reason || '').trim() || radioLookupReason || 'no-reason';

        // Fill album/year if missing
        if (!radioAlbum) radioAlbum = String(ap?.album || '').trim() || radioAlbum;
        if (!radioYear)  radioYear  = String(ap?.year  || '').trim() || radioYear;

        if (debug) {
          debugAppleLookup = {
            radioItunesUrl,
            radioTrackUrl,
            radioAlbumUrl,
            reason: radioLookupReason,
            term: radioLookupTerm,
            ...(ap?.termDebug ? { termDebug: ap.termDebug } : {}),
          };
        }
      } catch (e) {
        // Do NOT clobber existing URLs; just record reason
        radioLookupReason = radioLookupReason || `error:${e?.name || 'Error'}`;
        if (debug) debugAppleLookup = { reason: radioLookupReason, term: radioLookupTerm };
      }
    }

    // Prefer radioAlbum for displayed album (your UI already does this)
    if (isRadio && !album && radioAlbum) album = radioAlbum;

    // Favorites
    const favDbg = debug ? {} : null;
    const isFavorite = (!stream && file) ? await isFavoriteInPlaylist(file, favDbg) : false;

    // Encoded label: NEVER append "(VBR)" here
    let encoded = song.encoded || '';
    if (!encoded && meStation?.hiresLabel) {
      encoded = `FLAC • ${formatHiresLabel(meStation.hiresLabel)}`;
    }

    // Build/cache art derivatives based on PRIMARY art (what the UI uses)
    const rawArtUrl = String(primaryArtUrl || '').trim();
    if (rawArtUrl) {
      updateArtCacheIfNeeded(rawArtUrl).catch(e => console.warn('[art] failed', e.message));
    }

    // ✅ rating (piggybacked) for local files only
    let rating = 0;
    let ratingDisabled = true;
    let ratingFile = '';

    let debugRatingErr = '';
    if (ratingsAllowed) {
      ratingFile = file;
      const rr = await getRatingForFileCached(file);
      rating = rr.rating || 0;
      ratingDisabled = !!rr.disabled;
      debugRatingErr = rr.err || '';
    }

    const payload = {
      artist: artist || '',
      title: title || '',
      album: album || '',
      file: file || '',
      playbackUrl: playbackUrl || '',

      songpos,
      songid,

      albumArtUrl: primaryArtUrl || '',
      aplArtUrl,

      altArtUrl: altArtUrl || '',
      stationLogoUrl: stationLogoUrl || '',

      // Radio meta (what your UI already uses)
      radioAlbum,
      radioYear,
      radioLabel,
      radioComposer,
      radioWork,
      radioPerformers,

      // ✅ Apple Music link fields (what your UI needs)
      radioItunesUrl,
      radioTrackUrl,
      radioAlbumUrl,
      radioLookupReason,
      radioLookupTerm,

      state: status.state || song.state,
      elapsed: status.elapsed,
      duration: status.duration,
      percent: status.percent,

      year: deep.year || '',
      label: deep.label || '',
      producer: producer || '',
      personnel: personnel || [],

      encoded,
      bitrate: song.bitrate || '',
      outrate: song.outrate || '',
      volume: song.volume || '0',
      mute: song.mute || '0',
      track: song.track || '',
      date: dateOut || '',

      isStream: stream,
      isAirplay: false,
      isPodcast,
      streamKind,
      isUpnp,

      isFavorite,

      // rating fields always present
      rating,
      ratingDisabled,
      ratingFile,

      ...(debug ? {
        debugArtUpgraded,
        debugResolvedFile,
        debugArtErr,
        debugItunesReason,
        debugPrimaryArtUrl: primaryArtUrl || '',
        ...(debugRatingErr ? { debugRatingErr } : {}),
        ...(debug ? { debugFavorites: favDbg } : {}),
        ...(debug ? {
          debugRatingCache: {
            file: ratingCache.file,
            ageMs: Date.now() - (ratingCache.ts || 0),
            disabled: ratingCache.disabled,
          }
        } : {}),
        ...(debugAppleLookup ? { debugAppleLookup } : {}),
      } : {}),
    };

    lastNowPlayingOk = payload;
    lastNowPlayingTs = Date.now();
    return res.json(payload);

  } catch (err) {
    console.error('now-playing error:', err?.stack || err?.message || String(err));
    return serveCached('exception', err?.message || String(err));
  }
});

app.get('/next-up', async (req, res) => {
  const debug = req.query.debug === '1';

  // moOde coverart.php expects the MPD-style file path URL-encoded after the slash
  const coverArtForFile = (filePath) => {
    const f = String(filePath || '').trim();
    if (!f) return '';
    return `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(f)}`;
  };

  try {
    const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
    const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);

    const file = String(song.file || '').trim();
    const isStream = isStreamPath(file);
    const isAirplay =
      isAirplayFile(file) || String(song.encoded || '').toLowerCase() === 'airplay';

    if (isStream || isAirplay) {
      return res.json({
        ok: true,
        next: null,
        ...(debug ? { reason: 'stream-or-airplay' } : {}),
      });
    }

    const nextsongRaw = moodeValByKey(statusRaw, 'nextsong');
    const nextsongid = moodeValByKey(statusRaw, 'nextsongid');

    if (!String(nextsongRaw || '').trim()) {
      return res.json({
        ok: true,
        next: null,
        ...(debug ? { reason: 'no-nextsong' } : {}),
      });
    }

    const nextPos = Number.parseInt(String(nextsongRaw).trim(), 10);
    if (!Number.isFinite(nextPos) || nextPos < 0) {
      return res.json({
        ok: true,
        next: null,
        ...(debug ? { reason: 'bad-nextsong', nextsongRaw, nextsongid } : {}),
      });
    }

    let next = await mpdPlaylistInfoByPos(nextPos);
    if (!next && nextsongid) next = await mpdPlaylistInfoById(nextsongid);

    if (!next) {
      return res.json({
        ok: true,
        next: null,
        ...(debug ? { reason: 'mpd-no-match', nextPos, nextsongid } : {}),
      });
    }

    const nextFile = String(next.file || '').trim();
    const nextArtUrl = coverArtForFile(nextFile);

    return res.json({
      ok: true,
      next: {
        songid: next.songid || String(nextsongid || ''),
        songpos: next.songpos || String(nextPos),
        title: next.title || '',
        artist: next.artist || '',
        album: next.album || '',
        file: nextFile,

        artUrl: nextArtUrl, // ✅ cover art for NEXT track (LAN moOde)
        currentArtUrl: `${PUBLIC_BASE_URL}/art/current_320.jpg`, // ✅ public, consistent

        // Keep client logic simple/consistent (even though next-up is local-only)
        stationLogoUrl: '',
      },
      ...(debug ? { reason: 'ok' } : {}),
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      next: null,
      ...(debug ? { error: err?.message || String(err), reason: 'exception' } : {}),
    });
  }
});


// ------------------------------
// Current art (square 640) helpers
// ------------------------------

async function resolveBestArtForCurrentSong(song, statusRaw) {
  const file = String(song?.file || '').trim();
  if (!file) return '';

  const stream = isStreamPath(file);
  const airplay =
    isAirplayFile(file) || String(song?.encoded || '').toLowerCase() === 'airplay';

  let best = '';

  // 0) AirPlay => aplmeta cover (authoritative)
  if (airplay) {
    best = await getAirplayCoverUrlFromAplmeta(MOODE_BASE_URL);
  }

  // 1) Local podcast file => RSS map art (episode/show)  ✅
  if (!best && !stream && isLocalPodcastFile(file)) {
    try {
      const tmp = {
        artist: song.artist || '',
        album: song.album || '',
        title: song.title || '',
        file,
        albumArtUrl: '',
      };
      await enrichPodcastNowPlaying(tmp);
      if (tmp?.albumArtUrl) best = String(tmp.albumArtUrl).trim();
    } catch {}
  }

  // 2) Local library file => coverart.php
  if (!best && !stream) {
    best = `/coverart.php/${encodeURIComponent(file)}`;
  }

  // 3) Streams
  if (!best && stream) {
    const streamKind = String(getStreamKind(file) || '').trim().toLowerCase(); // 'radio' | 'upnp' | ''

    // 3a) Podcast-as-stream => RSS map art
    if (streamKind === 'radio') {
      try {
        const tmp = {
          artist: song.artist || '',
          album: song.album || '',
          title: song.title || '',
          file,
          albumArtUrl: '',
        };
        await enrichPodcastNowPlaying(tmp);
        if (tmp?.albumArtUrl) best = String(tmp.albumArtUrl).trim();
      } catch {}
    }

    // 3b) Mother Earth (AzuraCast) => authoritative art
    if (!best && streamKind === 'radio') {
      const meStation = matchMotherEarthStation(file);
      if (meStation) {
        try {
          const meMeta = await fetchMotherEarthMeta(meStation);
          if (meMeta?.art) best = String(meMeta.art).trim();
        } catch (e) {
          console.warn('[mother-earth] meta failed:', e?.message || String(e));
        }
      }
    }

    // 3c) Radio => iTunes fallback
    if (!best && streamKind === 'radio') {
      const decodedTitle = decodeHtmlEntities(song.title || '');
      const parts = decodedTitle.split(' - ').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const it = await lookupItunesFirst(parts[0], parts.slice(1).join(' - '), false);
        if (it?.url) best = String(it.url).trim();
      }
    }

    // 3d) UPnP => resolve to local file coverart if possible
    if (!best && streamKind === 'upnp') {
      const songpos = String(moodeValByKey(statusRaw, 'song') || '').trim();
      const songid  = String(moodeValByKey(statusRaw, 'songid') || '').trim();

      const realFile = await resolveLibraryFileForStream({
        songid,
        songpos,
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        track: song.track || '',
      }, null);

      if (realFile) best = `/coverart.php/${encodeURIComponent(realFile)}`;
    }
  }

  // 4) Final fallback: moOde coverurl (station logo, etc.)
  if (!best && song?.coverurl) best = normalizeCoverUrl(song.coverurl, MOODE_BASE_URL);

  return best;
}

async function getAirplayCoverUrlFromAplmeta(MOODE_BASE_URL) {
  try {
    const p = '/var/local/www/aplmeta.txt';
    const raw = await fs.promises.readFile(p, 'utf8');
    const parts = String(raw || '').trim().split('~~~');

    // [4] is cover_path_or_url per your print script
    const cover = String(parts[4] || '').trim();
    if (!cover) return '';

    // Sometimes includes ?v=... cachebuster; keep it.
    if (/^https?:\/\//i.test(cover)) return cover;

    // Typically "imagesw/airplay-covers/cover-....jpg?v=..."
    const rel = cover.replace(/^\/+/, '');
    return `${MOODE_BASE_URL.replace(/\/+$/, '')}/${rel}`;
  } catch {
    return '';
  }
}

registerArtRoutes(app, {
  MOODE_BASE_URL,
  fetchJson,
  resolveBestArtForCurrentSong,
  normalizeArtKey,
  updateArtCacheIfNeeded,
  artPath640ForKey,
  artPathBgForKey,
  safeIsFile,
  normalizeCoverUrl,
  dispatcherForUrl,
  agentForUrl,
});

registerRatingRoutes(app, {
  clampRating,
  isStreamPath,
  isAirplayFile,
  getRatingForFile,
  setRatingForFile,
  fetchJson,
  MOODE_BASE_URL,
  bumpRatingCache,
});

registerQueueRoutes(app, {
  requireTrackKey,
  mpdPlaylistInfoById,
  mpdDeleteId,
  mpdDeletePos0,
  fetchJson,
  MOODE_BASE_URL,
  moodeValByKey,
  decodeHtmlEntities,
  log,
});

/* =========================
 * /track (Alexa) - unchanged behavior
 * ========================= */

registerTrackRoutes(app, {
  ENABLE_ALEXA,
  TRANSCODE_TRACKS,
  TRACK_CACHE_DIR,
  requireTrackKey,
  isStreamPath,
  isAirplayFile,
  mpdFileToLocalPath,
  safeIsFile,
  log,
});

/* =========================
 * Start
 * ========================= */
 
// =========================
// CLI: build podcast URL map (one-shot)
// =========================
if (process.argv.includes('--build-podcast-map')) {
    (async () => {
        try {
            // Prefer CLI flags, fall back to env
            const rssUrl =
                getArg('--rss') ||
                process.env.PODCAST_RSS_URL ||
                '';

            const outM3u =
                getArg('--out') ||
                process.env.PODCAST_OUT_M3U ||
                '';

            const limit =
                getArgNum('--limit', Number(process.env.PODCAST_LIMIT || 50));

            if (!rssUrl || !outM3u) {
                console.error('Usage: --build-podcast-map --rss <feedUrl> --out <path.m3u> [--limit N]');
                console.error('Or set PODCAST_RSS_URL + PODCAST_OUT_M3U');
                process.exit(2);
            }

            const feed = await fetchPodcastRSS(rssUrl, limit);
            const episodes = feed.items.map(ep => ({
                ...ep,
                podcastTitle: feed.title,
            }));

            await writePodcastM3u({ episodes, outM3u });
            await writePodcastUrlMap({ episodes, outM3u });
            
            process.exit(0);
        } catch (e) {
            console.error('[podcast map build failed]', e);
            process.exit(1);
        }
    })();
}

app.listen(PORT, '0.0.0.0', () => {
  log.debug(`moOde now-playing server running on port ${PORT}`);
  log.debug(`Endpoint: http://${LOCAL_ADDRESS}:${PORT}/now-playing`);
  log.debug(`Endpoint: http://${LOCAL_ADDRESS}:${PORT}/next-up`);
  log.debug(`Public: ${PUBLIC_BASE_URL}`);
  log.debug(`Alexa routes enabled? ${ENABLE_ALEXA ? 'YES' : 'NO'}`);
});