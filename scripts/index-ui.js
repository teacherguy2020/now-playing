// scripts/index-ui.js -- now-playing UI runtime
//
// Includes:
// - Double-buffer blurred background crossfade (background-a/background-b)
// - Boot gating: wait for first bg art, snap it in place, then show UI
// - Next Up (text + 75x75 art)
// - Pause screensaver logic
// - Radio stabilization + classical composer/work formatting
// - Instrument abbrev expansion
// - Lossless/HQ badge logic
//
// Notes:
// - After boot, JS owns background-a/background-b opacity.
// - CSS should NOT force background opacity in body.ready rules.

/* =========================
 * Debug
 * ========================= */

const DEBUG = false;
const dlog = DEBUG ? console.log.bind(console) : () => {};
const TEST_RADIO_FOOTER_TEXT = false;

let fgLoadingKey = '';
let fgLoadingUrl = '';
let radioFooterActive = false;
let fgReqToken = 0;     // monotonically increasing request id
let motionReqToken = 0;
const PODCAST_GENRES = new Set([
  'podcast',
  'podcasts',
  'spoken word',
  'talk',
  'news',
  'interview',
  'audiobook',
  'audiobooks'
]);


// =========================
// Favorites (heart toggle) — robust binding
// =========================

let favBound = false;

function bindFavoriteUIOnce() {
  if (favBound) return;
  favBound = true;

  // Capture phase so we win before album-art click handlers
  document.addEventListener(
    'pointerdown',
    (ev) => {
      const btn = ev.target?.closest?.('#fav-heart');
      if (!btn) return;

      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();

      onToggleFavorite(ev);
    },
    { passive: false, capture: true }
  );
}

function updatePhoneArtBottomVar() {
  const art = document.getElementById('album-art-wrapper');
  if (!art) return;

  const rect = art.getBoundingClientRect();
  // rect.bottom is already viewport-relative (perfect for position:fixed)
  document.documentElement.style.setProperty('--artBottom', `${Math.round(rect.bottom)}px`);
}



/* =========================
 * URL routing (LAN vs Public)
 * =========================
 *
 * Rules:
 * - When UI is served from https://moode.brianwis.com:
 *     • NEVER fetch http://10.0.0.233 (mixed content will be blocked)
 *     • Use public HTTPS endpoints only
 *
 * - When UI is served on LAN (e.g. http://10.0.0.233:8000):
 *     • Use direct LAN endpoints for lowest latency
 */

const HOST = location.hostname.replace(/^www\./, '');
const IS_PUBLIC = (HOST === 'moode.brianwis.com');

// API (JSON + generated art)
const LAN_API_PORT = (location.port === '8101') ? '3101' : '3000';
const LAN_STATIC_PORT = (location.port === '8101') ? '8101' : '8000';

const API_BASE = IS_PUBLIC
  ? 'https://moode.brianwis.com'
  : `${location.protocol}//${location.hostname}:${LAN_API_PORT}`;

// Static assets (HTML / JS / CSS / icons)
const STATIC_BASE = IS_PUBLIC
  ? 'https://moode.brianwis.com'
  : `${location.protocol}//${location.hostname}:${LAN_STATIC_PORT}`;

// API endpoints
const NOW_PLAYING_URL = `${API_BASE}/now-playing`;
const ALEXA_WAS_PLAYING_URL = `${API_BASE}/alexa/was-playing`;
const NEXT_UP_URL     = `${API_BASE}/next-up`;
const RATING_URL      = `${API_BASE}/rating/current`;
const FAVORITE_URL    = `${API_BASE}/favorites/toggle`;

async function loadRatingsFeatureFlag() {
  try {
    const r = await fetch(`${API_BASE}/config/runtime`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.ok) {
      RATINGS_ENABLED = Boolean(j?.config?.features?.ratings ?? true);
      PERSONNEL_ENABLED = Boolean(j?.config?.features?.albumPersonnel ?? true);
      if (!RATINGS_ENABLED) {
        ratingDisabled = true;
        renderStars(0);
      }
      const personnelEl = document.getElementById('personnel-info');
      if (personnelEl && !PERSONNEL_ENABLED) personnelEl.style.display = 'none';
    }
  } catch (_) {}
}

const URL_PARAMS = new URLSearchParams(location.search || '');
const _alexaParam = String(URL_PARAMS.get('alexa') || '').trim();
const _modeParam = String(URL_PARAMS.get('mode') || '').trim();
const ALEXA_MODE_FORCED = /^(1|true|yes|on)$/i.test(_alexaParam) || /^alexa$/i.test(_modeParam);
const ALEXA_MODE_DISABLED = /^(0|false|no|off)$/i.test(_alexaParam) || /^normal$/i.test(_modeParam);
const ALEXA_MODE_AUTO = !ALEXA_MODE_DISABLED;

// Static icons (inline SVG data URLs to avoid broken-file paths)
function svgDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(String(svg || '').trim())}`;
}

const AIRPLAY_ICON_URL = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="10" y="16" width="108" height="76" rx="10" fill="#0b1220" stroke="#9fb1d9" stroke-width="6"/>
  <path d="M64 80 42 114h44z" fill="#9fb1d9"/>
  <path d="M64 86 49 114h30z" fill="#60a5fa"/>
</svg>`);

const UPNP_ICON_URL = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="52" fill="#0b1220" stroke="#9fb1d9" stroke-width="6"/>
  <circle cx="64" cy="64" r="7" fill="#dbe7ff"/>
  <circle cx="64" cy="34" r="7" fill="#60a5fa"/>
  <circle cx="37" cy="80" r="7" fill="#60a5fa"/>
  <circle cx="91" cy="80" r="7" fill="#60a5fa"/>
  <path d="M64 64 64 34M64 64 37 80M64 64 91 80" stroke="#9fb1d9" stroke-width="5" stroke-linecap="round"/>
</svg>`);

// moOde player (LAN-only; used for pause-cover fallback image)
const MOODE_BASE_URL = 'http://10.0.0.254';

dlog('[NP] host=', location.host, 'IS_PUBLIC=', IS_PUBLIC);
dlog('[NP] API_BASE=', API_BASE, 'STATIC_BASE=', STATIC_BASE);
dlog('[NP] NOW_PLAYING_URL=', NOW_PLAYING_URL);
dlog('[NP] NEXT_UP_URL=', NEXT_UP_URL);

/* =========================
 * Feature toggles
 * ========================= */

const ENABLE_NEXT_UP = true;
const ENABLE_BACKGROUND_ART = true; // set false to disable background updates entirely
let PERSONNEL_ENABLED = true;
const MOTION_ART_STORAGE_KEY = 'nowplaying.ui.motionArtEnabled';
const motionArtCache = new Map();
const localMotionCache = new Map();
let runtimeTrackKeyAuth = '';
let runtimeTrackKeyAttempted = false;

async function ensureRuntimeTrackKey() {
  if (runtimeTrackKeyAttempted || runtimeTrackKeyAuth) return runtimeTrackKeyAuth;
  runtimeTrackKeyAttempted = true;
  try {
    const r = await fetch(`${API_BASE}/config/runtime`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    const k = String(j?.config?.trackKey || '').trim();
    if (k) runtimeTrackKeyAuth = k;
  } catch {}
  return runtimeTrackKeyAuth;
}

function motionArtEnabled() {
  try {
    const v = String(localStorage.getItem(MOTION_ART_STORAGE_KEY) || '').trim().toLowerCase();
    if (!v) return true;
    return !(['0', 'false', 'off', 'no'].includes(v));
  } catch {
    return true;
  }
}

function normalizeAppleMusicUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return s.split('?')[0].split('#')[0];
  }
}

async function resolveLocalMotionMp4(artist, album) {
  const a = String(artist || '').trim();
  const b = String(album || '').trim();
  const k = `${a.toLowerCase()}|${b.toLowerCase()}`;
  if (!a || !b) return '';
  if (localMotionCache.has(k)) return String(localMotionCache.get(k) || '');
  try {
    const url = `${API_BASE}/config/library-health/animated-art/lookup?artist=${encodeURIComponent(a)}&album=${encodeURIComponent(b)}`;
    const key = await ensureRuntimeTrackKey();
    const headers = key ? { 'x-track-key': key } : {};
    const r = await fetch(url, { headers });
    const j = await r.json().catch(() => ({}));
    const mp4 = String(j?.hit?.mp4 || '').trim();
    localMotionCache.set(k, mp4);
    return mp4;
  } catch {
    localMotionCache.set(k, '');
    return '';
  }
}

async function resolveMotionMp4(appleUrl) {
  const normalized = normalizeAppleMusicUrl(appleUrl);
  if (!normalized) return '';
  const cached = motionArtCache.get(normalized);
  if (cached?.state === 'ready') return String(cached.mp4 || '');
  if (cached?.state === 'none') return '';
  if (cached?.state === 'pending' && cached.promise) return cached.promise;

  const p = (async () => {
    try {
      const endpoint = `https://api.aritra.ovh/v1/covers?url=${encodeURIComponent(normalized)}`;
      const r = await fetch(endpoint, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json().catch(() => ({}));
      const square = Array.isArray(j?.master_Streams?.square) ? j.master_Streams.square : [];
      const list = square.filter((x) => String(x?.uri || '').includes('.m3u8'));
      if (!list.length) {
        motionArtCache.set(normalized, { state: 'none' });
        return '';
      }
      const preferred = list
        .map((x) => ({ uri: String(x?.uri || ''), width: Number(x?.width || 0), bw: Number(x?.bandwidth || 0) }))
        .filter((x) => x.uri)
        .sort((a, b) => (a.width - b.width) || (a.bw - b.bw));
      const choice = preferred.filter((x) => x.width >= 700 && x.width <= 1200).slice(-1)[0] || preferred.slice(-1)[0];
      const mp4 = String(choice?.uri || '').replace(/\.m3u8(?:\?.*)?$/i, '-.mp4');
      if (!mp4 || mp4 === choice.uri) {
        motionArtCache.set(normalized, { state: 'none' });
        return '';
      }
      motionArtCache.set(normalized, { state: 'ready', mp4 });
      return mp4;
    } catch {
      motionArtCache.set(normalized, { state: 'none' });
      return '';
    }
  })();
  motionArtCache.set(normalized, { state: 'pending', promise: p });
  return p;
}

