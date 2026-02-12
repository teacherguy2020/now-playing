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
    setRatingForFile,
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

  app.get('/config/queue-wizard/options', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const fmt = '%artist%\t%albumartist%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], { maxBuffer: 64 * 1024 * 1024 });
      const artists = new Set();
      const genres = new Set();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [artist = '', albumArtist = '', genreRaw = ''] = ln.split('\t');
        const a = String(artist || albumArtist || '').trim();
        if (a) artists.add(a);
        for (const g of String(genreRaw || '').split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean)) genres.add(g);
      }
      return res.json({
        ok: true,
        moodeHost: String(process.env.MOODE_SSH_HOST || process.env.MPD_HOST || '10.0.0.254'),
        genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        artists: Array.from(artists).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const wantedGenres = Array.isArray(req.body?.genres) ? req.body.genres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : [];
      const wantedArtists = Array.isArray(req.body?.artists) ? req.body.artists.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : [];
      const excludeGenres = Array.isArray(req.body?.excludeGenres) ? req.body.excludeGenres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : [];
      const minRating = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const maxTracks = Math.max(1, Math.min(5000, Number(req.body?.maxTracks || 250)));

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%albumartist%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], { maxBuffer: 64 * 1024 * 1024 });
      const tracks = [];
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', artist = '', title = '', album = '', albumartist = '', genreRaw = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f) continue;
        const genreTokens = String(genreRaw || '').split(/[;,|/]/).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
        const a = String(artist || '').trim().toLowerCase();
        const aa = String(albumartist || '').trim().toLowerCase();

        if (wantedGenres.length && !wantedGenres.some((g) => genreTokens.includes(g))) continue;
        if (wantedArtists.length && !(wantedArtists.includes(a) || wantedArtists.includes(aa))) continue;
        if (excludeGenres.length && excludeGenres.some((g) => genreTokens.includes(g))) continue;

        if (minRating > 0 && typeof getRatingForFile === 'function') {
          let rating = 0;
          try { rating = Number(await getRatingForFile(f)) || 0; } catch (_) {}
          if (rating < minRating) continue;
        }

        tracks.push({ file: f, artist: String(artist || ''), title: String(title || ''), album: String(album || ''), albumartist: String(albumartist || ''), genre: String(genreRaw || '') });
        if (tracks.length >= maxTracks) break;
      }
      return res.json({ ok: true, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/apply', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
      if (!['replace', 'append'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be replace|append' });
      const shuffle = Boolean(req.body?.shuffle);
      const generateCollage = Boolean(req.body?.generateCollage);
      const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const playlistName = String(req.body?.playlistName || '').trim();
      if (!tracks.length) return res.status(400).json({ ok: false, error: 'tracks[] is required' });

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      let randomTurnedOff = false;
      if (mode === 'replace') {
        await execFileP('mpc', ['-h', mpdHost, 'clear']);
        if (shuffle) {
          try { await execFileP('mpc', ['-h', mpdHost, 'random', 'off']); randomTurnedOff = true; } catch (_) {}
        }
      }
      let added = 0;
      for (const file of tracks) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'add', file]);
          added += 1;
        } catch (_) {}
      }
      let playStarted = false;
      if (mode === 'replace' && added > 0) {
        try { await execFileP('mpc', ['-h', mpdHost, 'play']); playStarted = true; } catch (_) {}
      }

      let playlistSaved = false;
      let playlistError = '';
      if (playlistName) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'rm', playlistName]);
        } catch (_) {}
        try {
          await execFileP('mpc', ['-h', mpdHost, 'save', playlistName]);
          playlistSaved = true;
        } catch (e) { playlistError = e?.message || String(e); }
      }

      let collageGenerated = false;
      let collageError = '';
      if (generateCollage && playlistName && playlistSaved) {
        const localScript = String(process.env.MOODE_PLAYLIST_COVER_SCRIPT || path.resolve(process.cwd(), 'scripts/moode-playlist-cover.sh'));
        try {
          await execFileP(localScript, [playlistName], {
            timeout: 120000,
            env: {
              ...process.env,
              MOODE_SSH_USER: String(process.env.MOODE_SSH_USER || 'moode'),
              MOODE_SSH_HOST: String(process.env.MOODE_SSH_HOST || process.env.MPD_HOST || '10.0.0.254'),
            },
          });
          collageGenerated = true;
        } catch (e) {
          collageError = e?.message || String(e);
        }
      }

      return res.json({ ok: true, mode, shuffle, generateCollage, requested: tracks.length, added, playStarted, randomTurnedOff, playlistSaved, playlistError, collageGenerated, collageError });
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
      const scanLimit = req.query?.scanLimit != null
        ? Math.max(100, Math.min(200000, Number(req.query.scanLimit || 100)))
        : Number.MAX_SAFE_INTEGER;
      const started = Date.now();

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const pick = (arr, row) => { if (arr.length < sampleLimit) arr.push(row); };

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%genre%\t%MUSICBRAINZ_TRACKID%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], { maxBuffer: 64 * 1024 * 1024 });
      const allFiles = String(stdout || '')
        .split(/\r?\n/)
        .map((ln) => {
          const [file = '', artist = '', title = '', album = '', genre = '', mbid = ''] = ln.split('\t');
          return {
            file: String(file || '').trim(),
            artist: String(artist || '').trim(),
            title: String(title || '').trim(),
            album: String(album || '').trim(),
            genres: String(genre || '').trim() ? [String(genre || '').trim()] : [],
            musicbrainz_trackid: String(mbid || '').trim(),
          };
        })
        .filter((x) => x.file && isAudio(x.file))
        .slice(0, Number.isFinite(scanLimit) ? scanLimit : undefined);

      const summary = {
        totalTracks: 0,
        totalAlbums: 0,
        missingArtwork: 0,
        unrated: 0,
        lowRated1: 0,
        missingMbid: 0,
        missingGenre: 0,
        christmasGenre: 0,
        podcastGenre: 0,
      };
      const genreSet = new Set();
      const genreCounts = new Map();
      const ratingCounts = new Map();

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
        for (const g of genreVals) {
          const raw = String(g || '').trim();
          if (!raw) continue;
          const splitVals = raw.split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean);
          const list = splitVals.length ? splitVals : [raw];
          for (const gg of list) {
            genreSet.add(gg);
            genreCounts.set(gg, Number(genreCounts.get(gg) || 0) + 1);
          }
        }
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
        const ratingBucket = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
        ratingCounts.set(String(ratingBucket), Number(ratingCounts.get(String(ratingBucket)) || 0) + 1);
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

      // Album artwork coverage summary (folder-level cover.jpg check on API Pi mounts)
      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };
      const folderSet = new Set(allFiles.map((r) => folderOf(r.file)).filter((f) => f && f !== '(root)'));
      summary.totalAlbums = folderSet.size;
      // Keep summary fast: cover.jpg presence only.
      // Deep embedded-art validation is done in /config/library-health/missing-artwork drilldown.
      for (const folder of folderSet) {
        const localFolder = await resolveLocalFolder(folder);
        if (!localFolder) { summary.missingArtwork += 1; continue; }
        const coverPath = path.join(localFolder, 'cover.jpg');
        try { await fs.access(coverPath); } catch (_) { summary.missingArtwork += 1; }
      }

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        summary,
        samples,
        genreCounts: Array.from(genreCounts.entries())
          .map(([genre, count]) => ({ genre, count: Number(count || 0) }))
          .sort((a, b) => (b.count - a.count) || a.genre.localeCompare(b.genre, undefined, { sensitivity: 'base' })),
        ratingCounts: [0,1,2,3,4,5].map((r) => ({ rating: r, count: Number(ratingCounts.get(String(r)) || 0) })),
        genreOptions: Array.from(genreSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        sampleLimit,
        scanLimit,
        scannedTracks: summary.totalTracks,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/albums', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const leafName = (p) => {
        const s = String(p || '');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
      };

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });

      const byFolder = new Map();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', album = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;
        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], album: '', artists: new Set() });
        const row = byFolder.get(folder);
        row.files.push(f);
        const aa = String(albumArtist || artist || '').trim();
        if (aa) row.artists.add(aa);
        if (!row.album) row.album = String(album || '').trim();
      }

      const albums = Array.from(byFolder.entries())
        .map(([folder, row]) => {
          const artists = Array.from(row.artists || []);
          const artist = artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist');
          const album = String(row.album || leafName(folder) || 'Unknown Album').trim();
          const label = `${artist} — ${album}`;
          return { id: folder, folder, album, artist, label, trackCount: row.files.length };
        })
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

      return res.json({ ok: true, albums });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/missing-artwork', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const leafName = (p) => {
        const s = String(p || '');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
      };
      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };
      const resolveLocalPath = async (file) => {
        const f = String(file || '').trim().replace(/^\/+/, '');
        if (!f) return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };
      const hasEmbeddedArtwork = async (files) => {
        const sample = (Array.isArray(files) ? files : []).slice(0, 3);
        for (const f of sample) {
          const local = await resolveLocalPath(f);
          if (!local) continue;
          try {
            const { stdout } = await execFileP('ffprobe', [
              '-v', 'error',
              '-show_entries', 'stream=codec_type:stream_disposition=attached_pic',
              '-of', 'json',
              local,
            ], { timeout: 1500 });
            const txt = String(stdout || '');
            if (/"attached_pic"\s*:\s*1/.test(txt)) return true;
          } catch (_) {}
        }
        return false;
      };

      const onlyFolder = String(req.query?.folder || '').trim();
      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });
      const byFolder = new Map();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', album = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;
        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], album: '', artists: new Set() });
        const row = byFolder.get(folder);
        row.files.push(f);
        const a = String(albumArtist || artist || '').trim();
        if (a) row.artists.add(a);
        if (!row.album) row.album = String(album || '').trim();
      }

      const missing = [];
      for (const [folder, row] of byFolder.entries()) {
        if (!folder || folder === '(root)') continue;
        if (onlyFolder && folder !== onlyFolder) continue;

        let hasCover = false;
        const localFolder = await resolveLocalFolder(folder);
        if (localFolder) {
          const coverPath = path.join(localFolder, 'cover.jpg');
          try { await fs.access(coverPath); hasCover = true; } catch (_) {}
        }

        if (!hasCover) {
          const hasEmbedded = await hasEmbeddedArtwork(row.files);
          if (!hasEmbedded) {
            const artists = Array.from(row.artists || []);
            missing.push({ folder, album: row.album || leafName(folder), artist: artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist'), trackCount: row.files.length, files: row.files.slice(0, 200) });
          }
        }
      }

      missing.sort((a, b) => `${a.artist} — ${a.album}`.localeCompare(`${b.artist} — ${b.album}`, undefined, { sensitivity: 'base' }));
      return res.json({ ok: true, totalMissing: missing.length, filterFolder: onlyFolder || null, albums: missing });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/album-art', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const localCandidates = [
        folder.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + folder.slice('USB/SamsungMoode/'.length) : '',
        folder.startsWith('OSDISK/') ? '/mnt/OSDISK/' + folder.slice('OSDISK/'.length) : '',
        '/mnt/SamsungMoode/' + folder,
        '/mnt/OSDISK/' + folder,
      ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

      let coverPath = '';
      for (const c of localCandidates) {
        const p = path.join(c, 'cover.jpg');
        try { await fs.access(p); coverPath = p; break; } catch (_) {}
      }

      if (!coverPath) return res.json({ ok: true, folder, hasCover: false });
      const buf = await fs.readFile(coverPath);
      return res.json({ ok: true, folder, hasCover: true, mimeType: 'image/jpeg', dataBase64: buf.toString('base64') });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/album-art', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folder = String(req.body?.folder || '').trim();
      const base64In = String(req.body?.imageBase64 || '').trim();
      const mode = String(req.body?.mode || 'both').trim().toLowerCase();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!base64In) return res.status(400).json({ ok: false, error: 'imageBase64 is required' });
      if (!['cover', 'embed', 'both'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be cover|embed|both' });

      const b64 = base64In.includes(',') ? base64In.split(',').pop() : base64In;
      let imgBuf = Buffer.from(String(b64 || ''), 'base64');
      if (!imgBuf.length) return res.status(400).json({ ok: false, error: 'invalid imageBase64' });

      const ts = Date.now();
      const tmpPath = path.join('/tmp', `library-health-art-${ts}.jpg`);
      const tmpSquarePath = path.join('/tmp', `library-health-art-square-${ts}.jpg`);
      await fs.writeFile(tmpPath, imgBuf);

      // Normalize uploaded art to a centered square so embeds/covers are consistent.
      try {
        await execFileP('ffmpeg', [
          '-y',
          '-i', tmpPath,
          '-vf', "crop='min(iw,ih)':'min(iw,ih)'",
          '-q:v', '2',
          tmpSquarePath,
        ]);
        imgBuf = await fs.readFile(tmpSquarePath);
      } catch (_) {
        // If ffmpeg is unavailable/fails, keep original upload bytes.
      }

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      let files = [];
      try {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder]);
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}
      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall']);
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter((f) => f && f.startsWith(folder + '/'));
      }

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';
        const candidates = [
          file.startsWith('/mnt/') ? file : '',
          file.startsWith('mnt/') ? '/' + file : '',
          file.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length) : '',
          file.startsWith('OSDISK/') ? '/mnt/OSDISK/' + file.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + file,
          '/mnt/OSDISK/' + file,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const doEmbed = mode === 'embed' || mode === 'both';
      const doCover = mode === 'cover' || mode === 'both';

      const isFlac = (f) => /\.flac$/i.test(String(f || ''));
      let updatedTracks = 0;
      let skippedTracks = 0;
      const skipped = [];
      if (doEmbed) {
        for (const f of files) {
          const local = await resolveLocalPath(f);
          if (!local || !isFlac(local)) {
            skippedTracks += 1;
            skipped.push(f);
            continue;
          }
          try {
            await execFileP('metaflac', ['--remove', '--block-type=PICTURE', local]);
            await execFileP('metaflac', [`--import-picture-from=${tmpPath}`, local]);
            updatedTracks += 1;
          } catch (_) {
            skippedTracks += 1;
            skipped.push(f);
          }
        }
      }

      // cover.jpg handling (update existing or create new) when cover mode enabled.
      let coverUpdated = false;
      let coverCreated = false;
      if (doCover) {
        const localFolders = [
          folder.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + folder.slice('USB/SamsungMoode/'.length) : '',
          folder.startsWith('OSDISK/') ? '/mnt/OSDISK/' + folder.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + folder,
          '/mnt/OSDISK/' + folder,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const lf of localFolders) {
          const cp = path.join(lf, 'cover.jpg');
          try {
            await fs.access(cp);
            await fs.writeFile(cp, imgBuf);
            coverUpdated = true;
            break;
          } catch (_) {
            try {
              await fs.access(lf);
              await fs.writeFile(cp, imgBuf);
              coverCreated = true;
              break;
            } catch (_) {}
          }
        }
      }

      try { await fs.unlink(tmpPath); } catch (_) {}
      try { await fs.unlink(tmpSquarePath); } catch (_) {}
      try { await execFileP('mpc', ['-w', '-h', mpdHost, 'update']); } catch (_) {}

      return res.json({ ok: true, folder, mode, totalFiles: files.length, updatedTracks, skippedTracks, skipped: skipped.slice(0, 200), coverUpdated, coverCreated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      let rows = [];
      try {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%', 'find', 'base', folder], { maxBuffer: 64 * 1024 * 1024 });
        rows = String(stdout || '').split(/\r?\n/).map((ln) => {
          const [file = '', genre = ''] = ln.split('\t');
          return { file: String(file || '').trim(), genre: String(genre || '').trim() };
        }).filter((r) => r.file);
      } catch (_) {}
      if (!rows.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });
        rows = String(stdout || '').split(/\r?\n/).map((ln) => {
          const [file = '', genre = ''] = ln.split('\t');
          return { file: String(file || '').trim(), genre: String(genre || '').trim() };
        }).filter((r) => r.file && r.file.startsWith(folder + '/'));
      }

      const genres = new Set();
      for (const r of rows) {
        for (const g of String(r.genre || '').split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean)) genres.add(g);
      }

      return res.json({ ok: true, folder, trackCount: rows.length, genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folder = String(req.body?.folder || '').trim();
      const genre = String(req.body?.genre || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!genre) return res.status(400).json({ ok: false, error: 'genre is required' });

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      let files = [];
      try {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder], { maxBuffer: 64 * 1024 * 1024 });
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}
      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter((f) => f && f.startsWith(folder + '/'));
      }

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';
        const candidates = [
          file.startsWith('/mnt/') ? file : '',
          file.startsWith('mnt/') ? '/' + file : '',
          file.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length) : '',
          file.startsWith('OSDISK/') ? '/mnt/OSDISK/' + file.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + file,
          '/mnt/OSDISK/' + file,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);
        for (const c of candidates) { try { await fs.access(c); return c; } catch (_) {} }
        return '';
      };

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];
      for (const f of files) {
        const local = await resolveLocalPath(f);
        if (!local || !/\.flac$/i.test(local)) { skipped += 1; skippedFiles.push(f); continue; }
        try {
          await execFileP('metaflac', ['--remove-tag=GENRE', `--set-tag=GENRE=${genre}`, local]);
          updated += 1;
          updatedFiles.push(f);
        } catch (_) {
          skipped += 1;
          skippedFiles.push(f);
        }
      }
      try { await execFileP('mpc', ['-w', '-h', mpdHost, 'update']); } catch (_) {}
      return res.json({ ok: true, folder, genre, requested: files.length, updated, skipped, updatedFiles, skippedFiles: skippedFiles.slice(0, 200) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/genre-folders', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const wantedRaw = String(req.query?.genre || '').trim();
      if (!wantedRaw) return res.status(400).json({ ok: false, error: 'genre is required' });
      const wanted = wantedRaw.toLowerCase();

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const splitGenres = (s) => String(s || '')
        .split(/[;,|/]/)
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%\t%artist%\t%albumartist%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });

      const byFolder = new Map();
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', genre = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;

        const tokens = splitGenres(genre);
        const matched = tokens.some((g) => g.toLowerCase() === wanted);
        if (!matched) continue;

        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], artists: new Set() });
        const row = byFolder.get(folder);
        row.files.push(f);
        const a = String(albumArtist || artist || '').trim();
        if (a) row.artists.add(a);
      }

      const folders = Array.from(byFolder.entries())
        .map(([folder, row]) => {
          const artists = Array.from(row.artists || []);
          const artist = artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist');
          return { folder, artist, trackCount: row.files.length, files: row.files };
        })
        .sort((a, b) => a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' }));

      return res.json({ ok: true, genre: wantedRaw, folderCount: folders.length, folders });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/genre-batch', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const files = Array.isArray(req.body?.files) ? req.body.files.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const genre = String(req.body?.genre || '').trim();
      if (!files.length) return res.status(400).json({ ok: false, error: 'files[] is required' });
      if (!genre) return res.status(400).json({ ok: false, error: 'genre is required' });

      const resolveLocalPath = async (f) => {
        const file = String(f || '').trim().replace(/^\/+/, '');
        if (!file) return '';

        const candidates = [];
        if (file.startsWith('mnt/')) candidates.push('/' + file);
        if (file.startsWith('/mnt/')) candidates.push(file);

        if (file.startsWith('USB/SamsungMoode/')) candidates.push('/mnt/SamsungMoode/' + file.slice('USB/SamsungMoode/'.length));
        if (file.startsWith('OSDISK/')) candidates.push('/mnt/OSDISK/' + file.slice('OSDISK/'.length));

        // Generic fallbacks: map MPD-relative paths onto mounted roots on API Pi.
        candidates.push('/mnt/SamsungMoode/' + file);
        candidates.push('/mnt/OSDISK/' + file);

        const seen = new Set();
        for (const c0 of candidates) {
          const c = String(c0 || '').replace(/\/+/g, '/');
          if (!c || seen.has(c)) continue;
          seen.add(c);
          try {
            await fs.access(c);
            return c;
          } catch (_) {}
        }
        return '';
      };

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];
      const skippedDetails = [];
      const errors = [];

      for (const file of files) {
        const local = await resolveLocalPath(file);
        if (!local) {
          skipped += 1;
          skippedFiles.push(file);
          skippedDetails.push({ file, reason: 'unmapped_path_prefix' });
          continue;
        }
        if (!/\.flac$/i.test(local)) {
          skipped += 1;
          skippedFiles.push(file);
          skippedDetails.push({ file, reason: 'non_flac' });
          continue;
        }
        try {
          // Replace genre cleanly (avoid leaving old multi-value GENRE tags behind).
          await execFileP('metaflac', ['--remove-tag=GENRE', `--set-tag=GENRE=${genre}`, local]);
          updated += 1;
          updatedFiles.push(file);
        } catch (e) {
          errors.push({ file, error: e?.message || String(e) });
        }
      }

      try {
        const mpdHost = String(process.env.MPD_HOST || '10.0.0.254');
        // Wait for DB update to finish so a follow-up health scan reflects new tags.
        await execFileP('mpc', ['-w', '-h', mpdHost, 'update']);
      } catch (_) {}

      return res.json({ ok: true, genre, requested: files.length, updated, skipped, updatedFiles, skippedFiles: skippedFiles.slice(0, 200), skippedDetails: skippedDetails.slice(0, 200), errors: errors.slice(0, 50) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/rating-batch', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (typeof setRatingForFile !== 'function') return res.status(501).json({ ok: false, error: 'rating dependency not wired' });

      const files = Array.isArray(req.body?.files) ? req.body.files.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const ratingNum = Number(req.body?.rating);
      if (!files.length) return res.status(400).json({ ok: false, error: 'files[] is required' });
      if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        return res.status(400).json({ ok: false, error: 'rating must be 0..5' });
      }
      const rating = Math.round(ratingNum);

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];
      const errors = [];

      for (const file of files) {
        if (!file) { skipped += 1; skippedFiles.push(file); continue; }
        try {
          await setRatingForFile(file, rating);
          updated += 1;
          updatedFiles.push(file);
        } catch (e) {
          errors.push({ file, error: e?.message || String(e) });
        }
      }

      return res.json({ ok: true, rating, requested: files.length, updated, skipped, updatedFiles, skippedFiles: skippedFiles.slice(0, 200), errors: errors.slice(0, 50) });
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
