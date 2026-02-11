import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

function pickPublicConfig(cfg) {
  const c = cfg || {};
  const n = c.notifications || {};
  const tn = n.trackNotify || {};
  const po = n.pushover || {};

  return {
    projectName: c.projectName || 'now-playing',
    trackKey: String(process.env.TRACK_KEY || '1029384756'),
    environment: c.environment || 'home',
    timezone: c.timezone || 'America/Chicago',
    ports: c.ports || { api: 3101, ui: 8101 },
    alexa: {
      enabled: Boolean(c.alexa?.enabled ?? true),
      publicDomain: String(c.alexa?.publicDomain || ''),
      skillId: String(c.alexa?.skillId || ''),
      webhookPath: String(c.alexa?.webhookPath || '/alexa'),
      artistAliases: c.alexa?.artistAliases || {},
      albumAliases: c.alexa?.albumAliases || {},
      playlistAliases: c.alexa?.playlistAliases || {},
      unresolvedArtists: Array.isArray(c.alexa?.unresolvedArtists) ? c.alexa.unresolvedArtists : [],
      heardArtists: Array.isArray(c.alexa?.heardArtists) ? c.alexa.heardArtists : [],
      unresolvedAlbums: Array.isArray(c.alexa?.unresolvedAlbums) ? c.alexa.unresolvedAlbums : [],
      heardAlbums: Array.isArray(c.alexa?.heardAlbums) ? c.alexa.heardAlbums : [],
      unresolvedPlaylists: Array.isArray(c.alexa?.unresolvedPlaylists) ? c.alexa.unresolvedPlaylists : [],
      heardPlaylists: Array.isArray(c.alexa?.heardPlaylists) ? c.alexa.heardPlaylists : [],
    },
    notifications: {
      trackNotify: {
        enabled: !!tn.enabled,
        pollMs: Number(tn.pollMs || 3000),
        dedupeMs: Number(tn.dedupeMs || 15000),
        alexaMaxAgeMs: Number(tn.alexaMaxAgeMs || 21600000),
      },
      pushover: {
        token: String(po.token || ''),
        userKey: String(po.userKey || ''),
      },
    },
    paths: c.paths || {},
    features: {
      podcasts: Boolean(c.features?.podcasts ?? true),
      ratings: Boolean(c.features?.ratings ?? true),
      radio: Boolean(c.features?.radio ?? true),
    },
  };
}

function withEnvOverrides(cfg) {
  const out = pickPublicConfig(cfg);

  if (process.env.TRACK_NOTIFY_ENABLED != null) {
    out.notifications.trackNotify.enabled = /^(1|true|yes|on)$/i.test(String(process.env.TRACK_NOTIFY_ENABLED));
  }
  if (process.env.TRACK_NOTIFY_POLL_MS) out.notifications.trackNotify.pollMs = Number(process.env.TRACK_NOTIFY_POLL_MS) || out.notifications.trackNotify.pollMs;
  if (process.env.TRACK_NOTIFY_DEDUPE_MS) out.notifications.trackNotify.dedupeMs = Number(process.env.TRACK_NOTIFY_DEDUPE_MS) || out.notifications.trackNotify.dedupeMs;
  if (process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) out.notifications.trackNotify.alexaMaxAgeMs = Number(process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS) || out.notifications.trackNotify.alexaMaxAgeMs;

  if (process.env.PUSHOVER_TOKEN) out.notifications.pushover.token = String(process.env.PUSHOVER_TOKEN);
  if (process.env.PUSHOVER_USER_KEY) out.notifications.pushover.userKey = String(process.env.PUSHOVER_USER_KEY);

  return out;
}

function validateConfigShape(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') errors.push('config must be an object');
  if (!cfg.ports || typeof cfg.ports.api !== 'number' || typeof cfg.ports.ui !== 'number') {
    errors.push('ports.api and ports.ui must be numbers');
  }
  if (cfg.alexa?.enabled && !String(cfg.alexa?.publicDomain || '').trim()) {
    errors.push('alexa.publicDomain is required when alexa.enabled=true');
  }
  return errors;
}

function parseMpdBlocks(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line0 of lines) {
    const line = String(line0 || '').trim();
    if (!line || line === 'OK' || line.startsWith('ACK')) continue;
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'file') {
      if (cur && cur.file) out.push(cur);
      cur = { file: v, genres: [] };
      continue;
    }
    if (!cur) cur = { genres: [] };
    if (k === 'genre') cur.genres.push(v);
    cur[k] = v;
  }
  if (cur && cur.file) out.push(cur);
  return out;
}

