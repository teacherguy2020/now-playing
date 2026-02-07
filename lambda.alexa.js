'use strict';

/* =========================
 * Config
 * ========================= */

const Alexa = require('ask-sdk-core');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const VERSION = 2; // bump when you deploy

// NOTE: your env var is API_BASE (not MOODE_API_BASE)
const API_BASE = String(process.env.API_BASE || 'https://moode.brianwis.com').replace(/\/+$/, '');
const TRACK_KEY = String(process.env.TRACK_KEY || '1029384756').trim();
const PUBLIC_TRACK_BASE = String(process.env.PUBLIC_TRACK_BASE || API_BASE).replace(/\/+$/, ''); // usually same as API_BASE

// Art routing (keep flexible; don't hard-code assumptions)
const ART_MODE = String(process.env.ART_MODE || 'track').trim().toLowerCase();
// ART_MODE:
//   "track"   => /art/track_640.jpg?file=... (recommended; per-track; no race with queue advance)
//   "current" => /art/current_320.jpg (timing-sensitive; only use if you want "current" behavior)

// Tuneables
const HTTP_TIMEOUT_MS = 6000;

// Dedupe / idempotency windows
const ADVANCE_GUARD_MS = 8000;       // avoid double-advancing same token
const ENQUEUE_GUARD_MS = 5000;       // avoid duplicate ENQUEUE spam
const PRIME_START_OFFSET_MS = 0;     // no resume yet

/* =========================
 * Small utils
 * ========================= */

function nowMs() { return Date.now(); }

function safeStr(x) {
  return String(x === undefined || x === null ? '' : x).trim();
}

function safeNum(x, fallback) {
  const n = Number.parseInt(String(x === undefined || x === null ? '' : x).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeNumFloat(x, fallback) {
  const n = Number(String(x === undefined || x === null ? '' : x).trim());
  return Number.isFinite(n) ? n : fallback;
}

function decodeHtmlEntities(str) {
  const s = safeStr(str);
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function b64ToJson(b64) {
  try {
    const txt = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function parseTokenB64(token) {
  // token format: "moode-track:<base64json>"
  const s = safeStr(token);
  const i = s.indexOf(':');
  if (i < 0) return null;
  const b64 = s.slice(i + 1);
  const obj = b64ToJson(b64);
  return obj && typeof obj === 'object' ? obj : null;
}

function makeToken(obj) {
  const payload = JSON.stringify(obj || {});
  const b64 = Buffer.from(payload, 'utf8').toString('base64');
  return 'moode-track:' + b64;
}

function absolutizeMaybe(urlStr) {
  const s = safeStr(urlStr);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return API_BASE + s;
  return API_BASE + '/' + s;
}

function getEventType(handlerInput) {
  const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
  return req && req.type ? String(req.type) : '';
}

function getAudioPlayerToken(handlerInput) {
  const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
  // AudioPlayer events usually put token here
  if (req && req.token) return String(req.token);
  // Some paths might keep it in context
  try {
    const t = handlerInput.requestEnvelope.context.AudioPlayer.token;
    return t ? String(t) : '';
  } catch (e) {
    return '';
  }
}

function getAudioOffsetMs(handlerInput) {
  try {
    const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
    const v = req && req.offsetInMilliseconds;
    if (v === undefined || v === null) return null;
    const n = safeNumFloat(v, null);
    return (n === null || n < 0) ? null : Math.floor(n);
  } catch (e) {
    return null;
  }
}

function speak(handlerInput, text, shouldEnd) {
  const end = !!shouldEnd;
  return handlerInput.responseBuilder
    .speak(text)
    .withShouldEndSession(end)
    .getResponse();
}

/* =========================
 * HTTPS helper
 * ========================= */

function httpRequestJson(method, urlStr, opts) {
  opts = opts || {};
  const headers = opts.headers || {};
  const bodyObj = opts.bodyObj || null;
  const timeoutMs = opts.timeoutMs || HTTP_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;

    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: method,
        headers: Object.assign(
          { 'Accept': 'application/json' },
          body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {},
          headers
        ),
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const status = res.statusCode || 0;
          const ok = status >= 200 && status < 300;

          if (!ok) {
            return reject(new Error(
              'HTTP ' + status + ' ' + method + ' ' + urlStr + ': ' + String(data).slice(0, 200)
            ));
          }

          const t = String(data || '').trim();
          if (!t) return resolve(null);

          try {
            resolve(JSON.parse(t));
          } catch (e) {
            reject(new Error(
              'Bad JSON from ' + urlStr + ': ' + e.message + '. Body: ' + t.slice(0, 200)
            ));
          }
        });
      }
    );

    req.on('timeout', () => {
      try { req.destroy(new Error('timeout')); } catch (e) {}
    });

    req.on('error', (err) => reject(err));

    if (body) req.write(body);
    req.end();
  });
}