function setMotionArtVideo(mp4Url, posterUrl = '') {
  const videoEl = document.getElementById('album-art-video');
  const artEl = document.getElementById('album-art');
  if (!videoEl || !artEl) return;

  const src = String(mp4Url || '').trim();
  if (!src) {
    // No-op on missing motion: keep whatever is currently visible (static or motion).
    return;
  }

  if (posterUrl) videoEl.setAttribute('poster', posterUrl);
  const oldSrc = String(videoEl.getAttribute('src') || '').trim();
  if (oldSrc !== src) {
    videoEl.setAttribute('src', src);
    videoEl.load?.();
  }

  // Motion is law: once we have a motion source, keep static hidden to avoid flashing.
  artEl.style.display = 'none';
  videoEl.style.display = 'block';

  try {
    const p = (typeof videoEl.play === 'function') ? videoEl.play() : null;
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

/* =========================
 * Timers / refresh intervals
 * ========================= */

const NOW_PLAYING_POLL_MS  = 2000;
const NEXT_UP_REFRESH_MS   = 8000;  // refresh Next Up every 5s
const RATING_REFRESH_MS    = 2000;

/* =========================
 * State: Next Up / art / bg
 * ========================= */

let lastNextUpKey = '';
let lastNextUpFetchTs = 0;

let lastAlbumArtKey = '';
let lastAlbumArtUrl = '';
let motionLockTrackKey = '';
let motionLockMp4 = '';

let bgKeyFront = '';
let bgLoadingKey = '';
let currentFile = '';
let lastAlexaForcedArtFile = '';

// Background crossfade state
let bgFront = 'a';     // 'a' or 'b'
let bgUrlFront = '';   // currently shown URL
let bgLoadingUrl = ''; // URL currently being loaded (race guard)

/* =========================
 * State: track / progress / favorites
 * ========================= */

let currentTrackKey = '';
let lastPercent = -1;
let currentIsFavorite = false;

let _alexaWasCache = null;
let _alexaWasCacheTs = 0;
let _alexaModeDecisionMade = false;
let _alexaSourceLocked = false;

async function fetchAlexaPayload() {
  try {
    const r = await fetch(`${ALEXA_WAS_PLAYING_URL}?maxAgeMs=21600000&_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const wj = await r.json();
    const fresh = !!wj?.fresh;
    const np = wj?.nowPlaying || null;
    const wp = wj?.wasPlaying || null;
    const active = !!((np && np.active) || (wp && wp.active));
    const payload = (np && np.file) ? np : ((wp && wp.file) ? wp : null);
    if (!fresh || !active || !payload) return null;
    return payload;
  } catch {
    return null;
  }
}
let pendingFavorite = null; // { file, isFavorite, ts }
const PENDING_FAVORITE_HOLD_MS = 3500;

// Progress animator (smooth between polls)
let progressAnimRaf = 0;
let progressAnim = {
  t0: 0,
  baseElapsed: 0,
  duration: 0,
  running: false,
};



/* =========================
 * Phone controls helper
 * ========================= */
function isPhoneUI() {
  return (
    window.matchMedia &&
    window.matchMedia('(max-width: 520px) and (orientation: portrait)').matches
  );
}

const PATH_PLAY  = "M8 5v14l11-7z";
const PATH_PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";

function setPlayIcon(isPlaying) {
  const p = document.getElementById("playIcon");
  if (!p) return;
  p.setAttribute("d", isPlaying ? PATH_PAUSE : PATH_PLAY);
}

function isPlayingState(data) {
  const s = String(data?.state || "").toLowerCase();
  return (s === "play" || s === "playing");
}

/* =========================
 * Stream mode helpers
 * ========================= */

function splitGenres(raw) {
  // Handles: "Podcast", "Podcast; News", "Podcast / News", "Podcast,News"
  return String(raw || '')
    .split(/[;,/|]/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function inferIsPodcastFromFilePath(data) {
  const f = String(data?.file || '').trim();
  return f.startsWith('USB/SamsungMoode/Podcasts/') || f.includes('/Podcasts/');
}

function inferIsPodcast(data) {
  if (data?.isPodcast === true) return true;
  if (inferIsPodcastFromFilePath(data)) return true;

  // last resort: genre heuristics (keep if you want)
  const raw = data?.genre ?? data?.Genre ?? data?.tags?.genre ?? data?.metadata?.genre ?? '';
  const genres = splitGenres(String(raw));
  return genres.some(g => g.toLowerCase() === 'podcast');
}

function getStreamKind(data) {
  return String(data?.streamKind || '').trim().toLowerCase();
}

function isUpnpMode(data) {
  return (data?.isStream === true) &&
         (data?.isUpnp === true || getStreamKind(data) === 'upnp');
}

function ratingsAllowedNow() {
  // ratings for local music and Alexa mode; still disabled for pause/airplay/podcast.
  return !pauseMode && !currentIsAirplay && !currentIsPodcast && (!currentIsStream || currentAlexaMode);
}

/* =========================
 * Ratings (MPD stickers via server)
 * ========================= */

let RATINGS_ENABLED = true;
const RATINGS_BASE_URL = API_BASE;

let currentRating = 0;
let ratingDisabled = true;
let lastRatingFile = '';
let lastRatingFetchTs = 0;
let currentIsPodcast = false;
// After a POST succeeds, hold UI truth briefly so /now-playing can catch up.
let pendingRating = null;
// shape: { file: string, rating: number, ts: number }
const PENDING_RATING_HOLD_MS = 3500;

// Rating request guard + current mode flags
let ratingReqToken = 0;
let currentIsStream = false;
let currentIsAirplay = false;
let currentAlexaMode = false;

/* =========================
 * modal personnel
 * ========================= */

let lastNowPlayingData = null;

/* =========================
 * Pause "screensaver"
 * ========================= */

const ENABLE_PAUSE_SCREENSAVER = true;
const PAUSE_ART_URL = `${MOODE_BASE_URL}/images/default-album-cover.png`;
const PAUSE_MOVE_INTERVAL_MS = 8000;
const PAUSE_ART_MIN_MARGIN_PX = 20;
const PAUSE_SCREENSAVER_DELAY_MS = 5000;

let pauseOrStopSinceTs = 0;
let pauseMode = false;
let lastPauseMoveTs = 0;
let justResumedFromPause = false;

/* =========================
 * Polling control
 * ========================= */

let nowPlayingTimer = 0;

function startNowPlayingPoll() {
  if (nowPlayingTimer) return;
  nowPlayingTimer = setInterval(fetchNowPlaying, NOW_PLAYING_POLL_MS);
}

/* =========================
 * Radio memory (keyed by station/stream)
 * ========================= */

const radioState = {
  key: '',
  recentTitles: [],
  stationName: '',  
};

/* =========================
 * Boot
 * ========================= */

function applyBackgroundToggleClass() {
  if (!ENABLE_BACKGROUND_ART) document.body.classList.add('no-bg');
  else document.body.classList.remove('no-bg');
}

// ------------------------------------------------------------
// Phone UI detection
// - Mobile browsers (UA / UAData) always allowed to trigger on portrait/narrow/short
// - Desktops only trigger on explicit kiosk cases (ultraWide/veryShort), NOT portrait
// ------------------------------------------------------------
function isMobileEnv() {
  // Best signal (Chromium)
  const uadMobile = navigator.userAgentData?.mobile;
  if (typeof uadMobile === 'boolean') return uadMobile;

  // Fallback UA sniff (iOS/Android)
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
}

function computePhoneUI() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width  ?? window.innerWidth  ?? 0);
  const h = Math.round(vv?.height ?? window.innerHeight ?? 0);
  const aspect = (h > 0) ? (w / h) : 0;

  // Input signals (helpful but not decisive alone)
  const coarse   = !!window.matchMedia?.('(pointer: coarse)').matches;
  const noHover  = !!window.matchMedia?.('(hover: none)').matches;
  const touchPts = navigator.maxTouchPoints || 0;
  const touchish = coarse || noHover || (touchPts >= 2);

  const mobileEnv = isMobileEnv();

  // Geometry buckets
  const short     = (h > 0 && h <= 560);           // phones / small tablets / short viewports
  const portrait  = (aspect > 0 && aspect <= 0.85);
  const narrow    = (w > 0 && w <= 900);

  // Explicit kiosk / car display (your 1280x400 = 3.2)
  const ultraWideKiosk = (aspect >= 3.0 && h > 0 && h <= 650);

  // Legacy: only accept it if we ALSO think it's mobile/kiosk-ish
  const legacyRaw = (typeof isPhoneUI === 'function') ? !!isPhoneUI() : false;
  const legacy = legacyRaw && (mobileEnv || touchish || ultraWideKiosk || short);

  // Decision:
  // - If it's a mobile browser, let portrait/narrow/short drive phone-ui.
  // - If it's NOT a mobile browser, only allow explicit kiosk cases (ultraWideKiosk/veryShort).
  if (mobileEnv) {
    return legacy || short || portrait || narrow || (touchish && (short || narrow || portrait));
  }

  // Desktop/laptop: protect against “everything becomes portrait”
  return legacy || ultraWideKiosk || (h > 0 && h <= 420); // keep 1280x400 + extreme short panes
}

function applyPhoneUIClass() {
  const on = computePhoneUI();
  const prev = document.body.classList.contains('phone-ui');

  document.body.classList.toggle('phone-ui', on);

  if (on !== prev) {
    logPhoneControlSizes('phone-ui toggled');
  }
}
// ------------------------------------------------------------
// Coalesce resize/orientation/visualViewport events
// ------------------------------------------------------------
let _phoneUiRaf = 0;
function schedulePhoneUIUpdate() {
  if (_phoneUiRaf) return;
  _phoneUiRaf = requestAnimationFrame(() => {
    _phoneUiRaf = 0;
    try { applyPhoneUIClass(); } catch {}
    try { updatePhoneArtBottomVar(); } catch {}
  });
}

function logPhoneControlSizes(reason = '') {
  const root = document.documentElement;
  const cs = getComputedStyle(root);

  const data = {
    reason,
    phoneUI: document.body.classList.contains('phone-ui'),
    viewport: `${window.innerWidth} x ${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio || 1,

    ctl: cs.getPropertyValue('--ctl').trim(),
    ctlBig: cs.getPropertyValue('--ctl-big').trim(),
    ctlIcon: cs.getPropertyValue('--ctl-icon').trim(),
    ctlIconBig: cs.getPropertyValue('--ctl-icon-big').trim(),
  };

  DEBUG && console.groupCollapsed('[Phone UI] Control sizing');
  console.table(data);
  DEBUG && console.groupEnd();
}

window.addEventListener('load', () => {
    // Never allow a black screen
    try { markReadyOnce(); } catch {}

    try { applyBackgroundToggleClass(); } catch (e) { console.warn('bg toggle init failed', e); }

    try { if (typeof attachClickEventToAlbumArt === 'function') attachClickEventToAlbumArt(); } catch (e) { console.warn('album modal init failed', e); }
    try { if (typeof bindFavoriteUIOnce === 'function') bindFavoriteUIOnce(); } catch (e) { console.warn('favorites init failed', e); }
    try { if (typeof attachRatingsClickHandler === 'function') attachRatingsClickHandler(); } catch (e) { console.warn('ratings init failed', e); }

    // One authoritative place to keep UI + artBottom updated
    schedulePhoneUIUpdate();

    bootThenStart().catch((e) => {
        console.warn('bootThenStart failed', e);
        try { startNowPlayingPoll(); } catch {}
    });
}, { once: true });
/* =========================
 * Image preload helper (boot-safe)
 * ========================= */

function preloadImage(url, timeoutMs = 2500) {
  return new Promise(resolve => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(!!ok);
    };

    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;

    setTimeout(() => finish(false), timeoutMs);
  });
}

/* =========================
 * Boot gating
 * ========================= */

async function bootThenStart() {
  let data = null;

  try {
    const r = await fetch(NOW_PLAYING_URL, { cache: 'no-store' });
    data = r.ok ? await r.json() : null;
  } catch {}

  const baseNowPlaying = data ? { ...data } : null;

  try { await loadRatingsFeatureFlag(); } catch {}

  // Boot behavior mirrors normal mode: single fetch path, optional Alexa override.
  if (data && (ALEXA_MODE_AUTO || ALEXA_MODE_FORCED)) {
    const ap = await fetchAlexaPayload();
    if (ap) data = { ...data, ...ap, alexaMode: true };
  }

  if (data && baseNowPlaying) data.__queueHead = baseNowPlaying;

  // Always show the UI shell
  markReadyOnce();

  if (!data) {
    try { fetchNowPlaying(); } catch {}
    startNowPlayingPoll();
    return;
  }

  const firstArtUrl =
    (data.albumArtUrl && String(data.albumArtUrl).trim())
      ? String(data.albumArtUrl).trim()
      : (String(data.altArtUrl || '').trim() || '');

  const firstKey = normalizeArtKey(firstArtUrl);
  const firstBgUrl =
    (ENABLE_BACKGROUND_ART && firstKey)
      ? (data.alexaMode
          ? firstArtUrl
          : `${API_BASE}/art/current_bg_640_blur.jpg?v=${encodeURIComponent(firstKey)}`)
      : '';

  if (ENABLE_BACKGROUND_ART && firstKey) {
    // don’t let a stuck image block boot
    await preloadImage(firstBgUrl, 2500);

    const a = document.getElementById('background-a');
    const b = document.getElementById('background-b');
    if (a && b) {
      const aPrevTrans = a.style.transition;
      const bPrevTrans = b.style.transition;

      a.style.transition = 'none';
      b.style.transition = 'none';

      a.style.backgroundImage = `url("${firstBgUrl}")`;
      b.style.backgroundImage = 'none';
      a.style.opacity = '1';
      b.style.opacity = '0';

      bgFront = 'a';
      bgUrlFront = firstBgUrl;
      bgKeyFront = firstKey;
      bgLoadingUrl = '';
      bgLoadingKey = '';

      requestAnimationFrame(() => {
        a.style.transition = aPrevTrans || '';
        b.style.transition = bPrevTrans || '';
      });
    }

    const artBgEl = document.getElementById('album-art-bg');
    if (artBgEl) {
      const firstFgUrl = data.alexaMode
        ? firstArtUrl
        : `${API_BASE}/art/current.jpg?v=${encodeURIComponent(firstKey)}`;
      artBgEl.style.backgroundImage = `url("${firstFgUrl}")`;
      artBgEl.style.backgroundSize = 'cover';
      artBgEl.style.backgroundPosition = 'center';
    }
  }

  try { updateUI(data); } catch (e) { console.warn('updateUI failed during boot', e); }
  startNowPlayingPoll();
}


function markReadyOnce() {
  const body = document.body;
  if (!body || body.classList.contains('ready')) return;
  body.classList.remove('booting');
  body.classList.add('ready');
}

// (debug overlay removed)

/* =========================
 * Background crossfade
 * ========================= */

function setBackgroundCrossfade(url, keyOverride = '') {
  const a = document.getElementById('background-a');
  const b = document.getElementById('background-b');
  if (!a || !b) return;

  const nextUrl = String(url || '').trim();
  const nextKey = String(keyOverride || '').trim() || normalizeArtKey(nextUrl);

  if (!nextKey) {
    a.style.backgroundImage = 'none';
    b.style.backgroundImage = 'none';
    a.style.opacity = '1';
    b.style.opacity = '0';
    bgFront = 'a';
    bgUrlFront = '';
    bgKeyFront = '';
    bgLoadingUrl = '';
    bgLoadingKey = '';
    return;
  }

  if (nextKey === bgKeyFront) return;
  if (nextKey === bgLoadingKey) return;

  bgLoadingUrl = nextUrl;
  bgLoadingKey = nextKey;

  const img = new Image();
  img.onload = () => {
    if (bgLoadingKey !== nextKey) return;

    const frontEl = (bgFront === 'a') ? a : b;
    const backEl  = (bgFront === 'a') ? b : a;

    backEl.style.backgroundImage = `url("${nextUrl}")`;
    frontEl.style.opacity = '1';
    backEl.style.opacity = '0';

    requestAnimationFrame(() => {
      backEl.style.opacity = '1';
      frontEl.style.opacity = '0';

      bgFront = (bgFront === 'a') ? 'b' : 'a';
      bgUrlFront = nextUrl;
      bgKeyFront = nextKey;
      bgLoadingUrl = '';
      bgLoadingKey = '';
    });
  };

  img.onerror = () => {
    if (bgLoadingKey === nextKey) {
      bgLoadingUrl = '';
      bgLoadingKey = '';
    }
  };

  img.src = nextUrl;
}

function renderStars(rating) {
  const el = document.getElementById('ratingStars');
  if (!el) return;

  if (!RATINGS_ENABLED || ratingDisabled) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }

  el.style.display = 'inline-block';
  el.innerHTML = '';

  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    s.dataset.value = String(i);

    // ✅ add filled vs dim class
    s.className = (i <= r) ? 'filled' : 'dim';

    el.appendChild(s);
  }
}