export function registerConfigRoutes(app, deps) {
  const {
    requireTrackKey,
    log,
    mpdQueryRaw,
    getRatingForFile,
    mpdStickerGetSong,
  } = deps;

  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || path.resolve(process.cwd(), 'config/now-playing.config.json');

  app.get('/config/runtime', async (req, res) => {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return res.json({ ok: true, configPath, config: withEnvOverrides(cfg), fullConfig: cfg });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (typeof mpdQueryRaw !== 'function' || typeof getRatingForFile !== 'function' || typeof mpdStickerGetSong !== 'function') {
        return res.status(501).json({ ok: false, error: 'library-health dependencies not wired' });
      }

      const sampleLimit = Math.max(10, Math.min(500, Number(req.query?.sampleLimit || 100)));
      const scanLimit = Math.max(100, Math.min(20000, Number(req.query?.scanLimit || 5000)));
      const started = Date.now();

      const mpdQuote = (s) => '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const pick = (arr, row) => { if (arr.length < sampleLimit) arr.push(row); };

      async function walkLsinfo() {
        const files = [];
        const dirs = [''];
        while (dirs.length && files.length < scanLimit) {
          const dir = dirs.shift();
          const cmd = dir ? `lsinfo ${mpdQuote(dir)}` : 'lsinfo';
          const raw = await mpdQueryRaw(cmd);
          const lines = String(raw || '').split(/\r?\n/);

          let cur = null;
          const flush = () => {
            if (cur && cur.file && isAudio(cur.file)) files.push(cur);
            cur = null;
          };

          for (const ln0 of lines) {
            const ln = String(ln0 || '').trim();
            if (!ln || ln === 'OK' || ln.startsWith('ACK')) continue;
            const i = ln.indexOf(':');
            if (i <= 0) continue;
            const k = ln.slice(0, i).trim().toLowerCase();
            const v = ln.slice(i + 1).trim();

            if (k === 'directory') {
              flush();
              if (v) dirs.push(v);
              continue;
            }
            if (k === 'playlist') {
              flush();
              continue;
            }
            if (k === 'file') {
              flush();
              cur = { file: v, genres: [] };
              continue;
            }
            if (!cur) continue;
            if (k === 'genre') cur.genres.push(v);
            cur[k] = v;
          }
          flush();
        }
        return files.slice(0, scanLimit);
      }

      const allFiles = await walkLsinfo();

      const summary = {
        totalTracks: 0,
        unrated: 0,
        lowRated1: 0,
        missingMbid: 0,
        missingGenre: 0,
        christmasGenre: 0,
        podcastGenre: 0,
      };

      const samples = {
        unrated: [],
        lowRated1: [],
        missingMbid: [],
        missingGenre: [],
      };

      let scanned = 0;
      for (const b0 of allFiles) {
        const file = String(b0?.file || '').trim();
        if (!file || !isAudio(file)) continue;
        if (scanned >= scanLimit) break;
        scanned += 1;

        summary.totalTracks += 1;

        const b = b0 || { file, genres: [] };

        const artist = String(b.artist || b.albumartist || '').trim();
        const title = String(b.title || '').trim();
        const album = String(b.album || '').trim();

        const genreVals = Array.isArray(b.genres) ? b.genres : [];
        const genreBlob = genreVals.join(' | ').trim();

        if (!genreBlob) {
          summary.missingGenre += 1;
          pick(samples.missingGenre, { file, artist, title, album });
        }
        if (/christmas/i.test(genreBlob)) summary.christmasGenre += 1;
        if (/\bpodcast\b/i.test(genreBlob)) summary.podcastGenre += 1;

        const isPodcast = /\bpodcast\b/i.test(genreBlob);

        let rating = 0;
        try { rating = Number(await getRatingForFile(file)) || 0; } catch (_) {}
        // User policy: do not count Podcast-genre tracks in unrated tally.
        if (!isPodcast && rating <= 0) {
          summary.unrated += 1;
          pick(samples.unrated, { file, artist, title, album, rating });
        }
        if (rating === 1) {
          summary.lowRated1 += 1;
          pick(samples.lowRated1, { file, artist, title, album, rating });
        }

        const mbTag = String(b.musicbrainz_trackid || '').trim();
        let mbSticker = '';
        if (!mbTag) {
          try { mbSticker = String(await mpdStickerGetSong(file, 'mb_trackid') || '').trim(); } catch (_) {}
        }
        if (!mbTag && !mbSticker) {
          summary.missingMbid += 1;
          pick(samples.missingMbid, { file, artist, title, album });
        }
      }

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        summary,
        samples,
        sampleLimit,
        scanLimit,
        scannedTracks: summary.totalTracks,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/runtime', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const incoming = req.body?.config;
      const fullIncoming = req.body?.fullConfig;
      if ((!incoming || typeof incoming !== 'object') && (!fullIncoming || typeof fullIncoming !== 'object')) {
        return res.status(400).json({ ok: false, error: 'Missing JSON body { config: {...} } or { fullConfig: {...} }' });
      }

      let current = {};
      try {
        current = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {}

      const next = (fullIncoming && typeof fullIncoming === 'object')
        ? fullIncoming
        : {
            ...current,
            ...incoming,
            alexa: {
              ...(current.alexa || {}),
              ...(incoming.alexa || {}),
              // Replace alias map when provided so deletions persist.
              artistAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'artistAliases'))
                ? (incoming.alexa.artistAliases || {})
                : ((current.alexa || {}).artistAliases || {}),
              albumAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'albumAliases'))
                ? (incoming.alexa.albumAliases || {})
                : ((current.alexa || {}).albumAliases || {}),
              playlistAliases: (incoming?.alexa && Object.prototype.hasOwnProperty.call(incoming.alexa, 'playlistAliases'))
                ? (incoming.alexa.playlistAliases || {})
                : ((current.alexa || {}).playlistAliases || {}),
              unresolvedArtists: Array.isArray(incoming?.alexa?.unresolvedArtists)
                ? incoming.alexa.unresolvedArtists
                : ((current.alexa || {}).unresolvedArtists || []),
              heardArtists: Array.isArray(incoming?.alexa?.heardArtists)
                ? incoming.alexa.heardArtists
                : ((current.alexa || {}).heardArtists || []),
              unresolvedAlbums: Array.isArray(incoming?.alexa?.unresolvedAlbums)
                ? incoming.alexa.unresolvedAlbums
                : ((current.alexa || {}).unresolvedAlbums || []),
              heardAlbums: Array.isArray(incoming?.alexa?.heardAlbums)
                ? incoming.alexa.heardAlbums
                : ((current.alexa || {}).heardAlbums || []),
              unresolvedPlaylists: Array.isArray(incoming?.alexa?.unresolvedPlaylists)
                ? incoming.alexa.unresolvedPlaylists
                : ((current.alexa || {}).unresolvedPlaylists || []),
              heardPlaylists: Array.isArray(incoming?.alexa?.heardPlaylists)
                ? incoming.alexa.heardPlaylists
                : ((current.alexa || {}).heardPlaylists || []),
            },
            ports: { ...(current.ports || {}), ...(incoming.ports || {}) },
            paths: { ...(current.paths || {}), ...(incoming.paths || {}) },
            notifications: {
              ...(current.notifications || {}),
              ...(incoming.notifications || {}),
              trackNotify: {
                ...((current.notifications || {}).trackNotify || {}),
                ...((incoming.notifications || {}).trackNotify || {}),
              },
              pushover: {
                ...((current.notifications || {}).pushover || {}),
                ...((incoming.notifications || {}).pushover || {}),
              },
            },
          };

      const errs = validateConfigShape(next);
      if (errs.length) return res.status(400).json({ ok: false, error: errs.join('; ') });

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      log.debug('[config/runtime] updated', { configPath });

      return res.json({
        ok: true,
        message: 'Config saved. Restart api with --update-env to apply env-overridden values.',
        config: withEnvOverrides(next),
        fullConfig: next,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  async function handleArtistAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.body?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'Missing artist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedArtists) ? current.alexa.unresolvedArtists : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);

      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = {
          ...prev,
          artist,
          key,
          count: Number(prev.count || 1) + 1,
          updatedAt: now,
          lastSource: source,
        };
      } else {
        unresolved.unshift({
          artist,
          key,
          count: 1,
          createdAt: now,
          updatedAt: now,
          lastSource: source,
        });
      }

      const heard = Array.isArray(current?.alexa?.heardArtists) ? current.alexa.heardArtists : [];
      heard.unshift({ artist, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedArtists: unresolved.slice(0, 200),
          heardArtists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: artist, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardArtist(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.body?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'Missing artist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');

      const heard = Array.isArray(current?.alexa?.heardArtists) ? current.alexa.heardArtists : [];
      heard.unshift({ artist, key, source, status, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardArtists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: artist, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlbumAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.body?.album || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'Missing album' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = album.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedAlbums) ? current.alexa.unresolvedAlbums : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);
      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = { ...prev, album, key, count: Number(prev.count || 1) + 1, updatedAt: now, lastSource: source };
      } else {
        unresolved.unshift({ album, key, count: 1, createdAt: now, updatedAt: now, lastSource: source });
      }

      const heard = Array.isArray(current?.alexa?.heardAlbums) ? current.alexa.heardAlbums : [];
      heard.unshift({ album, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedAlbums: unresolved.slice(0, 200),
          heardAlbums: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: album, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardAlbum(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.body?.album || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'Missing album' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = album.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');
      const resolvedTo = String(req.body?.resolvedTo || '').trim();

      const heard = Array.isArray(current?.alexa?.heardAlbums) ? current.alexa.heardAlbums : [];
      heard.unshift({ album, key, source, status, resolvedTo, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardAlbums: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: album, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  app.post('/config/artist-alias-suggestion', handleArtistAliasSuggestion);
  app.post('/mpd/artist-alias-suggestion', handleArtistAliasSuggestion);
  app.post('/config/album-alias-suggestion', handleAlbumAliasSuggestion);
  app.post('/mpd/album-alias-suggestion', handleAlbumAliasSuggestion);

  async function handlePlaylistAliasSuggestion(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const playlist = String(req.body?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'Missing playlist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = playlist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');

      const unresolved = Array.isArray(current?.alexa?.unresolvedPlaylists) ? current.alexa.unresolvedPlaylists : [];
      const idx = unresolved.findIndex((x) => String(x?.key || '').trim() === key);
      if (idx >= 0) {
        const prev = unresolved[idx] || {};
        unresolved[idx] = { ...prev, playlist, key, count: Number(prev.count || 1) + 1, updatedAt: now, lastSource: source };
      } else {
        unresolved.unshift({ playlist, key, count: 1, createdAt: now, updatedAt: now, lastSource: source });
      }

      const heard = Array.isArray(current?.alexa?.heardPlaylists) ? current.alexa.heardPlaylists : [];
      heard.unshift({ playlist, key, source, at: now, status: 'not-found' });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          unresolvedPlaylists: unresolved.slice(0, 200),
          heardPlaylists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, queued: playlist, total: unresolved.slice(0, 200).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  async function handleAlexaHeardPlaylist(req, res) {
    try {
      if (!requireTrackKey(req, res)) return;
      const playlist = String(req.body?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'Missing playlist' });

      let current = {};
      try { current = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

      const now = new Date().toISOString();
      const key = playlist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const source = String(req.body?.source || 'alexa');
      const status = String(req.body?.status || 'attempt');
      const resolvedTo = String(req.body?.resolvedTo || '').trim();

      const heard = Array.isArray(current?.alexa?.heardPlaylists) ? current.alexa.heardPlaylists : [];
      heard.unshift({ playlist, key, source, status, resolvedTo, at: now });

      const next = {
        ...current,
        alexa: {
          ...(current.alexa || {}),
          heardPlaylists: heard.slice(0, 400),
        },
      };

      await fs.writeFile(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return res.json({ ok: true, logged: playlist, total: heard.slice(0, 400).length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }

  app.post('/config/alexa-heard-artist', handleAlexaHeardArtist);
  app.post('/mpd/alexa-heard-artist', handleAlexaHeardArtist);
  app.post('/config/alexa-heard-album', handleAlexaHeardAlbum);
  app.post('/mpd/alexa-heard-album', handleAlexaHeardAlbum);
  app.post('/config/alexa-heard-playlist', handleAlexaHeardPlaylist);
  app.post('/mpd/alexa-heard-playlist', handleAlexaHeardPlaylist);
  app.post('/config/playlist-alias-suggestion', handlePlaylistAliasSuggestion);
  app.post('/mpd/playlist-alias-suggestion', handlePlaylistAliasSuggestion);

  app.post('/config/restart-api', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      try {
        await execFileP('pm2', ['restart', 'api', '--update-env']);
        return res.json({ ok: true, restarted: true, method: 'pm2' });
      } catch (e) {
        return res.status(501).json({
          ok: false,
          restarted: false,
          error: 'Automatic restart unavailable on this host. Restart your API process manually.',
          detail: e?.message || String(e),
        });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