/* =========================
 * API calls
 * ========================= */

async function apiNowPlaying() {
  const url = API_BASE + '/now-playing';
  return httpRequestJson('GET', url, { timeoutMs: HTTP_TIMEOUT_MS });
}

// IMPORTANT: server prefers songid now; keep pos0 as fallback.
async function apiQueueAdvance(songid, pos0, file) {
  const url = API_BASE + '/queue/advance';
  const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
  return httpRequestJson('POST', url, {
    headers: headers,
    bodyObj: { songid: songid, pos0: pos0, file: file },
    timeoutMs: HTTP_TIMEOUT_MS,
  });
}

/* =========================
 * Alexa helpers
 * ========================= */

function buildArtSources(artUrl) {
  if (!artUrl) return undefined;

  // Be honest about sizes; your art endpoint is 640, but devices accept multiple sources anyway.
  return {
    sources: [
      { url: artUrl, widthPixels: 640, heightPixels: 640 },
      { url: artUrl, widthPixels: 320, heightPixels: 320 },
    ],
  };
}

function artUrlForFile(file) {
  if (ART_MODE === 'current') {
    return PUBLIC_TRACK_BASE + '/art/current_320.jpg';
  }
  // default: per-track (recommended)
  return (
    PUBLIC_TRACK_BASE +
    '/art/track_640.jpg?file=' + encodeURIComponent(file) +
    (TRACK_KEY ? '&k=' + encodeURIComponent(TRACK_KEY) : '')
  );
}

function trackStreamUrl(file) {
  return (
    PUBLIC_TRACK_BASE +
    '/track?file=' + encodeURIComponent(file) +
    (TRACK_KEY ? '&k=' + encodeURIComponent(TRACK_KEY) : '')
  );
}

function buildPlayReplaceAll(track, spokenTitle) {
  const file = safeStr(track.file);
  const pos0 = safeNum(track.songpos, 0);
  const songid = safeNum(track.songid, null);

  // Token now carries songid (preferred) + pos0 fallback + file sanity.
  const token = makeToken({ file: file, songid: songid, pos0: pos0 });

  const title = safeStr(track.title);
  const artist = safeStr(track.artist);
  const album = safeStr(track.album);

  const artUrl = artUrlForFile(file);
  const url = trackStreamUrl(file);

  return {
    type: 'AudioPlayer.Play',
    playBehavior: 'REPLACE_ALL',
    audioItem: {
      stream: {
        token: token,
        url: url,
        offsetInMilliseconds: PRIME_START_OFFSET_MS,
      },
      metadata: {
        title: title || spokenTitle || 'Now playing',
        subtitle: (artist ? artist : '') + (album ? ' -- ' + album : ''),
        art: buildArtSources(artUrl),
        backgroundImage: buildArtSources(artUrl),
      },
    },
  };
}

function buildPlayReplaceAllWithOffset(token, url, offsetMs) {
  const tok = safeStr(token);
  const u = safeStr(url);
  const off = safeNumFloat(offsetMs, 0);
  return {
    type: 'AudioPlayer.Play',
    playBehavior: 'REPLACE_ALL',
    audioItem: {
      stream: {
        token: tok,
        url: u,
        offsetInMilliseconds: (Number.isFinite(off) && off > 0) ? Math.floor(off) : 0,
      },
    },
  };
}

