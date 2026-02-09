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

  async function apiSetCurrentRating(rating) {
    const url = API_BASE + '/rating/current';
    const headers = TRACK_KEY ? { 'x-track-key': TRACK_KEY } : {};
    return httpRequestJson('POST', url, {
      headers,
      bodyObj: { rating },
      timeoutMs: HTTP_TIMEOUT_MS,
    });
  }

  return { httpRequestJson, apiNowPlaying, apiQueueAdvance, apiMpdPrime, apiSetCurrentRating };
}

module.exports = { createApiClient };
