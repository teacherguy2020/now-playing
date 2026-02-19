'use strict';

/* =========================
 * Config
 * ========================= */

const Alexa = require('ask-sdk-core');
const config = require('./config');
const { createApiClient } = require('./lib/api');
const { createIntentHandlers } = require('./handlers/intents');
const { createAudioHandlers } = require('./handlers/audio');
const { createMiscHandlers } = require('./handlers/misc');
const {
  nowMs, safeStr, safeNum, safeNumFloat, decodeHtmlEntities, parseTokenB64, makeToken,
  absolutizeMaybe, getEventType, getAudioPlayerToken, getAudioOffsetMs, speak, sleep,
} = require('./lib/common');

const {
  VERSION, API_BASE, TRACK_KEY, PUBLIC_TRACK_BASE, ART_MODE,
  ADVANCE_GUARD_MS, ENQUEUE_GUARD_MS, PRIME_START_OFFSET_MS,
} = config;

const {
  apiNowPlaying,
  apiQueueAdvance,
  apiMpdPrime,
  apiSetCurrentRating,
  apiPlayArtist,
  apiSuggestArtistAlias,
  apiLogHeardArtist,
  apiPlayAlbum,
  apiSuggestAlbumAlias,
  apiLogHeardAlbum,
  apiPlayTrack,
  apiPlayPlaylist,
  apiSuggestPlaylistAlias,
  apiLogHeardPlaylist,
  apiMpdShuffle,
  apiPlayFile,
  apiVibeNowPlaying,
  apiVibeSeed,
  apiQueueWizardApply,
  apiGetWasPlaying,
  apiGetRuntimeConfig,
  apiSetWasPlaying,
  apiQueueMix,
  apiVibeStart,
  apiVibeSeedStart,
} = createApiClient(config);

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
    return PUBLIC_TRACK_BASE + '/art/current.jpg';
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

  const title = safeStr(track.title);
  const artist = safeStr(track.artist);
  const album = safeStr(track.album);

  // Token carries identity + lightweight metadata for launch announcements.
  const token = makeToken({
    file: file,
    songid: songid,
    pos0: pos0,
    title: title,
    artist: artist,
    album: album,
  });

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

  const title = safeStr(track.title);
  const artist = safeStr(track.artist);
  const album = safeStr(track.album);

  const token = makeToken({
    file: file,
    songid: songid,
    pos0: pos0,
    title: title,
    artist: artist,
    album: album,
  });

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
  if (!tok) return { advanced: false, nowPlaying: null, reason: 'missing-token' };

  if (recentlyAdvancedForToken(tok)) {
    return { advanced: false, nowPlaying: null, reason: 'recently-advanced' };
  }

  const parsed = parseTokenB64(tok);
  if (!parsed) return { advanced: false, nowPlaying: null, reason: 'bad-token' };

  const file = safeStr(parsed.file);
  const songid = safeNum(parsed.songid, null);
  const pos0 = safeNum(parsed.pos0, null);

  if (!file) return { advanced: false, nowPlaying: null, reason: 'missing-file' };
  if (songid === null && pos0 === null) return { advanced: false, nowPlaying: null, reason: 'missing-songid-pos0' };

  const resp = await apiQueueAdvance(songid, pos0, file);
  markAdvancedForToken(tok);
  return {
    advanced: true,
    nowPlaying: resp && resp.nowPlaying ? resp.nowPlaying : null,
    reason: 'advanced',
  };
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