function buildPlayEnqueue(track, expectedPreviousToken) {
  const file = safeStr(track.file);
  const pos0 = safeNum(track.songpos, null);
  const songid = safeNum(track.songid, null);

  if (!file || pos0 === null) return null;

  const token = makeToken({ file: file, songid: songid, pos0: pos0 });

  const title = safeStr(track.title);
  const artist = safeStr(track.artist);
  const album = safeStr(track.album);

  const artUrl = artUrlForFile(file);
  const url = trackStreamUrl(file);

  return {
    type: 'AudioPlayer.Play',
    playBehavior: 'ENQUEUE',
    audioItem: {
      stream: {
        token: token,
        url: url,
        offsetInMilliseconds: 0,
        expectedPreviousToken: expectedPreviousToken || undefined,
      },
      metadata: {
        title: title || 'Up next',
        subtitle: (artist ? artist : '') + (album ? ' -- ' + album : ''),
        art: buildArtSources(artUrl),
        backgroundImage: buildArtSources(artUrl),
      },
    },
    expectedPreviousToken: expectedPreviousToken || undefined,
  };
}

/* =========================
 * Stable snapshot (double fetch)
 * ========================= */

async function getStableNowPlayingSnapshot() {
  const a = await apiNowPlaying();
  const b = await apiNowPlaying();

  const pick = b || a;
  if (!pick || !pick.file) return null;

  pick.songpos = safeStr(pick.songpos); // moode returns string sometimes
  pick.songid = safeStr(pick.songid);   // keep consistent
  return pick;
}

/* =========================
 * Queue advance idempotency
 * ========================= */

let lastAdvancedToken = '';
let lastAdvancedAt = 0;

let lastEnqueuedToken = '';
let lastEnqueueAt = 0;

let lastEnqueuePrevToken = '';
let lastEnqueuePrevAt = 0;

function recentlyAdvancedForToken(token) {
  const t = safeStr(token);
  if (!t) return false;
  if (t !== lastAdvancedToken) return false;
  return (nowMs() - lastAdvancedAt) < ADVANCE_GUARD_MS;
}

function markAdvancedForToken(token) {
  lastAdvancedToken = safeStr(token);
  lastAdvancedAt = nowMs();
}

function recentlyEnqueuedToken(token) {
  const t = safeStr(token);
  if (!t) return false;
  if (t !== lastEnqueuedToken) return false;
  return (nowMs() - lastEnqueueAt) < ENQUEUE_GUARD_MS;
}

function markEnqueuedToken(token, prevToken) {
  lastEnqueuedToken = safeStr(token);
  lastEnqueueAt = nowMs();
  lastEnqueuePrevToken = safeStr(prevToken);
  lastEnqueuePrevAt = nowMs();
}

function enqueueAlreadyIssuedForPrevToken(prevToken) {
  const p = safeStr(prevToken);
  if (!p) return false;
  if (p !== lastEnqueuePrevToken) return false;
  return (nowMs() - lastEnqueuePrevAt) < (ADVANCE_GUARD_MS + 2000);
}

async function advanceFromTokenIfNeeded(token) {
  const tok = safeStr(token);
  if (!tok) return false;

  if (recentlyAdvancedForToken(tok)) return false;

  const parsed = parseTokenB64(tok);
  if (!parsed) return false;

  const file = safeStr(parsed.file);
  const songid = safeNum(parsed.songid, null);
  const pos0 = safeNum(parsed.pos0, null);

  if (!file) return false;
  if (songid === null && pos0 === null) return false;

  await apiQueueAdvance(songid, pos0, file);
  markAdvancedForToken(tok);
  return true;
}

/* =========================
 * Playback memory (resume offset)
 * ========================= */

let lastPlayedToken = '';
let lastPlayedUrl = '';
let lastStoppedOffsetMs = 0;
let lastStoppedAt = 0;

function rememberIssuedStream(token, url, offsetMs) {
  lastPlayedToken = safeStr(token);
  lastPlayedUrl = safeStr(url);
  lastStoppedOffsetMs = safeNumFloat(offsetMs, 0) || 0;
  lastStoppedAt = nowMs();
}

function rememberStop(token, offsetMs) {
  const tok = safeStr(token);
  const off = safeNumFloat(offsetMs, null);
  if (tok) lastPlayedToken = tok;
  if (off !== null) {
    lastStoppedOffsetMs = Math.max(0, Math.floor(off));
    lastStoppedAt = nowMs();
  }
}

