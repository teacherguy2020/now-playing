'use strict';

const API_BASE = String(process.env.API_BASE || 'https://moode.brianwis.com').replace(/\/+$/, '');

module.exports = {
  VERSION: 2,
  API_BASE,
  TRACK_KEY: String(process.env.TRACK_KEY || '1029384756').trim(),
  PUBLIC_TRACK_BASE: String(process.env.PUBLIC_TRACK_BASE || API_BASE).replace(/\/+$/, ''),
  ART_MODE: String(process.env.ART_MODE || 'track').trim().toLowerCase(),
  HTTP_TIMEOUT_MS: 6000,
  ADVANCE_GUARD_MS: 8000,
  ENQUEUE_GUARD_MS: 5000,
  PRIME_START_OFFSET_MS: 0,
};
