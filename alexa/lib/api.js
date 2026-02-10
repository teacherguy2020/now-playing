'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

function createApiClient(config) {
  const { API_BASE, TRACK_KEY, HTTP_TIMEOUT_MS } = config;

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
          method,
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

  async function apiNowPlaying() {
    const url = API_BASE + '/now-playing';
    return httpRequestJson('GET', url, { timeoutMs: HTTP_TIMEOUT_MS });
  }

  async function apiQueueAdvance(songid, pos0, file) {
    const url = API_BASE + '/queue/advance';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { songid, pos0, file },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiMpdPrime() {
    const url = API_BASE + '/mpd/prime';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: {},
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiQueueMix(artists, opts) {
    const url = API_BASE + '/queue/mix';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: Object.assign({ artists }, opts || {}),
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiSetCurrentRating(rating) {
    const url = API_BASE + '/rating/current';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { rating },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiPlayArtist(artist) {
    const url = API_BASE + '/mpd/play-artist';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { artist },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiSuggestArtistAlias(artist, source) {
    const url = API_BASE + '/mpd/artist-alias-suggestion';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { artist, source: source || 'alexa' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiLogHeardArtist(artist, source, status) {
    const url = API_BASE + '/mpd/alexa-heard-artist';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { artist, source: source || 'alexa', status: status || 'attempt' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiPlayAlbum(album) {
    const url = API_BASE + '/mpd/play-album';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { album },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiSuggestAlbumAlias(album, source) {
    const url = API_BASE + '/mpd/album-alias-suggestion';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { album, source: source || 'alexa' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiLogHeardAlbum(album, source, status, resolvedTo) {
    const url = API_BASE + '/mpd/alexa-heard-album';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { album, source: source || 'alexa', status: status || 'attempt', resolvedTo: resolvedTo || '' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiPlayTrack(track) {
    const url = API_BASE + '/mpd/play-track';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { track },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiPlayPlaylist(playlist) {
    const url = API_BASE + '/mpd/play-playlist';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { playlist },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiSuggestPlaylistAlias(playlist, source) {
    const url = API_BASE + '/mpd/playlist-alias-suggestion';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { playlist, source: source || 'alexa' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiLogHeardPlaylist(playlist, source, status, resolvedTo) {
    const url = API_BASE + '/mpd/alexa-heard-playlist';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { playlist, source: source || 'alexa', status: status || 'attempt', resolvedTo: resolvedTo || '' },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiMpdShuffle() {
    const url = API_BASE + '/mpd/shuffle';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: {},
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  async function apiGetWasPlaying() {
    const url = API_BASE + '/alexa/was-playing';
    return httpRequestJson('GET', url, { timeoutMs: HTTP_TIMEOUT_MS });
  }

  async function apiGetRuntimeConfig() {
    const url = API_BASE + '/config/runtime';
    return httpRequestJson('GET', url, { timeoutMs: HTTP_TIMEOUT_MS });
  }

  async function apiSetWasPlaying(payload) {
    const url = API_BASE + '/alexa/was-playing';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: payload || {},
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  return {
    httpRequestJson,
    apiNowPlaying,
    apiQueueAdvance,
    apiMpdPrime,
    apiQueueMix,
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
    apiGetWasPlaying,
    apiGetRuntimeConfig,
    apiSetWasPlaying,
  };
}

module.exports = { createApiClient };