function clearStars() {
  currentRating = 0;
  ratingDisabled = true;
  lastRatingFile = '';
  renderStars(0);
}

let lastRatingKey = '';



// Requires these near your ratings state:
// let pendingRating = null; // { file, rating, ts }
// const PENDING_RATING_HOLD_MS = 3500;

async function setCurrentRating(n) {
  if (!RATINGS_ENABLED) return;
  if (!ratingsAllowedNow() || ratingDisabled) return;

  const r = Math.max(0, Math.min(5, Number(n) || 0));

  // Save current UI state to revert if server refuses/fails
  const prevRating   = currentRating;
  const prevDisabled = ratingDisabled;
  const prevFile     = lastRatingFile;

  // ✅ optimistic UI
  currentRating  = r;
  ratingDisabled = false;
  renderStars(currentRating);

  try {
    const resp = await fetch(`${RATINGS_BASE_URL}/rating/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: r }),
    });

    // If non-JSON / non-200, treat as failure and revert
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const j = await resp.json();

    // DEBUG (temporarily): prove what server answered
    dlog('[rating POST] ->', { sent: r, got: j });

    // If server refuses/disabled, revert (prevents “disappear then reappear”)
    const file = String(j?.file || '').trim();
    const disabled = !!j?.disabled || !file;

    if (disabled) {
      pendingRating = null;
      currentRating  = prevRating;
      ratingDisabled = prevDisabled;
      lastRatingFile = prevFile;
      renderStars(currentRating);
      return;
    }

    // ✅ accept server truth
    ratingDisabled = false;
    lastRatingFile = file;
    currentRating  = Math.max(0, Math.min(5, Number(j?.rating) || 0));
    renderStars(currentRating);

    // ✅ optimistic hold: prevent next /now-playing poll from snapping back
    pendingRating = {
      file: lastRatingFile,
      rating: currentRating,
      ts: Date.now(),
    };

  } catch (e) {
    console.warn('[rating POST] failed:', e);
    pendingRating = null;

    // revert on hard failure
    currentRating  = prevRating;
    ratingDisabled = prevDisabled;
    lastRatingFile = prevFile;
    renderStars(currentRating);
  }
}


let ratingsClickBound = false;

function attachRatingsClickHandler() {
  if (ratingsClickBound) return;
  ratingsClickBound = true;

  const wrap = document.getElementById('ratingStars');
  if (!wrap) return;

  wrap.addEventListener('pointerdown', (ev) => {
    if (!RATINGS_ENABLED) return;
    if (!ratingsAllowedNow() || ratingDisabled) return;

    const t = ev.target?.closest?.('[data-value]');
    if (!t) return;

    ev.preventDefault();
    ev.stopPropagation();

    const n = parseInt(t.dataset.value, 10);
    if (!Number.isFinite(n)) return;

    setCurrentRating(n === currentRating ? 0 : n);
  }, { passive: false });
}




/* =========================
 * Poller
 * ========================= */

function fetchNowPlaying() {
  const sourcePromise = ALEXA_MODE_FORCED
    ? (async () => {
        const ap = await fetchAlexaPayload();
        return ap ? { ...ap, alexaMode: true } : null;
      })()
    : fetch(NOW_PLAYING_URL, { cache: 'no-store' })
        .then(async r => {
          if (!r.ok) throw new Error(`now-playing HTTP ${r.status}`);
          let data = await r.json();
          if (!data) return data;

          const baseNowPlaying = { ...data };

          // Alexa auto mode can optionally override with was-playing when fresh+active.
          if (ALEXA_MODE_AUTO) {
            const ap = await fetchAlexaPayload();
            if (ap) data = { ...data, ...ap, alexaMode: true };
          }

          // keep original /now-playing snapshot for queue-head use (e.g., Next up row in Alexa mode)
          data.__queueHead = baseNowPlaying;
          return data;
        });

  sourcePromise
    .then(data => {
        if (!data) return;
        dlog('[album link fields]', {
            radioItunesUrl: data.radioItunesUrl,
            itunesUrl: data.itunesUrl,
            radioAppleMusicUrl: data.radioAppleMusicUrl,
            appleMusicUrl: data.appleMusicUrl,
            trackViewUrl: data.trackViewUrl,
            collectionViewUrl: data.collectionViewUrl,
            url: data.url,
            link: data.link,
        });
    

      // Keep a copy for controls / modal
      lastNowPlayingData = data;
      window.lastNowPlayingData = data;
      // debug overlay disabled

      // Alexa forced mode: keep refresh path brutally simple and direct.
      if (ALEXA_MODE_FORCED) {
        try {
          currentAlexaMode = true;
          currentIsAirplay = false;
          currentIsStream = false;
          currentIsPodcast = inferIsPodcast(data);
          // Alexa mode has no reliable progress timing; keep bar hidden.
          setProgressVisibility(true);
          applyRatingFromNowPlaying(data);
          updateUI(data);
          // Next-up in Alexa mode must come from /now-playing queue head.
          updateNextUp({ isAirplay: false, isStream: false, data });
        } catch (e) {
          console.warn('[alexa forced repaint] failed:', e?.message || e);
        }
        return;
      }

      if (DEBUG) {
        DEBUG && console.groupCollapsed('%c[PODCAST DETECT]', 'color:#ff9800;font-weight:bold');
        dlog('file:', data.file);
        dlog('genre raw:', data.genre);
        dlog('genre parsed:', splitGenres(
          data?.genre ??
          data?.Genre ??
          data?.tags?.genre ??
          data?.metadata?.genre ??
          ''
        ));
        dlog('server isPodcast flag:', data.isPodcast === true);
        dlog('👉 inferred isPodcast:', currentIsPodcast);
        DEBUG && console.groupEnd();
      }

      // Prime mode flags before star logic so Alexa mode isn't blocked by stale stream flags.
      {
        const preAlexa = data?.alexaMode === true;
        currentAlexaMode = preAlexa;
        currentIsAirplay = preAlexa ? false : (data?.isAirplay === true);
        currentIsStream = preAlexa ? false : (data?.isStream === true);
        currentIsPodcast = inferIsPodcast(data);
      }

      const isAirplay = currentIsAirplay;
      const isStream = currentIsStream;

      // ⭐ Single source of truth for stars:
      applyRatingFromNowPlaying(data);
      
      // ❤️ favorites (single source of truth from server)
      const npFile = String(data.file || '').trim();
      const npFav  = !!data.isFavorite;

      if (pendingFavorite && npFile && npFile === pendingFavorite.file) {
        const age = Date.now() - pendingFavorite.ts;

        if (age < PENDING_FAVORITE_HOLD_MS) {
          // Hold UI truth briefly so now-playing can't snap it back
          setFavoriteUI(pendingFavorite.isFavorite, pendingFavorite.file);
        } else {
          pendingFavorite = null;
          setFavoriteUI(npFav, npFile);
        }
      } else {
        // Different track, or no hold
        pendingFavorite = null;
        setFavoriteUI(npFav, npFile);
      }
      
      const streamKind = String(data.streamKind || '').trim().toLowerCase();
      const isUpnp  = isStream && (data.isUpnp === true || streamKind === 'upnp');
      const isRadio = isStream && !isUpnp;
      
      if (isRadio) {
        const stationKey = `${data.file}|${data.album || ''}`;
        if (radioState.key !== stationKey) {
          radioState.key = stationKey;
          radioState.recentTitles = [];
          radioState.stationName = ''; // reset per-station
        }

        const sn = pickStationName(data);
        if (looksLikeStationName(sn)) radioState.stationName = sn;
      }
      // Station logo (radio only)
      const radioLogoUrl = isRadio ? String(data.stationLogoUrl || '').trim() : '';

      // Let CSS react
      document.body.classList.toggle('is-radio', isRadio);

      // Phone portrait detection (define FIRST)
      const isPhonePortrait =
        !!(window.matchMedia && window.matchMedia('(max-width: 520px) and (orientation: portrait)').matches);

      // Phone-portrait footer row (Radio OR AirPlay)
      const wantsFooterRow = isPhonePortrait && (isRadio || isAirplay);

      dlog('[NP flags]', {
        isStream,
        isAirplay,
        isRadio,
        isPhonePortrait,
        streamKind: data.streamKind,
        stationName: data.stationName,
        station: data.station,
        name: data.name,
        streamName: data.streamName,
        file: data.file
      });

      if (wantsFooterRow) {
        if (isAirplay) {
          setAirplayFooter(data);
        } else {
          const stationName = pickStationName(data);
          const footerText = TEST_RADIO_FOOTER_TEXT
            ? `TEST FOOTER — ${stationName || 'Radio'}`
            : (stationName || 'Radio');

          setRadioFooter(footerText, radioLogoUrl);
        }
      } else {
        clearRadioFooterIfActive();
      }

      // Overlay logo (AirPlay / UPnP / Radio station logo)
      setModeLogo({ isAirplay, isUpnp, isRadio, radioLogoUrl });

      // If footer is active, hide the big overlay logo
      if (radioFooterActive) {
        hideModeLogo();
      }

      // Next Up visibility rules
      // - If footer is active, do NOT clear the row
      // - Otherwise hide for pause / airplay / stream
      if (
        ENABLE_NEXT_UP &&
        !wantsFooterRow &&
        !currentAlexaMode &&
        (pauseMode || isAirplay || isStream)
      ) {
        clearNextUpUI();
      }

      // Track key for change detection
      let baseKey = '';
      if (isAirplay) {
        const artKeyPart = String(data.albumArtUrl || '').trim() || String(data.altArtUrl || '').trim();
        baseKey = `airplay|${data.artist || ''}|${data.title || ''}|${data.album || ''}|${artKeyPart}`;
      } else if (isStream) {
      
        baseKey = `${data.file || ''}|${data.album || ''}`;
      } else {
        baseKey = data.file || `${data.artist || ''}|${data.album || ''}|${data.title || ''}`;
      }

      const trackChanged = justResumedFromPause || baseKey !== currentTrackKey;

      /* =========================
       * Pause / screensaver logic
       * ========================= */

      const pauseOrStop = isPauseOrStopState(data);
      const screensaverEligible = !isAirplay && !isMobileEnv();

      if (pauseOrStop && screensaverEligible) {
        if (!pauseOrStopSinceTs) pauseOrStopSinceTs = Date.now();

        const elapsed = Date.now() - pauseOrStopSinceTs;
        const delayMs = Number(PAUSE_SCREENSAVER_DELAY_MS) || 0;

        if (ENABLE_PAUSE_SCREENSAVER && elapsed >= delayMs) {
          if (!pauseMode) setPausedScreensaver(true);

          setProgressVisibility(true);
          hideModeLogo();
          movePauseArtRandomly(false);
          stopProgressAnimator();
          return;
        }
      } else {
        pauseOrStopSinceTs = 0;

        if (pauseMode) {
          setPausedScreensaver(false);

          // Force repaint right now with the current payload
          updateUI(data);

          justResumedFromPause = true;
          stopProgressAnimator();
        }
      }

      /* =========================
       * Progress bar control
       * ========================= */

      // Show progress if this item is a podcast, OR if we have a real duration.
      // Hide progress for radio/stream that has no duration.
      const isPodcast = currentIsPodcast;  // support either field name
      const dur = Number(data.duration || 0);
      const showProgress = isPodcast || dur > 0;

      setProgressVisibility(!showProgress);
      if (isStream || isAirplay) stopProgressAnimator();

      /* =========================
       * Local-file progress animator
       * ========================= */

      if (!isStream && !isAirplay) {
        let el  = Number(data.elapsed);
        let dur = Number(data.duration);

        // Normalize ms → seconds if needed
        if (Number.isFinite(dur) && dur > 0 && dur > 24 * 60 * 60) dur = dur / 1000;
        if (Number.isFinite(el)  && el  > 0 && el  > 24 * 60 * 60) el  = el  / 1000;

        if (Number.isFinite(el) && Number.isFinite(dur) && dur > 0) {
          if (trackChanged || !progressAnim.running) {
            startProgressAnimator(el, dur);
          } else {
            const now = performance.now();
            const expected = progressAnim.baseElapsed + (now - progressAnim.t0) / 1000;

            // Prevent backward jumps
            if (el > expected - 0.25) {
              progressAnim.baseElapsed = el;
              progressAnim.t0 = now;
            }
          }
        } else {
          stopProgressAnimator();
          updateProgressBarPercent(0);
        }
      }

      /* =========================
       * Track-change driven UI
       * ========================= */

      // Local files + AirPlay
      if (!isStream) {
        // In Alexa mode, repaint every poll from was-playing source to avoid stale UI state.
        if (currentAlexaMode) {
          currentTrackKey = baseKey;
          try { updateUI(data); } catch (e) { console.warn('[alexa updateUI] failed:', e); }
        } else if (trackChanged) {
          currentTrackKey = baseKey;
          updateUI(data);
        }

        if (ENABLE_NEXT_UP && !pauseMode && !isAirplay) {
          if (currentAlexaMode) {
            updateNextUp({ isAirplay, isStream, data });
          } else {
            const now = Date.now();
            const due = (now - (lastNextUpFetchTs || 0)) >= NEXT_UP_REFRESH_MS;
            if (trackChanged || due) {
              lastNextUpFetchTs = now;
              updateNextUp({ isAirplay, isStream, data });
            }
          }
        }

        justResumedFromPause = false;
        return;
      }

      // Streams (radio/upnp)
      const stabilized = stabilizeRadioDisplay(data);
      const radioKey = `${baseKey}|${stabilized.artist}|${stabilized.title}`;

      // Compute station name ONCE here so updateUI() doesn't guess from polluted fields
      const stationName =
        String(data.stationName || '').trim() ||
        String(data.station || '').trim() ||
        String(data.radioStation || '').trim() ||
        String(data.radioStationName || '').trim() ||
        String(data.streamName || '').trim() ||
        String(data.name || '').trim() ||
        String(data.stream || '').trim() ||
        String(data.file || '').trim() ||
        'Radio';

      // RADIO: always repaint — stabilization already prevents flicker
      try {
        updateUI({
          ...data,
          _radioDisplay: stabilized,
          _stationName: stationName,
        });
      } catch (e) {
        console.warn('[radio updateUI] failed:', e);
      }

      if (ENABLE_NEXT_UP && currentAlexaMode && !pauseMode && !isAirplay) {
        updateNextUp({ isAirplay, isStream, data });
      }

      currentTrackKey = radioKey;
      justResumedFromPause = false;
      justResumedFromPause = false;
    })
    .catch((e) => { console.warn('[fetchNowPlaying] failed:', e?.message || e); });
}

/* =========================
 * Mode logo
 * ========================= */

function setModeLogo({ isAirplay = false, isUpnp = false, isRadio = false, radioLogoUrl = '' }) {
  const logoEl = document.getElementById('mode-logo');
  if (!logoEl) return;

  let url = '';

  if (isAirplay) {
    url = AIRPLAY_ICON_URL;
  } else if (isUpnp) {
    url = UPNP_ICON_URL;
  } else if (isRadio && radioLogoUrl) {
    url = radioLogoUrl; // station logo
  }

  // Nothing to show → fully clear
  if (!url) {
    logoEl.style.display = 'none';
    logoEl.removeAttribute('src');
    logoEl.classList.remove('radio-logo');
    return;
  }

  logoEl.classList.toggle('radio-logo', !!(isRadio && radioLogoUrl));

  // Only update src if it actually changed
  if (logoEl.getAttribute('src') !== url) logoEl.src = url;

  logoEl.style.display = 'block';
}

function hideModeLogo() {
  const logoEl = document.getElementById('mode-logo');
  if (!logoEl) return;
  logoEl.style.display = 'none';
  logoEl.removeAttribute('src');
}

/* =========================
 * Progress animator
 * ========================= */

function stopProgressAnimator() {
  progressAnim.running = false;
  if (progressAnimRaf) cancelAnimationFrame(progressAnimRaf);
  progressAnimRaf = 0;
}

function startProgressAnimator(baseElapsed, duration) {
  if (!Number.isFinite(baseElapsed) || !Number.isFinite(duration) || duration <= 0) {
    stopProgressAnimator();
    return;
  }

  progressAnim.t0 = performance.now();
  progressAnim.baseElapsed = baseElapsed;
  progressAnim.duration = duration;
  progressAnim.running = true;

  const tick = () => {
    if (!progressAnim.running) return;

    const now = performance.now();
    const elapsedNow = progressAnim.baseElapsed + (now - progressAnim.t0) / 1000;

    const pct = (elapsedNow / progressAnim.duration) * 100;
    updateProgressBarPercent(pct);

    if (elapsedNow >= progressAnim.duration) {
      updateProgressBarPercent(100);
      stopProgressAnimator();
      return;
    }

    progressAnimRaf = requestAnimationFrame(tick);
  };

  progressAnimRaf = requestAnimationFrame(tick);
}

function updateProgressBarPercent(percent) {
  const progressFill = document.getElementById('progress-fill');
  if (!progressFill) return;

  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  lastPercent = clamped;

  progressFill.style.transform = `scaleX(${clamped / 100})`;
}

function setProgressVisibility(hide) {
  const wrapper = document.getElementById('progress-bar-wrapper');
  if (!wrapper) return;
  wrapper.style.display = hide ? 'none' : 'block';
}

/* =========================
 * Next Up (text + thumbnail)
 * ========================= */

function updateNextUp({ isAirplay, isStream, data }) {
  // ✅ If we're reusing Next Up as the RADIO FOOTER, don't let Next Up fetch repaint it
  if (radioFooterActive) return;
  const wrap   = document.getElementById('next-up');
  const textEl = document.getElementById('next-up-text');
  const imgEl  = document.getElementById('next-up-img');
  dlog('[NEXTUP updateNextUp called]', { pauseMode, isAirplay, isStream, alexaMode: !!(data && data.alexaMode) });
  
  // allow text even if image element is missing
  if (!wrap || !textEl) return;

  // In Alexa mode, NEVER use /next-up (it is one ahead for Alexa context).
  // Always derive Next Up from /now-playing (queue head) for correctness.
  if (data && data.alexaMode) {
    const applyAlexaQueueHead = (qIn) => {
      const q = qIn || {};
      const title = String(q.title || '').trim();
      const file = String(q.file || '').trim();
      const artist = String(q.artist || '').trim();
      const artUrlRaw = String(q.albumArtUrl || q.altArtUrl || q.artUrl || q.coverUrl || '').trim();
      const artUrl = artUrlRaw.startsWith('/') ? `${API_BASE}${artUrlRaw}` : artUrlRaw;

      const hasIdentity = !!(title || file);
      if (!hasIdentity) {
        // Avoid regressing to "Unknown title" during transient Alexa/random races.
        const existing = String(textEl?.textContent || '').trim();
        if (existing && !/unknown title/i.test(existing)) return;
        return;
      }

      const showTitle = title || file.split('/').pop() || file;
      const showArtist = artist ? ` • ${artist}` : '';
      setNextUpLine(`Next up: ${showTitle}${showArtist}`);

      wrap.style.display = 'flex';
      wrap.style.visibility = 'visible';
      wrap.style.opacity = '1';

      const resolvedArtUrl = artUrl || `${API_BASE}/art/current.jpg`;
      if (!imgEl || !resolvedArtUrl) {
        if (imgEl) {
          imgEl.style.display = 'none';
          imgEl.removeAttribute('src');
          imgEl.dataset.lastUrl = '';
        }
        return;
      }

      const lastUrl = imgEl.dataset.lastUrl || '';
      if (resolvedArtUrl !== lastUrl) {
        imgEl.dataset.lastUrl = resolvedArtUrl;
        imgEl.src = resolvedArtUrl;
      }
      imgEl.style.display = 'block';
    };

    // Prefer already-available queue-head snapshot to avoid transient "Unknown title"
    // when an extra NOW_PLAYING fetch races/fails during random toggles.
    const immediateHead = (data && (data.__queueHead || data)) || {};
    applyAlexaQueueHead(immediateHead);

    // Best-effort refresh from API; only repaint if better data arrives.
    fetch(NOW_PLAYING_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((np) => {
        const cand = np || {};
        const hasBetter = !!String(cand.title || cand.file || '').trim();
        if (hasBetter) applyAlexaQueueHead(cand);
      })
      .catch(() => {});
    return;
  }

  if (pauseMode || isAirplay || isStream) {
    setNextUpLine('');
    if (imgEl) {
      imgEl.style.display = 'none';
      imgEl.removeAttribute('src');
      imgEl.dataset.lastUrl = '';
    }
    lastNextUpKey = '';
    return;
  }

  dlog('NextUp fetch ->', NEXT_UP_URL);
  fetch(NEXT_UP_URL, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(x => {
      dlog('NextUp response <-', x);

      if (!x || x.ok !== true || !x.next) {
        setNextUpLine('');
        if (imgEl) {
          imgEl.style.display = 'none';
          imgEl.removeAttribute('src');
          imgEl.dataset.lastUrl = '';
        }
        lastNextUpKey = '';
        return;
      }

      const next   = x.next;
      const title  = String(next.title || '').trim();
      const file   = String(next.file || '').trim();
      const artist = String(next.artist || '').trim();

      // API may return "/art/current.jpg" (relative). That must be resolved against API_BASE,
      // NOT the page origin (STATIC_BASE / port 8000).
      const artUrlRaw = String(next.artUrl || '').trim();
      const artUrl = artUrlRaw.startsWith('/')
        ? `${API_BASE}${artUrlRaw}`
        : artUrlRaw;

      if (!title && !file) {
        setNextUpLine('');
        if (imgEl) {
          imgEl.style.display = 'none';
          imgEl.removeAttribute('src');
          imgEl.dataset.lastUrl = '';
        }
        lastNextUpKey = '';
        return;
      }

      const key = `${next.songid || ''}|${artist}|${title}|${file}|${artUrl}`;
      const same = (key === lastNextUpKey);
      lastNextUpKey = key;

      const showTitle  = title || file.split('/').pop() || file;
      const showArtist = artist ? ` • ${artist}` : '';
      const line = `Next up: ${showTitle}${showArtist}`;

      // ✅ single source of truth for marquee + overflow measurement
      setNextUpLine(line);

      wrap.style.display = 'flex';
      wrap.style.visibility = 'visible';
      wrap.style.opacity = '1';

      dlog('NextUp painted:', { sameKey: same, artUrl });

      // image optional
      if (!imgEl || !artUrl) {
        if (imgEl) {
          imgEl.style.display = 'none';
          imgEl.removeAttribute('src');
          imgEl.dataset.lastUrl = '';
        }
        return;
      }

      // prevent flashing: only update <img> if URL changed
      const lastUrl = imgEl.dataset.lastUrl || '';
      if (artUrl !== lastUrl) {
        imgEl.dataset.lastUrl = artUrl;
        imgEl.src = artUrl;
      }

      imgEl.style.display = 'block';
    })
    .catch(() => {});
}

function clearNextUpUI() {
  const wrap = document.getElementById('next-up');
  const textEl = document.getElementById('next-up-text');
  const imgEl = document.getElementById('next-up-img');

  if (textEl) setNextUpLine('');

  if (imgEl) {
    imgEl.style.display = 'none';
    imgEl.removeAttribute('src');
    imgEl.dataset.lastUrl = '';
  }

  // ✅ hide the whole row so it can’t overlay anything
  if (wrap) {
    wrap.style.display = 'none';
    wrap.style.visibility = 'hidden';
    wrap.style.opacity = '0';
  }

  lastNextUpKey = '';
}



/* =========================
 * Pause screensaver
 * ========================= */

function isPauseOrStopState(data) {
  const state = String(data.state || '').toLowerCase();
  return (state === 'pause' || state === 'paused' || state === 'stop' || state === 'stopped' || state === 'idle');
}

function ensurePauseArtEl() {
  let el = document.getElementById('pause-art');
  if (el) return el;
  el = document.createElement('img');
  el.id = 'pause-art';
  el.alt = 'Pause art';
  el.style.position = 'fixed';
  el.style.display = 'none';
  el.style.maxWidth = '40vw';
  el.style.maxHeight = '40vh';
  el.style.width = 'auto';
  el.style.height = 'auto';
  el.style.borderRadius = '18px';
  el.style.opacity = '0.35';
  el.style.zIndex = '999';
  el.style.pointerEvents = 'none';
  el.style.objectFit = 'cover';
  document.body.appendChild(el);
  return el;
}

function setPausedScreensaver(on) {
  pauseMode = on;
  if (on) clearStars(); // ✅ entering pause screensaver: hide/clear stars
  document.body.classList.toggle('pause', on);
  document.body.style.backgroundColor = on ? '#000' : '';
  document.documentElement.style.backgroundColor = on ? '#000' : '';

  const artistEl = document.getElementById('artist-name');
  const trackEl  = document.getElementById('track-title');
  const ratingEl = document.getElementById('ratingStars');
  const albumEl  = document.getElementById('album-link');
  const fileInfoText = document.getElementById('file-info-text');
  const hiresBadge = document.getElementById('hires-badge');
  const personnelEl = document.getElementById('personnel-info');
  const nextUpEl = document.getElementById('next-up');

  const show = !on;
  if (artistEl) artistEl.style.display = show ? '' : 'none';
  if (trackEl)  trackEl.style.display  = show ? '' : 'none';
  if (ratingEl) ratingEl.style.display = show ? '' : 'none';
  if (albumEl)  albumEl.style.display  = show ? '' : 'none';
  if (fileInfoText) fileInfoText.style.display = show ? '' : 'none';
  if (hiresBadge) hiresBadge.style.display = show ? '' : 'none';
  if (personnelEl) personnelEl.style.display = (show && PERSONNEL_ENABLED) ? '' : 'none';
  if (nextUpEl) nextUpEl.style.display = show ? '' : 'none';

  const artEl = document.getElementById('album-art');
  const artVideoEl = document.getElementById('album-art-video');
  const artWrapEl = document.getElementById('album-art-wrapper');
  const pauseArtEl = ensurePauseArtEl();
  if (artEl) {
    if (on) {
      // In pause screensaver, force static dedicated pause image for Pi stability.
      if (artVideoEl) {
        try { artVideoEl.pause(); } catch {}
        artVideoEl.style.display = 'none';
      }
      if (artWrapEl) artWrapEl.style.visibility = 'hidden';
      artEl.style.display = 'none';

      pauseArtEl.src = PAUSE_ART_URL;
      pauseArtEl.style.display = 'block';
      movePauseArtRandomly(true);
      lastAlbumArtUrl = '';
    } else {
      pauseArtEl.style.display = 'none';
      pauseArtEl.style.left = '';
      pauseArtEl.style.top = '';
      pauseArtEl.style.transform = '';

      if (artWrapEl) artWrapEl.style.visibility = '';
      artEl.style.display = 'block';

      // ✅ Coming out of pause: force artwork to repaint even if track didn't change
      lastAlbumArtKey = '';
      lastAlbumArtUrl = '';
    }
  }

  const artBgEl = document.getElementById('album-art-bg');
  setBackgroundCrossfade('', '');
  if (artBgEl) artBgEl.style.backgroundImage = 'none';
}

function movePauseArtRandomly(force = false) {
  if (!pauseMode) return;

  const now = Date.now();
  if (!force && (now - lastPauseMoveTs) < PAUSE_MOVE_INTERVAL_MS) return;
  lastPauseMoveTs = now;

  const artEl = document.getElementById('pause-art') || document.getElementById('album-art');
  if (!artEl) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const rect = artEl.getBoundingClientRect();
  const w = rect.width || Math.min(400, vw * 0.4);
  const h = rect.height || Math.min(400, vh * 0.4);

  const minX = PAUSE_ART_MIN_MARGIN_PX;
  const minY = PAUSE_ART_MIN_MARGIN_PX;
  const maxX = Math.max(minX, vw - w - PAUSE_ART_MIN_MARGIN_PX);
  const maxY = Math.max(minY, vh - h - PAUSE_ART_MIN_MARGIN_PX);

  const x = minX + Math.random() * (maxX - minX);
  const y = minY + Math.random() * (maxY - minY);

  artEl.style.left = `${x}px`;
  artEl.style.top = `${y}px`;
  artEl.style.transform = 'none';
}

/* =========================
 * Text helpers (radio/classical/abbrevs)
 * ========================= */

function formatEpisodeDate(data) {
  const raw = String(data?.date || data?.year || '').trim();
  if (!raw) return '';

  let y, m, d;

  // YYYY-MM or YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = iso[3] ? Number(iso[3]) : undefined;
  } else {
    // Fallback: strip non-digits (handles YYYY, YYYYMM, YYYYMMDD)
    const digits = raw.replace(/\D/g, '');

    if (digits.length >= 8) {
      y = Number(digits.slice(0, 4));
      m = Number(digits.slice(4, 6));
      d = Number(digits.slice(6, 8));
    } else if (digits.length >= 6) {
      y = Number(digits.slice(0, 4));
      m = Number(digits.slice(4, 6));
    } else if (digits.length === 4) {
      y = Number(digits);
    }
  }

  if (!Number.isFinite(y) || y <= 0) return raw;

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  if (Number.isFinite(m) && m >= 1 && m <= 12) {
    const month = months[m - 1];

    if (Number.isFinite(d) && d >= 1 && d <= 31) {
      return `${month} ${d}, ${y}`;
    }

    return `${month}, ${y}`;
  }

  return String(y);
}

function looksLikeUrl(s) {
  const t = String(s || '').trim();
  return /^https?:\/\//i.test(t) || t.includes('://');
}

function looksLikeStationName(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (looksLikeUrl(t)) return false;

  // keep it short-ish and “name-like”
  if (t.length > 48) return false;
  if (t.includes(' - ')) return false;          // avoids “Artist - Title” style
  if (t.includes('/')) return false;            // avoids paths
  if ((t.match(/,/g) || []).length >= 2) return false; // avoids performer lists
  return true;
}

function pickStationName(data) {
  // Explicit-ish fields first, then album (which is your real station name)
  const candidates = [
    data._stationName,
    data.stationName,
    data.station,
    data.radioStation,
    data.radioStationName,
    data.streamName,
    data.name,
    data.album,        // ✅ your station name is here
    data.radioAlbum,
  ];

  for (const c of candidates) {
    const t = String(c || '').trim();
    if (!t) continue;
    if (looksLikeUrl(t)) continue;
    return t;
  }

  return 'Radio';
}

function getDisplayRate(data) {
  if (data?.alexaMode) return 'Alexa Mode';

  const isStream = data?.isStream === true;

  const streamKind = String(data?.streamKind || '').trim().toLowerCase();
  const isUpnp = isStream && (data?.isUpnp === true || streamKind === 'upnp');
  const isRadio = isStream && !isUpnp;

  const encoded = String(data?.encoded || '').trim();
  const outrate = String(data?.outrate || '').trim();
  const br      = String(data?.bitrate || '').trim();

  if (isRadio) {
    // Prefer PCM-derived “FLAC • 32-bit / 192 kHz” style when available
    // Examples seen: "PCM 32/192 kHz, 2ch"
    let m = outrate.match(/PCM\s+(\d+)\s*\/\s*(\d+)\s*kHz/i);
    if (m) return `PCM • ${m[1]}-bit / ${m[2]} kHz`;

    // Alternate formats sometimes show "PCM 32-bit 192 kHz"
    m = outrate.match(/PCM\s+(\d+)\s*-\s*bit\s+(\d+)\s*kHz/i);
    if (m) return `FLAC • ${m[1]}-bit / ${m[2]} kHz`;

    // If encoded is actually useful (not "VBR/CBR/Unknown"), show it
    if (encoded && !/^(vbr|cbr|unknown)$/i.test(encoded)) {
      return br ? `${encoded} • ${br}` : encoded;
    }

    // Otherwise fall back to bitrate or (last resort) a sane label
    if (br) return br;
    if (/PCM/i.test(outrate)) return 'Lossless';
    return 'Radio';
  }

  // Local files / non-radio streams
  if (encoded) return encoded;
  if (br) return br;
  return '';
}
 
function normalizeArtKey(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  // ignore cache-busters and fragments so equality is stable
  return s.split('#')[0].split('?')[0];
}
 

function normalizeDashSpacing(s) {
  return String(s || '')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function parseKbps(bitrateStr) {
  const s = String(bitrateStr || '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*kbps/i);
  return m ? parseFloat(m[1]) : 0;
}

function getBadgeInfo(data) {
    const encoded = String(data.encoded || '').trim();
    const outrate = String(data.outrate || '').trim();
    const kbps = parseKbps(data.bitrate);

    const encodedIsLossless = /^(?:FLAC|ALAC|WAV|AIFF)\b/i.test(encoded);
    if (encodedIsLossless) return { show: true, text: 'Lossless' };

    if (data.isStream) {
        const isMp3Aac = /(MP3|AAC)/i.test(encoded);
        const isOpus = /OPUS/i.test(encoded);
        const isHq = (isMp3Aac && kbps >= 256) || (isOpus && kbps >= 128);
        if (isHq) return { show: true, text: 'HQ' };
    }

    return { show: false, text: '' };
}

function splitArtistDashTitle(s) {
  const t = String(s || '').trim();
  const parts = t.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return null;
}

function looksLikeComposerWork(s) {
  const t = String(s || '').toLowerCase();
  if (/sinfonie|symphon(y|ie)|concerto|sonat(e|a)|quartett|quintett|opus|op\.\s*\d|hob\./i.test(s)) return true;
  if (t.includes(' - ') && t.split(' - ')[0].trim().split(/\s+/).length >= 2) return true;
  return false;
}

function looksLikeEnsembleConductor(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes(' / ')) return true;
  if (/orchester|orchestra|ensemble|kammerorchester|phil(harm|harmon)|choir|chor|quartet|quintet|dirig|conduct/i.test(t)) return true;
  return false;
}

function removeInlinePersonnelFromTitleLine(titleLine) {
  const s = normalizeDashSpacing(titleLine);
  // Handles both " - Soloist, p; Orchestra/Conductor" and "-Soloist, p; ..."
  let idx = s.search(/\s*-\s*[^-]+,\s*[a-z]{1,4}\s*;/i);
  if (idx >= 0) return s.slice(0, idx).trim();
  // Handles "-Orchestra/Soloist, v" compact form
  idx = s.search(/\s*-\s*[^\/;]+\s*\/\s*[^,;]+,\s*(?:p|pf|pno|vn|vln|vc|cello)\b/i);
  if (idx >= 0) return s.slice(0, idx).trim();
  // Handles "- English Concert members Archiv" style trailing performer+label suffix
  idx = s.search(/\s*-\s*(?:the\s+)?[A-Za-zÀ-ÿ'’.&\- ]+\s+(?:members|orch(?:estra)?|ensemble|camerata|concert)\b.*$/i);
  if (idx >= 0) return s.slice(0, idx).trim();
  return s;
}

function buildRadioPersonnelLine(data, displayTitle) {
  const raw = String(data.radioPerformers || '').trim();
  if (!raw) return '';

  const cleaned = expandInstrumentAbbrevs(decodeHtmlEntities(raw));
  const titleNorm = normalizeDashSpacing(displayTitle || '');
  const perfNorm  = normalizeDashSpacing(cleaned);

  if (perfNorm && titleNorm && titleNorm.toLowerCase().includes(perfNorm.toLowerCase())) {
    return '';
  }

  const looksLikeMovementOnly =
    /^[IVXLCDM]+\.\s*/i.test(perfNorm) &&
    !/[;,]/.test(perfNorm) &&
    !/\b(orchestra|ensemble|choir|quartet|trio|dir|conduct)\b/i.test(perfNorm) &&
    !/[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+/.test(perfNorm.replace(/^[IVXLCDM]+\.\s*/i, '').trim());

  if (looksLikeMovementOnly) return '';

  const parts = cleaned.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) return parts.join(' • ');
  return cleaned;
}

function expandInstrumentAbbrevs(input) {
  let s = String(input || '');
  if (!s) return s;

  const reps = [
    ['vc', 'cello'],
    ['db', 'double bass'],
    ['cb', 'double bass'],
    ['p',  'piano'],
    ['hp', 'harp'],
    ['ob', 'oboe'],
    ['eh', 'english horn'],
    ['cl', 'clarinet'],
    ['bcl','bass clarinet'],
    ['fl', 'flute'],
    ['f', 'flute'],
    ['fh', 'horn'],
    ['g',  'guitar'],
    ['pic', 'piccolo'],
    ['bn', 'bassoon'],
    ['cbsn', 'contrabassoon'],
    ['hn', 'horn'],
    ['tpt','trumpet'],
    ['tp', 'trumpet'],
    ['tbn','trombone'],
    ['tb', 'trombone'],
    ['tba','tuba'],
    ['perc','percussion'],
    ['timp','timpani'],
    ['vln','violin'],
    ['vn', 'violin'],
    ['v',  'violin'],
    ['vla','viola'],
    ['va', 'viola'],
    ['vi', 'viola'],
    ['sop','soprano'],
    ['mez','mezzo-soprano'],
    ['alto','alto'],
    ['ten','tenor'],
    ['bar','baritone'],
    ['bs', 'bass'],
  ];

  for (const [abbr, full] of reps) {
    const re = new RegExp(`(^|[\\s,;])${abbr}(?=\\s*(?:[;,)\\]]|\\-|$))`, 'gi');
    s = s.replace(re, `$1${full}`);
  }

  s = s.replace(/\s+-\s+/g, ' - ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

function parseQuotedAttrs(s) {
  const t = String(s || '');
  // Looks for key="value" pairs (or key='value')
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out = {};
  let m;
  while ((m = re.exec(t))) {
    const key = m[1];
    const val = (m[2] ?? m[3] ?? '').trim();
    if (key && val) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

function stabilizeRadioDisplay(data) {
    const stationKey = `${data.file}|${data.album || ''}`;
    const incomingRaw = decodeHtmlEntities(String(data.title || '').trim());
    const apiArtist = String(data.artist || '').trim();
    const apiArtistGeneric = !apiArtist || /^\d{1,3}$/.test(apiArtist) || /radio|stream|wfmt|mimic|station/i.test(apiArtist);
    const attrs = parseQuotedAttrs(incomingRaw);
    if (attrs) {
        const t = String(attrs.title || '').trim();
        const a = String(attrs.artist || '').trim();

        // If iHeart didn’t provide an artist, fall back as you already do
        return {
            artist: a || String(data.artist || '').trim() ||
                    String(data.radioArtist || '').trim() ||
                    (String(data.album || '').trim() || 'Radio Stream'),
            title:  t || incomingRaw
        };
    }
    const incoming = incomingRaw;

    // If backend already gave a strong artist (e.g., composer after WFMT parsing),
    // don't let client-side dash-splitting overwrite it on subsequent polls.
    if (!apiArtistGeneric && apiArtist.split(/\s+/).length >= 2) {
        return { artist: apiArtist, title: incoming };
    }

    // Prefer a real artist (prevents boot flicker where artist becomes album/station)
    function fallbackRadioArtist() {
        const a = String(data.artist || '').trim();
        if (a) return a;

        const ra = String(data.radioArtist || '').trim();
        if (ra) return ra;

        const station = String(data.radioAlbum || data.album || '').trim();
        return station || 'Radio Stream';
    }

    if (radioState.key !== stationKey) {
        radioState.key = stationKey;
        radioState.recentTitles = [];
    }

    if (incoming) {
        const last = radioState.recentTitles[radioState.recentTitles.length - 1];
        if (incoming !== last) {
            radioState.recentTitles.push(incoming);
            if (radioState.recentTitles.length > 3) radioState.recentTitles.shift();
        }
    }

    const dashSplit = splitArtistDashTitle(incoming);
    if (dashSplit) {
        const left = dashSplit.artist || '';
        const right = dashSplit.title || '';

        const colonIdx = left.indexOf(':');
        if (colonIdx > 0) {
            const composer = left.slice(0, colonIdx).trim();
            const work = left.slice(colonIdx + 1).trim();
            const looksComposer = /^[A-ZÀ-ÖØ-Þ]/.test(composer) && composer.split(/\s+/).length >= 2;

            if (looksComposer && work) {
                return { artist: composer, title: right ? `${work} -- ${right}` : work };
            }
        }
        return dashSplit;
    }

    const uniq = [...new Set(radioState.recentTitles)].slice(-2);
    if (uniq.length === 2) {
        const [a, b] = uniq;
        let work = '';
        let perf = '';

        if (looksLikeComposerWork(a) && looksLikeEnsembleConductor(b)) { work = a; perf = b; }
        else if (looksLikeComposerWork(b) && looksLikeEnsembleConductor(a)) { work = b; perf = a; }
        else if (looksLikeComposerWork(a) && !looksLikeComposerWork(b)) { work = a; perf = b; }
        else if (looksLikeComposerWork(b) && !looksLikeComposerWork(a)) { work = b; perf = a; }
        else {
            return { artist: fallbackRadioArtist(), title: incoming };
        }

        return { artist: perf || fallbackRadioArtist(), title: work || incoming };
    }

    return { artist: fallbackRadioArtist(), title: incoming };
}

let lastNextUpLine = '';

function setNextUpLine(line) {
  const textEl = document.getElementById('next-up-text');
  if (!textEl) return;

  line = line || '';

  // ✅ don't restart if identical
  if (line === lastNextUpLine) return;
  lastNextUpLine = line;

  const track = textEl.querySelector('.marquee-track');
  const copies = track ? track.querySelectorAll('.marquee-copy') : null;

  // Fallback if markup isn't updated
  if (!track || !copies || copies.length < 2) {
    textEl.textContent = line;
    return;
  }

  // Set both copies
  copies[0].textContent = line;
  copies[1].textContent = line;

  // Reset to static first
  textEl.classList.remove('marquee');
  textEl.style.removeProperty('--marqueeShift');
  textEl.style.removeProperty('--marqueeDur');
  track.style.animation = 'none';
  track.style.transform = 'translateX(0)';

  requestAnimationFrame(() => {
    const copy0 = copies[0];

    const gap = parseFloat(getComputedStyle(textEl).getPropertyValue('--marqueeGap')) || 24;

    // Width of one copy (without the duplicated one)
    const copyWidth = copy0.scrollWidth;

    // Does it overflow container?
    const overflow = copyWidth - textEl.clientWidth;

    if (overflow > 2) {
      // Scroll exactly one copy + gap, so loop is seamless
      const shift = Math.ceil(copyWidth + gap);
      textEl.style.setProperty('--marqueeShift', `${shift}px`);

      // Optional: duration based on pixels (constant speed)
      const pxPerSec = 60; // tweak: higher = faster
      const dur = Math.max(6, shift / pxPerSec);
      textEl.style.setProperty('--marqueeDur', `${dur}s`);

      textEl.classList.add('marquee');

      // Restart animation cleanly (iOS Safari needs it)
      track.style.animation = 'none';
      track.offsetHeight;
      track.style.animation = '';
    }
  });
}

// =========================
// Favorites (heart toggle)
// =========================

function setFavoriteUI(isFav, file) {
  const favBtn = document.getElementById('fav-heart');
  if (!favBtn) return;

  favBtn.classList.toggle('on', !!isFav);
  favBtn.dataset.isFavorite = isFav ? '1' : '0';
  favBtn.dataset.file = file || '';
}

async function onToggleFavorite(ev) {
  dlog('[fav] onToggleFavorite start');
  ev.preventDefault();
  ev.stopPropagation();

  const btn = document.getElementById('fav-heart');
  if (!btn || btn.classList.contains('busy')) return;

  const file = btn.dataset.file || '';
  if (!file) return;

  const was  = btn.dataset.isFavorite === '1';
  const want = !was;

  // optimistic UI
  setFavoriteUI(want, file);
  btn.classList.add('busy');

  try {
    const r = await fetch(FAVORITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: want }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j?.error || 'favorite failed');

    // server truth
    setFavoriteUI(!!j.isFavorite, j.file || file);
    pendingFavorite = {
    file: String(j.file || file || ''),
    isFavorite: !!j.isFavorite,
    ts: Date.now(),
  };
  } catch (e) {
    // revert
    setFavoriteUI(was, file);
    console.warn('[favorite] toggle failed:', e?.message || e);
  } finally {
    btn.classList.remove('busy');
  }
}

/* =========================
 * Star helpers
 * ========================= */

function applyRatingFromNowPlaying(np) {
  if (np?.isPodcast === true) {
    pendingRating = null;
    clearStars();
    return;
  }

  const npFile = String(np?.ratingFile || '').trim();
  const npRating = Math.max(0, Math.min(5, Number(np?.rating) || 0));
  const npDisabled = !!np?.ratingDisabled || !npFile;

  // If ratings not allowed, always clear (pause/stream/airplay)
  if (!ratingsAllowedNow()) {
    pendingRating = null;
    clearStars();
    return;
  }

  // If server says disabled, always clear (also clears pending)
  if (npDisabled) {
    pendingRating = null;
    clearStars();
    return;
  }

  // ✅ Optimistic hold: if we JUST set a rating for this same file,
  // ignore mismatching /now-playing briefly to prevent “snap back”.
  if (pendingRating && npFile === pendingRating.file) {
    const age = Date.now() - pendingRating.ts;

    if (age < PENDING_RATING_HOLD_MS) {
      if (npRating !== pendingRating.rating) {
        // keep showing pending
        ratingDisabled = false;
        lastRatingFile = pendingRating.file;
        currentRating  = pendingRating.rating;
        renderStars(currentRating);
        return;
      } else {
        // now-playing caught up, release hold
        pendingRating = null;
      }
    } else {
      // timeout: release hold and accept now-playing
      pendingRating = null;
    }
  }

  // Normal path: accept now-playing truth
  ratingDisabled = false;
  lastRatingFile = npFile;
  currentRating  = npRating;
  renderStars(currentRating);
}

/* =========================
 * Art helpers
 * ========================= */
function pickAirplaySourceName(data) {
  // Use whatever your API exposes (add more candidates as you discover them)
  const candidates = [
    data.airplaySource,
    data.airplaySourceName,
    data.airplaySender,
    data.sourceName,
    data.source,
    data.device,
    data.client,
  ];

  for (const c of candidates) {
    const t = String(c || '').trim();
    if (t) return t;
  }

  return '';
}

function setAirplayFooter(data) {
  const src = pickAirplaySourceName(data);
  const line = src ? `AirPlay from ${src}` : 'AirPlay';

  // reuse Next Up row
  setRadioFooter(line, AIRPLAY_ICON_URL);
}

function setRadioFooter(stationName, logoUrl) {
  const wrap  = document.getElementById('next-up');
  const imgEl = document.getElementById('next-up-img');
  if (!wrap) return;

  radioFooterActive = true;

  // Ensure row is visible
  wrap.style.display = 'flex';
  wrap.style.visibility = 'visible';
  wrap.style.opacity = '1';

  // Station name goes into the Next Up text (NO "Next up:" prefix)
  setNextUpLine(stationName || 'Radio');

  // Logo goes into the Next Up image slot
  if (imgEl && logoUrl) {
    if (imgEl.dataset.lastUrl !== logoUrl) {
      imgEl.dataset.lastUrl = logoUrl;
      imgEl.src = logoUrl;
    }
    imgEl.style.display = 'block';
  } else if (imgEl) {
    imgEl.style.display = 'none';
    imgEl.removeAttribute('src');
    imgEl.dataset.lastUrl = '';
  }
}

function clearRadioFooterIfActive() {
  if (!radioFooterActive) return;
  radioFooterActive = false;

  // Don’t “clear next up” globally — just reset the row.
  clearNextUpUI();
}


/* =========================
 * Foreground art loader (preload + commit-on-load)
 * ========================= */


function setForegroundArtWithPreload(imgEl, fgUrl, artKey) {
  if (!imgEl) return;

  const url = String(fgUrl || '').trim();
  const key = String(artKey || '').trim();

  if (!url || !key) {
    imgEl.removeAttribute('src');
    fgLoadingKey = '';
    fgLoadingUrl = '';
    return;
  }

  // If already painted this key and we're not in placeholder mode, bail
  const currentSrc = String(imgEl.getAttribute('src') || '');
  const isPlaceholder = currentSrc.startsWith('data:image');
  if (!isPlaceholder && key === lastAlbumArtKey) return;

  // Prevent duplicate in-flight loads for SAME key+url
  if (key === fgLoadingKey && url === fgLoadingUrl) return;

  const myToken = ++fgReqToken;
  fgLoadingKey = key;
  fgLoadingUrl = url;

  // Use AbortController so BOTH listeners are removed together
  const controller = new AbortController();
  const { signal } = controller;

  const cleanup = () => {
    try { controller.abort(); } catch {}
  };

  const onLoad = () => {
    if (myToken !== fgReqToken) return cleanup();
    if (fgLoadingKey !== key || fgLoadingUrl !== url) return cleanup();

    lastAlbumArtKey = key;
    lastAlbumArtUrl = url;
    fgLoadingKey = '';
    fgLoadingUrl = '';

    cleanup();
  };

  const onError = () => {
    if (myToken !== fgReqToken) return cleanup();

    // Clear in-flight markers so a later poll can retry
    if (fgLoadingKey === key && fgLoadingUrl === url) {
      fgLoadingKey = '';
      fgLoadingUrl = '';
    }

    cleanup();
  };

  imgEl.addEventListener('load', onLoad, { signal });
  imgEl.addEventListener('error', onError, { signal });

  // ✅ single fetch: the visible <img> does the loading
  imgEl.src = url;

  // Optional hints (harmless)
  try { imgEl.decoding = 'async'; } catch {}
  try { imgEl.loading = 'eager'; } catch {}
}

/* =========================
 * UI update
 * ========================= */

/* =========================
 * UI update
 * ========================= */

function updateUI(data) {
  if (pauseMode) return;

  // =========================
  // Mode flags
  // =========================
  let isStream  = data.isStream === true;
  let isAirplay = data.isAirplay === true;
  const isAlexaMode = data?.alexaMode === true;
  // Alexa mode should behave like local-track display for ratings/stars.
  if (isAlexaMode) {
    isStream = false;
    isAirplay = false;
  }

  setPlayIcon(isPlayingState(data));

  const streamKind = String(data.streamKind || '').trim().toLowerCase();
  const isUpnp  = isStream && (data.isUpnp === true || streamKind === 'upnp');
  const isRadio = isStream && !isUpnp;

  const isPhonePortrait =
    window.matchMedia &&
    window.matchMedia('(max-width: 520px) and (orientation: portrait)').matches;

  // =========================
  // Core state
  // =========================
  currentFile = String(data.file || '');
  currentIsStream = isStream;
  currentIsAirplay = isAirplay;
  currentAlexaMode = data?.alexaMode === true;
  currentIsPodcast = inferIsPodcast(data);

  if (DEBUG) {
    DEBUG && console.groupCollapsed('%c[PODCAST DETECT]', 'color:#ff9800;font-weight:bold');
    dlog('file:', data.file);
    dlog('genre raw:', data.genre);
    dlog('genre parsed:', splitGenres(
      data?.genre ??
      data?.Genre ??
      data?.tags?.genre ??
      data?.metadata?.genre ??
      ''
    ));
    dlog('server isPodcast flag:', data.isPodcast === true);
    dlog('👉 inferred isPodcast:', currentIsPodcast);
    DEBUG && console.groupEnd();
  }

  // Favorites: UI + datasets (single source of truth)
  const fav = (!isStream && !isAirplay && data.isFavorite === true);
  setFavoriteUI(fav, currentFile);
  currentIsFavorite = fav;

  // =========================
  // Elements
  // =========================
  const artistEl    = document.getElementById('artist-name');
  const titleEl     = document.getElementById('track-title');
  const albumLinkEl = document.getElementById('album-link');
  const albumTextEl = document.getElementById('album-text');
  const fileInfoEl  = document.getElementById('file-info-text');
  const hiresBadge  = document.getElementById('hires-badge');
  const personnelEl = document.getElementById('personnel-info');
  const artEl       = document.getElementById('album-art');
  const artBgEl     = document.getElementById('album-art-bg');

  // Alexa mode: brute-force art refresh by file, independent of art cache/crossfade logic.
  if (currentAlexaMode && artEl) {
    const f = String(currentFile || '').trim();
    if (f && f !== lastAlexaForcedArtFile) {
      const u = `${API_BASE}/art/track_640.jpg?file=${encodeURIComponent(f)}&_=${Date.now()}`;
      artEl.src = u;
      if (artBgEl) {
        artBgEl.style.backgroundImage = `url("${u}")`;
        artBgEl.style.backgroundSize = 'cover';
        artBgEl.style.backgroundPosition = 'center';
      }
      try { setMotionArtVideo('', u); } catch {}
      lastAlexaForcedArtFile = f;
    }
  }

  // =========================
  // Artist / Title (radio stabilized)
  // =========================
  let displayArtist = String(data.artist || '');
  let displayTitle  = String(data.title  || '');

  if (isAirplay && !displayTitle.trim()) displayTitle = 'AirPlay';

  if (isRadio) {
    const radioDisp  = (data && data._radioDisplay) ? data._radioDisplay : null;
    const stabArtist = String((radioDisp && radioDisp.artist) ? radioDisp.artist : '').trim();
    const stabTitle  = String((radioDisp && radioDisp.title)  ? radioDisp.title  : '').trim();

    const radioArtist = String(data.radioArtist || '').trim();
    const radioTitle  = String(data.radioTitle  || '').trim();

    const incomingTitleLine = decodeHtmlEntities(String(data.title || '').trim());

    // Try to tease out "Artist - Title" from the incoming title line
    let teasedArtist = '';
    let teasedTitle  = '';
    const dashSplit = splitArtistDashTitle(normalizeDashSpacing(incomingTitleLine));
    if (dashSplit) {
      teasedArtist = String(dashSplit.artist || '').trim();
      teasedTitle  = String(dashSplit.title  || '').trim();
    }

    displayArtist =
      radioArtist ||
      stabArtist ||
      String(data.artist || '').trim() ||
      teasedArtist ||
      'Radio Stream';

    displayTitle =
      radioTitle ||
      stabTitle ||
      String(displayTitle || '').trim() ||
      teasedTitle ||
      incomingTitleLine;

    // ✅ Key change: strip inline performers from the title line
    // so they don't live in the title text block.
    displayTitle = removeInlinePersonnelFromTitleLine(displayTitle);
  }

  displayArtist = expandInstrumentAbbrevs(displayArtist);
  displayTitle  = expandInstrumentAbbrevs(displayTitle);

if (artistEl) artistEl.textContent = decodeHtmlEntities(displayArtist);
if (titleEl) {
  titleEl.textContent = decodeHtmlEntities(displayTitle);
}

  // =========================
  // Album line + share icon (DOM-stable)
  // =========================
  if (albumTextEl) {
    const inAlexaMode = data?.alexaMode === true;
    const album = (isRadio && !inAlexaMode)
      ? decodeHtmlEntities(String(data.radioAlbum || data.album || ''))
      : decodeHtmlEntities(String(data.album || data.radioAlbum || ''));

    let year = (isRadio && !inAlexaMode)
      ? String(data.radioYear || data.year || '').trim()
      : String(data.year || data.radioYear || '').trim();

    // Alexa mode often has date but not year; derive year from date when missing.
    if (!year) {
      const d = String(data.date || '').trim();
      const m = d.match(/^(\d{4})/);
      if (m) year = m[1];
    }

    // ✅ Podcast: show episode date where album would normally go
    const episodeDate = currentIsPodcast ? formatEpisodeDate(data) : '';

    const text = currentIsPodcast
      ? episodeDate
      : (album ? `${album}${year ? ` (${year})` : ''}` : '');

    // Build stable structure once (prevents icon getting wiped)
    if (!albumTextEl.querySelector('.album-inline')) {
      albumTextEl.innerHTML = `
        <span class="album-inline">
          <span class="album-text"></span>
          <svg
            class="share-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 000-1.39l7.02-4.11A2.99 2.99 0 0018 7.91a3 3 0 10-3-3c0 .23.03.45.08.66L8.06 9.68a3 3 0 100 4.65l7.02 4.11c-.05.2-.08.41-.08.63a3 3 0 103-3z"/>
          </svg>
        </span>
      `;
    }

    const textSpan = albumTextEl.querySelector('.album-text');
    if (textSpan) textSpan.textContent = text;
  }

  // Link behavior (independent of whether we show icon)
  if (albumLinkEl) {
    const url = String(data.radioItunesUrl || data.itunesUrl || '').trim();

    if (url) {
      albumLinkEl.href = url;
      albumLinkEl.target = '_blank';
      albumLinkEl.rel = 'noopener';
      albumLinkEl.style.pointerEvents = 'auto';
      albumLinkEl.style.cursor = 'pointer';
      albumLinkEl.title = 'Open in Apple Music';
    } else {
      albumLinkEl.removeAttribute('href');
      albumLinkEl.removeAttribute('target');
      albumLinkEl.removeAttribute('rel');
      albumLinkEl.style.pointerEvents = 'none';
      albumLinkEl.style.cursor = '';
      albumLinkEl.removeAttribute('title');
    }
  }
  // =========================
  // File info + badge
  // =========================
  if (fileInfoEl && hiresBadge) {
    fileInfoEl.textContent = getDisplayRate(data);

    const badge = getBadgeInfo(data);
    if (badge.show) {
      hiresBadge.textContent = badge.text;
      hiresBadge.style.display = 'inline-block';
    } else {
      hiresBadge.style.display = 'none';
    }
  }

  // =========================
  // Personnel
  // - Local files: show personnel array
  // - Radio: show cleaned radio performers (if present)
  // - AirPlay / UPnP: hide
  // =========================
  if (personnelEl) {
    if (!PERSONNEL_ENABLED) {
      personnelEl.textContent = '';
      personnelEl.style.display = 'none';
    } else if (isAirplay || isUpnp) {
      personnelEl.textContent = '';
      personnelEl.style.display = '';
    } else if (isRadio) {
      // Move radio performers into the personnel line
      const pLine = buildRadioPersonnelLine(data, displayTitle);
      personnelEl.textContent = pLine || '';
      personnelEl.style.display = '';
    } else {
      const personnel = Array.isArray(data.personnel) ? data.personnel : [];
      personnelEl.textContent = personnel.length
        ? personnel.map(expandInstrumentAbbrevs).join(' • ')
        : '';
      personnelEl.style.display = '';
    }
  }

  // =========================
  // Art selection
  // =========================
  const alt     = String(data.altArtUrl   || '').trim();
  const primary = String(data.albumArtUrl || '').trim();

  // Prefer real cover art first; only fall back to alt art (station logo, etc.)
  const rawArtUrl = (primary || alt);
  // In Alexa mode, keep full URL (including file query) so art changes per track are detected.
  const artKey = data.alexaMode ? String(rawArtUrl || '').trim() : normalizeArtKey(rawArtUrl);

  // Detect placeholder / missing
  const needsInitialPaint =
    artEl &&
    (
      !artEl.getAttribute('src') ||
      String(artEl.getAttribute('src') || '').startsWith('data:image')
    );

  // Build URLs
  const bgArtUrl =
    (ENABLE_BACKGROUND_ART && artKey)
      ? (data.alexaMode
          ? rawArtUrl
          : `${API_BASE}/art/current_bg_640_blur.jpg?v=${encodeURIComponent(artKey)}`)
      : '';

  const fgUrl = (isAirplay && !IS_PUBLIC && rawArtUrl)
    ? rawArtUrl
    : (data.alexaMode
        ? rawArtUrl
        : (artKey ? `${API_BASE}/art/current.jpg?v=${encodeURIComponent(artKey)}` : ''));

  const appleUrl = String(data.radioItunesUrl || data.itunesUrl || data.radioAppleMusicUrl || '').trim();
  const trackKey = String(data.file || data.songid || '').trim();
  const motionToken = ++motionReqToken;

  // Motion lock: once motion is proven for a track, keep using it for that same track.
  if (trackKey && motionLockTrackKey === trackKey && motionLockMp4) {
    setMotionArtVideo(motionLockMp4, fgUrl || rawArtUrl);
  } else if (motionArtEnabled()) {
    if (isRadio && appleUrl) {
      resolveMotionMp4(appleUrl)
        .then((mp4) => {
          if (motionToken !== motionReqToken) return;
          const resolved = String(mp4 || '').trim();
          if (resolved) {
            if (trackKey) { motionLockTrackKey = trackKey; motionLockMp4 = resolved; }
            setMotionArtVideo(resolved, fgUrl || rawArtUrl);
          } else if (trackKey && motionLockTrackKey === trackKey && motionLockMp4) {
            setMotionArtVideo(motionLockMp4, fgUrl || rawArtUrl);
          } else {
            setMotionArtVideo('', fgUrl || rawArtUrl);
          }
        })
        .catch(() => {
          if (motionToken !== motionReqToken) return;
          if (trackKey && motionLockTrackKey === trackKey && motionLockMp4) {
            setMotionArtVideo(motionLockMp4, fgUrl || rawArtUrl);
          } else {
            setMotionArtVideo('', fgUrl || rawArtUrl);
          }
        });
    } else if (!isRadio && !isAirplay) {
      resolveLocalMotionMp4(String(data.artist || ''), String(data.album || ''))
        .then((mp4) => {
          if (motionToken !== motionReqToken) return;
          const resolved = String(mp4 || '').trim();
          if (resolved) {
            if (trackKey) { motionLockTrackKey = trackKey; motionLockMp4 = resolved; }
            setMotionArtVideo(resolved, fgUrl || rawArtUrl);
          } else if (trackKey && motionLockTrackKey === trackKey && motionLockMp4) {
            setMotionArtVideo(motionLockMp4, fgUrl || rawArtUrl);
          } else {
            setMotionArtVideo('', fgUrl || rawArtUrl);
          }
        })
        .catch(() => {
          if (motionToken !== motionReqToken) return;
          if (trackKey && motionLockTrackKey === trackKey && motionLockMp4) {
            setMotionArtVideo(motionLockMp4, fgUrl || rawArtUrl);
          } else {
            setMotionArtVideo('', fgUrl || rawArtUrl);
          }
        });
    } else {
      setMotionArtVideo('', fgUrl || rawArtUrl);
    }
  } else {
    setMotionArtVideo('', fgUrl || rawArtUrl);
  }

  // =========================
  // Background + glow updates
  // =========================
  if (!artKey) {
    // Truly no art → clear everything (and allow retry later)
    if (artEl) artEl.removeAttribute('src');
    if (artBgEl) artBgEl.style.backgroundImage = 'none';
    if (ENABLE_BACKGROUND_ART) setBackgroundCrossfade('', '');
    lastAlbumArtUrl = '';
    lastAlbumArtKey = '';
    fgLoadingKey = '';
    fgLoadingUrl = '';
    return;
  }

  if (ENABLE_BACKGROUND_ART) {
    setBackgroundCrossfade(bgArtUrl, artKey);

    if (artBgEl) {
      const glowUrl = fgUrl || '';
      artBgEl.style.backgroundImage = glowUrl ? `url("${glowUrl}")` : 'none';
      artBgEl.style.backgroundSize = 'cover';
      artBgEl.style.backgroundPosition = 'center';
    }
  } else {
    setBackgroundCrossfade('', '');
    if (artBgEl) artBgEl.style.backgroundImage = 'none';
  }

  // =========================
  // Foreground: commit-on-load (fixes “missing art” races)
  // =========================
  const artKeyChanged = (artKey !== lastAlbumArtKey);
  if (needsInitialPaint || artKeyChanged) {
    // Important: do NOT set lastAlbumArtKey here — only after load succeeds
    setForegroundArtWithPreload(artEl, fgUrl, artKey);
  }

  dlog('[UI]', {
    isRadio,
    isUpnp,
    isAirplay,
    isPhonePortrait,
    displayArtist,
    displayTitle,
    artKey,
    needsInitialPaint,
    artKeyChanged
  });
}




/* =========================
 * Personnel modal (HOTSPOT only)
 * ========================= */

function attachClickEventToAlbumArt() {
  const modal   = document.getElementById('artist-details-container');
  const details = document.getElementById('artist-details');
  const hotspot = document.getElementById('art-info-hotspot');
  const art     = document.getElementById('album-art'); // still used for src in modal

  if (!modal || !details || !hotspot) return;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getNowPlayingSafe() {
    try {
      return (typeof window.lastNowPlayingData !== 'undefined' && window.lastNowPlayingData)
        ? window.lastNowPlayingData
        : {};
    } catch {
      return {};
    }
  }

  function buildModalHtml() {
    const d = getNowPlayingSafe();
    const isStream  = d.isStream === true;
    const isAirplay = d.isAirplay === true;

    const artist = esc(d.artist || '');
    const title  = esc(d.title || '');
    const album  = esc(d.album || '');
    const year   = esc(d.year || '');

    const personnel = Array.isArray(d.personnel) ? d.personnel.filter(Boolean) : [];
    const hasPersonnel = !isStream && !isAirplay && personnel.length > 0;

    const src = art?.getAttribute('src') || '';

    const hdr = `
      <div style="font-weight:700;font-size:18px;margin-bottom:10px;">
        ${artist}${artist && title ? ' — ' : ''}${title}
      </div>
      <div style="opacity:.75;margin-bottom:14px;">
        ${album}${album && year ? ` (${year})` : (year ? `(${year})` : '')}
      </div>
    `;

    if (hasPersonnel) {
      const items = personnel
        .map(p => `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.08);">${esc(p)}</div>`)
        .join('');

      return `
        <div style="
          width:min(92vw,560px);
          max-height:min(86vh,740px);
          overflow:auto;
          padding:18px 18px;
          border-radius:18px;
          background:rgba(0,0,0,0.78);
          box-shadow:0 18px 55px rgba(0,0,0,0.55);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
        ">
          ${hdr}
          <div style="font-weight:700;margin:10px 0 6px 0;">Personnel</div>
          <div style="font-size:15px;line-height:1.25;">
            ${items}
          </div>
          <div style="margin-top:14px;opacity:.85;font-size:12px;">Tap outside to close</div>
        </div>
      `;
    }

    return `
      <div style="
        width:min(92vw,560px);
        padding:18px;
        border-radius:18px;
        background:rgba(0,0,0,0.78);
        box-shadow:0 18px 55px rgba(0,0,0,0.55);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
      ">
        ${hdr}
        ${src ? `
          <img src="${src}" alt="Album Art"
               style="display:block;max-width:100%;max-height:60vh;border-radius:14px;">
        ` : `<div style="opacity:.8">No artwork available.</div>`}
        <div style="margin-top:14px;opacity:.85;font-size:12px;">Tap outside to close</div>
      </div>
    `;
  }

  function openModal() {
    details.innerHTML = buildModalHtml();
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  function isModalOpen() {
    return modal.style.display === 'flex' || modal.style.display === 'block';
  }

  // ✅ HOTSPOT toggles modal (NOT the whole album art)
  hotspot.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isModalOpen()) closeModal();
    else openModal();
  }, { passive: false });

  // ✅ tap outside closes
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // ✅ escape closes (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen()) closeModal();
  });
}

