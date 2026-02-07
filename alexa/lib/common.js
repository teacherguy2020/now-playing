'use strict';

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

function absolutizeMaybe(urlStr, apiBase) {
  const s = safeStr(urlStr);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return apiBase + s;
  return apiBase + '/' + s;
}

function getEventType(handlerInput) {
  const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
  return req && req.type ? String(req.type) : '';
}

function getAudioPlayerToken(handlerInput) {
  const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
  if (req && req.token) return String(req.token);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  nowMs,
  safeStr,
  safeNum,
  safeNumFloat,
  decodeHtmlEntities,
  parseTokenB64,
  makeToken,
  absolutizeMaybe,
  getEventType,
  getAudioPlayerToken,
  getAudioOffsetMs,
  speak,
  sleep,
};