/* =========================
 * Handlers - Intents
 * ========================= */


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
  function isTransient(s) {
    if (!s || !s.file) return true;
    const state = safeStr(s.state).toLowerCase();
    const duration = safeNum(s.duration, 0);
    const elapsed = safeNum(s.elapsed, 0);
    return (state === 'stop' || state === 'pause') && duration <= 0 && elapsed <= 0;
  }

  let snap = await getStableNowPlayingSnapshot();
  if (snap && snap.file && !isTransient(snap)) return snap;

  if (isTransient(snap)) {
    console.log(logPrefix, 'transient now-playing snapshot; retrying before prime');
    for (let i = 0; i < 4; i++) {
      await sleep(120);
      const retry = await getStableNowPlayingSnapshot();
      if (retry && retry.file && !isTransient(retry)) return retry;
      snap = retry;
    }
  }

  await primeIfAllowed(logPrefix);

  for (let i = 0; i < 3; i++) {
    await sleep(180);
    snap = await getStableNowPlayingSnapshot();
    if (snap && snap.file && !isTransient(snap)) return snap;
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

/* =========================
 * Skill builder
 * ========================= */

const {
  LaunchRequestHandler,
  NowPlayingIntentHandler,
  PauseIntentHandler,
  ResumeIntentHandler,
  NextIntentHandler,
  YesIntentHandler,
  NoIntentHandler,
  HelpIntentHandler,
  FallbackIntentHandler,
  PlayQueueIntentHandler,
  PlayAnythingIntentHandler,
  PlayHereIntentHandler,
  VibeThisSongIntentHandler,
  VibeThisSongHereIntentHandler,
  PlayArtistIntentHandler,
  PlayAlbumIntentHandler,
  PlayTrackIntentHandler,
  PlayPlaylistIntentHandler,
  PlayMixIntentHandler,
  ShuffleIntentHandler,
  RepeatIntentHandler,
  RateTrackIntentHandler,
  StopHandler,
  SessionEndedRequestHandler,
} = createIntentHandlers({
  safeStr,
  safeNumFloat,
  decodeHtmlEntities,
  parseTokenB64,
  makeToken,
  speak,
  getStableNowPlayingSnapshot,
  ensureCurrentTrack,
  buildPlayReplaceAll,
  buildPlayReplaceAllWithOffset,
  rememberIssuedStream,
  getLastPlayed: () => ({ token: lastPlayedToken, url: lastPlayedUrl, offsetMs: lastStoppedOffsetMs }),
  apiSetCurrentRating,
  apiPlayArtist,
  apiSuggestArtistAlias,
  apiLogHeardArtist,
  apiPlayAlbum,
  apiSuggestAlbumAlias,
  apiLogHeardAlbum,
  apiPlayTrack,
  apiPlayPlaylist,
  apiSuggestPlaylistAlias,
  apiLogHeardPlaylist,
  apiQueueMix,
  apiMpdShuffle,
  apiPlayFile,
  apiVibeNowPlaying,
  apiVibeStart,
  apiVibeSeed,
  apiVibeSeedStart,
  apiQueueWizardApply,
  apiGetWasPlaying,
  apiGetRuntimeConfig,
});

const { PlaybackControllerEventHandler, AudioPlayerEventHandler } = createAudioHandlers({
  API_BASE,
  safeStr,
  safeNum,
  decodeHtmlEntities,
  makeToken,
  absolutizeMaybe,
  getEventType,
  getAudioPlayerToken,
  getAudioOffsetMs,
  parseTokenB64,
  advanceFromTokenIfNeeded,
  rememberStop,
  rememberIssuedStream,
  setLastPlayedToken: (v) => { lastPlayedToken = v; },
  recentlyEnqueuedToken,
  markEnqueuedToken,
  enqueueAlreadyIssuedForPrevToken,
  ensureNowPlayingForEnqueue,
  getStableNowPlayingSnapshot,
  buildPlayEnqueue,
  buildPlayReplaceAll,
  apiSetWasPlaying,
  apiVibeNowPlaying,
  apiQueueWizardApply,
});

const { LogRequestInterceptor, SystemExceptionHandler, ErrorHandler } = createMiscHandlers({ VERSION });

const skillHandler = Alexa.SkillBuilders.custom()
  .addRequestInterceptors(LogRequestInterceptor)
  .addRequestHandlers(
    // Launch
    LaunchRequestHandler,

    // Intents
    NowPlayingIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    PlayQueueIntentHandler,
    PlayAnythingIntentHandler,
    PlayHereIntentHandler,
    VibeThisSongIntentHandler,
    VibeThisSongHereIntentHandler,
    PlayArtistIntentHandler,
    PlayAlbumIntentHandler,
    PlayTrackIntentHandler,
    PlayPlaylistIntentHandler,
    PlayMixIntentHandler,
    ShuffleIntentHandler,
    RepeatIntentHandler,
    RateTrackIntentHandler,
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

exports.handler = skillHandler;