/* =========================
 * Clear UI (optional)
 * ========================= */

/* =========================
 * Phone controls (LAN moOde commands) + Play/Pause icon
 * ========================= */

(() => {
  // ✅ Always send commands to the actual moOde player on LAN
  // If you ever want this to work from the public site too, you’ll need a HTTPS proxy endpoint.
  const COMMAND_BASE = (typeof MOODE_BASE_URL === 'string' && MOODE_BASE_URL)
    ? MOODE_BASE_URL
    : 'http://moode.local';

  const cmdUrl = (cmd) => `${COMMAND_BASE}/command/?cmd=${encodeURIComponent(cmd)}`;

  async function sendCmd(cmd) {
    try {
      // no-cors is fine for "fire and forget" commands
      await fetch(cmdUrl(cmd), { method: "GET", mode: "no-cors", cache: "no-store" });
    } catch (e) {
      console.warn("Command failed:", cmd, e);
    }
  }

  const PREV_TRIES = ["previous", "prev", "back"];
  async function sendPrev() {
    for (const c of PREV_TRIES) sendCmd(c);
  }

  function bind(id, fn) {
    const el = document.getElementById(id);
    if (!el) return false;

    // pointerdown is the most reliable on iOS + avoids ghost click weirdness
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }, { passive: false });

    return true;
  }

  function initControls() {
    const ok1 = bind("btn-play", () => {
      // Optional: optimistic icon flip (updateUI() will confirm on next poll)
      try {
        const d = (window.lastNowPlayingData || lastNowPlayingData || {});
        const s = String(d?.state || "").toLowerCase();
        const isPlaying = (s === "play" || s === "playing");
        if (typeof setPlayIcon === "function") setPlayIcon(!isPlaying);
      } catch {}

      sendCmd("toggle_play_pause");
    });

    const ok2 = bind("btn-next", () => sendCmd("next"));
    const ok3 = bind("btn-prev", () => sendPrev());

    if (!(ok1 && ok2 && ok3)) {
      console.warn("Phone controls: buttons not found at init time.", { ok1, ok2, ok3 });
    }

    // ✅ Initial icon state (uses same data source as UI; avoids CORS)
    try {
      const d = (window.lastNowPlayingData || lastNowPlayingData || {});
      const s = String(d?.state || "").toLowerCase();
      const isPlaying = (s === "play" || s === "playing");
      if (typeof setPlayIcon === "function") setPlayIcon(isPlaying);
    } catch {}
  }

  // ✅ Ensure buttons exist before binding
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initControls, { once: true });
  } else {
    initControls();
  }
})();