/* =========================
 * Logging interceptor
 * ========================= */

const LogRequestInterceptor = {
  process(handlerInput) {
    try {
      const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
      const t = req && req.type ? req.type : 'unknown';

      console.log('INCOMING request.type:', t);
      console.log('VERSION:', VERSION);

      if (t === 'IntentRequest') {
        const intentName = req && req.intent && req.intent.name ? req.intent.name : 'unknown';
        const slots = req && req.intent && req.intent.slots ? req.intent.slots : null;
        console.log('INCOMING intent.name:', intentName);
        if (slots) console.log('INCOMING intent.slots:', JSON.stringify(slots));
      }
    } catch (e) {
      console.log('LogRequestInterceptor failed:', e && e.message ? e.message : String(e));
    }
  },
};

/* =========================
 * Handlers - Intents
 * ========================= */

// Helper: short sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Helper: prime MPD via your API
async function apiMpdPrime() {
  const url = API_BASE + '/mpd/prime';
  const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
  return httpRequestJson('POST', url, {
    headers,
    bodyObj: {},            // keep it explicit
    timeoutMs: HTTP_TIMEOUT_MS,
  });
}

// --- Prime guard (avoid hammering MPD if Amazon fires bursts) ---
const PRIME_GUARD_MS = 4000;
let lastPrimeAt = 0;

function recentlyPrimed() {
  return (nowMs() - lastPrimeAt) < PRIME_GUARD_MS;
}

async function primeIfAllowed(logPrefix) {
  if (recentlyPrimed()) {
    console.log(logPrefix, 'prime suppressed (recent)');
    return false;
  }

  try {
    console.log(logPrefix, 'priming MPD via /mpd/prime ...');
    await apiMpdPrime();
    lastPrimeAt = nowMs();
    return true;
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    console.log(logPrefix, 'prime failed:', msg);
    return false;
  }
}

/**
 * ENQUEUE-safe “ensure we have a next track”
 * - First: stable snapshot
 * - If empty: prime + a couple retries
 */
async function ensureNowPlayingForEnqueue(logPrefix) {
  let snap = await getStableNowPlayingSnapshot();
  if (snap && snap.file) return snap;

  await primeIfAllowed(logPrefix);

  for (let i = 0; i < 3; i++) {
    await sleep(250);
    snap = await getStableNowPlayingSnapshot();
    if (snap && snap.file) return snap;
  }
  return null;
}

// Helper: ensure we have a "current" track
async function ensureCurrentTrack() {
  // First attempt
  let snap = await getStableNowPlayingSnapshot();
  if (snap && snap.file) return snap;

  console.log('Launch: no current track; priming MPD...');
  await primeIfAllowed('Launch:');

  // Give moOde/worker a moment, then retry a few times
  for (let i = 0; i < 3; i++) {
    await sleep(250);
    snap = await getStableNowPlayingSnapshot();
    if (snap && snap.file) return snap;
  }

  return null;
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },

  async handle(handlerInput) {
    try {
      const snap = await ensureCurrentTrack();

      if (!snap || !snap.file) {
        console.log('Launch: still no current track after prime');
        return speak(handlerInput, 'I cannot find anything to play right now.', true);
      }

      const directive = buildPlayReplaceAll(snap, 'Starting playback');

      // Remember what we issued for resume
      try {
        const issuedToken = directive.audioItem.stream.token;
        const issuedUrl = directive.audioItem.stream.url;
        rememberIssuedStream(issuedToken, issuedUrl, 0);
      } catch (e) {}

      // IMPORTANT: still do NOT advance here.
      // PlaybackStarted(offset==0) will advance.
      return handlerInput.responseBuilder
        .speak('Starting your queue.')
        .withShouldEndSession(true)
        .addDirective(directive)
        .getResponse();

    } catch (e) {
      console.log('Launch error:', e && e.message ? e.message : String(e));
      return speak(handlerInput, 'Please check your skill code.', true);
    }
  },
};

const NowPlayingIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NowPlayingIntent';
  },
  async handle(handlerInput) {
    try {
      const snap = await getStableNowPlayingSnapshot();
      if (!snap || !snap.title) {
        return speak(handlerInput, 'I cannot determine what is playing right now.', false);
      }

      const title = decodeHtmlEntities(snap.title || '');
      const artist = decodeHtmlEntities(snap.artist || '');
      const album = decodeHtmlEntities(snap.album || '');

      let speech = 'This is ' + title + '.';
      if (artist) speech += ' By ' + artist + '.';
      if (album) speech += ' From ' + album + '.';

      return speak(handlerInput, speech, false);
    } catch (e) {
      console.log('NowPlayingIntent error:', e && e.message ? e.message : String(e));
      return speak(handlerInput, 'Sorry, I could not fetch what is playing.', false);
    }
  },
};

const PauseIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PauseIntent';
  },
  handle(handlerInput) {
    // We rely on the subsequent AudioPlayer.PlaybackStopped event to capture offset.
    return handlerInput.responseBuilder
      .speak('Paused.')
      .withShouldEndSession(true)
      .addDirective({ type: 'AudioPlayer.Stop' })
      .getResponse();
  },
};

const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent';
  },
  async handle(handlerInput) {
    try {
      const tok = safeStr(lastPlayedToken);
      const url = safeStr(lastPlayedUrl);
      const off = safeNumFloat(lastStoppedOffsetMs, 0);

      // If we have a saved token+url, do a true resume without touching MPD queue.
      if (tok && url) {
        const directive = buildPlayReplaceAllWithOffset(tok, url, off);

        console.log('Resume: using saved token prefix:', tok.slice(0, 160), 'offsetMs=', Math.floor(off || 0));

        rememberIssuedStream(tok, url, off);

        return handlerInput.responseBuilder
          .speak('Resuming.')
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      }

      // Fallback: no saved resume state => treat like "start playing"
      const snap = await getStableNowPlayingSnapshot();
      if (!snap || !snap.file) {
        return speak(handlerInput, 'I cannot resume right now.', false);
      }

      const directive2 = buildPlayReplaceAll(snap, 'Resuming playback');
      rememberIssuedStream(directive2.audioItem.stream.token, directive2.audioItem.stream.url, 0);

      // IMPORTANT: Do NOT advance here; PlaybackStarted(offset==0) will do it.
      return handlerInput.responseBuilder
        .speak('Resuming.')
        .withShouldEndSession(true)
        .addDirective(directive2)
        .getResponse();
    } catch (e) {
      console.log('ResumeIntent error:', e && e.message ? e.message : String(e));
      return speak(handlerInput, 'I cannot resume right now.', false);
    }
  },
};

const NextIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent';
  },
  async handle(handlerInput) {
    try {
      const snap = await getStableNowPlayingSnapshot();
      if (!snap || !snap.file) {
        return speak(handlerInput, 'I cannot skip right now.', false);
      }

      const directive = buildPlayReplaceAll(snap, 'Skipping');
      rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);

      // IMPORTANT: Do NOT advance here; PlaybackStarted(offset==0) will do it.
      return handlerInput.responseBuilder
        .speak('Skipping.')
        .withShouldEndSession(true)
        .addDirective(directive)
        .getResponse();
    } catch (e) {
      console.log('NextIntent error:', e && e.message ? e.message : String(e));
      return speak(handlerInput, 'I cannot skip right now.', false);
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return speak(handlerInput, 'You can say: what’s playing, pause, resume, or next.', false);
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return speak(handlerInput, 'Sorry, I did not understand. Try: what’s playing.', false);
  },
};

const StopHandler = {
  canHandle(handlerInput) {
    const t = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (t !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .addDirective({ type: 'AudioPlayer.Stop' })
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('SessionEndedRequest');
    return handlerInput.responseBuilder.getResponse();
  },
};

/* =========================
 * PlaybackController (buttons)
 * ========================= */

const PlaybackControllerEventHandler = {
  canHandle(handlerInput) {
    const t = Alexa.getRequestType(handlerInput.requestEnvelope);
    return t === 'PlaybackController.NextCommandIssued'
      || t === 'PlaybackController.PreviousCommandIssued'
      || t === 'PlaybackController.PlayCommandIssued'
      || t === 'PlaybackController.PauseCommandIssued';
  },
  handle(handlerInput) {
    // Let AudioPlayer events drive queue; voice intents handle pause/resume/next.
    return handlerInput.responseBuilder.getResponse();
  },
};

/* =========================
 * AudioPlayer events
 * ========================= */

const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    const t = Alexa.getRequestType(handlerInput.requestEnvelope);
    return t && String(t).startsWith('AudioPlayer.');
  },

  async handle(handlerInput) {
    const eventType = getEventType(handlerInput);
    const token = getAudioPlayerToken(handlerInput);

    // Capture offset for resume
    if (eventType === 'AudioPlayer.PlaybackStopped') {
      try {
        const off = getAudioOffsetMs(handlerInput);
        console.log('AudioPlayer event:', eventType);
        console.log('PlaybackStopped: token prefix:', safeStr(token).slice(0, 160), 'offsetMs=', off);

        rememberStop(token, off);
      } catch (e) {
        console.log('PlaybackStopped handler failed:', e && e.message ? e.message : String(e));
      }
      return handlerInput.responseBuilder.getResponse();
    }

    // 1) PlaybackStarted => advance MPD ONLY for true "start at 0" (not resume)
    if (eventType === 'AudioPlayer.PlaybackStarted') {
      try {
        console.log('AudioPlayer event:', eventType);

        const startOff = getAudioOffsetMs(handlerInput);
        console.log(
          'PlaybackStarted: token prefix:',
          safeStr(token).slice(0, 160),
          'offsetMs=',
          startOff
        );

        if (safeStr(token)) lastPlayedToken = safeStr(token);

        // If offset > 0, this is a resume/seek. Do NOT pop+prime MPD.
        if (Number.isFinite(startOff) && startOff > 0) {
          console.log('PlaybackStarted: non-zero offset; skipping advance');
          return handlerInput.responseBuilder.getResponse();
        }

        try {
          const advanced = await advanceFromTokenIfNeeded(token);
          if (advanced) console.log('PlaybackStarted: advanced queue for this token');
        } catch (e) {
          console.log('PlaybackStarted: advance failed:', e && e.message ? e.message : String(e));
        }

        return handlerInput.responseBuilder.getResponse();
      } catch (e) {
        console.log('PlaybackStarted handler failed:', e && e.message ? e.message : String(e));
        return handlerInput.responseBuilder.getResponse();
      }
    }

    // 2) PlaybackNearlyFinished => ENQUEUE next based on /now-playing (after prior advance)
    if (eventType === 'AudioPlayer.PlaybackNearlyFinished') {
      try {
        console.log('AudioPlayer event:', eventType);
        const finishedToken = safeStr(token);

        if (!finishedToken) {
          console.log('NearlyFinished: missing finishedToken; cannot ENQUEUE');
          return handlerInput.responseBuilder.getResponse();
        }

        console.log('NearlyFinished: token prefix:', finishedToken.slice(0, 160));

        const snap = await ensureNowPlayingForEnqueue('NearlyFinished:');
        console.log('NearlyFinished: /now-playing snapshot:', snap ? JSON.stringify(snap, null, 2) : null);

        if (!snap || !snap.file) {
          console.log('NearlyFinished: no next from /now-playing; skipping ENQUEUE');
          return handlerInput.responseBuilder.getResponse();
        }

        const nextFile = safeStr(snap.file);
        const nextPos0 = safeNum(snap.songpos, null);
        const nextSongId = safeNum(snap.songid, null);

        if (!nextFile || nextPos0 === null) {
          console.log('NearlyFinished: still no next after prime; skipping ENQUEUE');
          return handlerInput.responseBuilder.getResponse();
        }

        const candidateToken = makeToken({ file: nextFile, songid: nextSongId, pos0: nextPos0 });

        // Dedup ENQUEUE
        if (recentlyEnqueuedToken(candidateToken)) {
          console.log('NearlyFinished: skip duplicate enqueue token');
          return handlerInput.responseBuilder.getResponse();
        }

        const enq = buildPlayEnqueue(
          {
            file: nextFile,
            songpos: String(nextPos0),
            songid: (nextSongId !== null ? String(nextSongId) : ''),
            title: decodeHtmlEntities(snap.title || ''),
            artist: decodeHtmlEntities(snap.artist || ''),
            album: decodeHtmlEntities(snap.album || ''),
            albumArtUrl: absolutizeMaybe(snap.albumArtUrl || ''),
            altArtUrl: absolutizeMaybe(snap.altArtUrl || ''),
          },
          finishedToken
        );

        if (!enq) {
          console.log('NearlyFinished: could not build ENQUEUE directive');
          return handlerInput.responseBuilder.getResponse();
        }

        // Remember what we are about to enqueue (useful if user pauses quickly during the next track)
        try {
          const enqToken = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.token : '';
          const enqUrl = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.url : '';
          if (enqToken && enqUrl) {
            rememberIssuedStream(enqToken, enqUrl, 0);
          }
        } catch (e) {}

        // After ENQUEUE, advance MPD head for that enqueued token so /now-playing becomes the NEXT next.
        // This is OK because:
        //  - the ENQUEUED track's artwork is per-track (ART_MODE=track), not "current"
        //  - advancing here preserves continuous playback planning
        try {
          await advanceFromTokenIfNeeded(candidateToken);
          console.log('NearlyFinished: advanced MPD head for enqueued track pos0=', nextPos0, 'songid=', nextSongId);
        } catch (e) {
          console.log('NearlyFinished: advance after enqueue failed:', e && e.message ? e.message : String(e));
        }

        markEnqueuedToken(candidateToken, finishedToken);

        console.log('NearlyFinished: ENQUEUE next:', nextFile, 'pos0=', nextPos0, 'songid=', nextSongId);
        console.log('NearlyFinished: enqueue directive:', JSON.stringify(enq, null, 2));

        return handlerInput.responseBuilder
          .addDirective(enq)
          .getResponse();

      } catch (e) {
        console.log('NearlyFinished handler failed:', e && e.message ? e.message : String(e));
        return handlerInput.responseBuilder.getResponse();
      }
    }

    // 3) PlaybackFinished => do nothing if we already enqueued for this finished token
    if (eventType === 'AudioPlayer.PlaybackFinished') {
      try {
        console.log('AudioPlayer event:', eventType);

        if (enqueueAlreadyIssuedForPrevToken(token)) {
          console.log('PlaybackFinished: enqueue already issued; no action');
          return handlerInput.responseBuilder.getResponse();
        }

        console.log('PlaybackFinished: fallback continue (REPLACE_ALL)');
        const snap = await getStableNowPlayingSnapshot();
        if (!snap || !snap.file) return handlerInput.responseBuilder.getResponse();

        const directive = buildPlayReplaceAll(snap, 'Continuing playback');
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);

        // IMPORTANT: Do NOT advance here; PlaybackStarted(offset==0) will do it.

        return handlerInput.responseBuilder
          .addDirective(directive)
          .getResponse();

      } catch (e) {
        console.log('PlaybackFinished handler failed:', e && e.message ? e.message : String(e));
        return handlerInput.responseBuilder.getResponse();
      }
    }

    // Ignore other AudioPlayer.* events (Paused/Resumed/etc)
    return handlerInput.responseBuilder.getResponse();
  },
};

/* =========================
 * System.ExceptionEncountered
 * ========================= */

const SystemExceptionHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'System.ExceptionEncountered';
  },
  handle(handlerInput) {
    console.log('System.ExceptionEncountered');
    return handlerInput.responseBuilder.getResponse();
  },
};

/* =========================
 * Skill builder
 * ========================= */

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.log('ErrorHandler:', error && error.message ? error.message : String(error));
    return handlerInput.responseBuilder.getResponse();
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestInterceptors(LogRequestInterceptor)
  .addRequestHandlers(
    // Launch
    LaunchRequestHandler,

    // Intents
    NowPlayingIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    StopHandler,
    SessionEndedRequestHandler,

    // Buttons + AudioPlayer lifecycle
    PlaybackControllerEventHandler,
    AudioPlayerEventHandler,

    // System
    SystemExceptionHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();