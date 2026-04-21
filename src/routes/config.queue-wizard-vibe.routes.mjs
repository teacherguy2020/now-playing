import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

function makeVibeJobId() {
  return `vibe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function registerConfigQueueWizardVibeRoutes(app, deps) {
  const { requireTrackKey, getRatingForFile } = deps;
  const vibeJobs = new Map();
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || path.resolve(process.cwd(), 'config/now-playing.config.json');

  async function resolveLastfmApiKey() {
    const envKey = String(process.env.LASTFM_API_KEY || '').trim();
    if (envKey) return envKey;
    try {
      const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
      return String(cfg?.lastfm?.apiKey || '').trim();
    } catch {
      return '';
    }
  }

  async function resolveVibeIndexPath() {
    const candidates = [
      String(process.env.MOODE_LIBRARY_INDEX || '').trim(),
      path.resolve(process.cwd(), 'moode_library_index.json'),
      '/opt/now-playing/moode_library_index.json',
      '/home/moode/moode_library_index.json',
    ].filter(Boolean);
    for (const p of candidates) {
      try { await fs.access(p); return p; } catch {}
    }
    return path.resolve(process.cwd(), 'moode_library_index.json');
  }

  const vibeLogDir = path.resolve(process.cwd(), 'logs/vibe');
  async function appendVibeJobLog(job, event, detail = {}) {
    try {
      const rec = {
        ts: new Date().toISOString(),
        jobId: String(job?.id || ''),
        event: String(event || 'event'),
        detail: detail && typeof detail === 'object' ? detail : { message: String(detail || '') },
      };
      const line = `${JSON.stringify(rec)}\n`;
      await fs.mkdir(vibeLogDir, { recursive: true });
      const fp = String(job?.logPath || path.join(vibeLogDir, `${String(job?.id || 'vibe')}.jsonl`));
      await fs.appendFile(fp, line, 'utf8');
    } catch {}
  }

  async function ensureVibeIndexReady(job, vibeIndexPath, mpdHost) {
    const staleMs = Number(process.env.VIBE_INDEX_MAX_AGE_MS || 12 * 60 * 60 * 1000);
    let needsBuild = false;
    try {
      const st = await fs.stat(vibeIndexPath);
      const ageMs = Date.now() - Number(st.mtimeMs || 0);
      if (!Number.isFinite(st.size) || st.size < 256 || ageMs > staleMs) needsBuild = true;
    } catch {
      needsBuild = true;
    }
    if (!needsBuild) return true;

    job.phase = 'creating index file please wait';
    job.updatedAt = Date.now();
    const buildPy = path.resolve(process.cwd(), 'build_moode_index.py');
    job.logs.push(`[index] building local index: ${vibeIndexPath}`);
    appendVibeJobLog(job, 'index-build-start', { vibeIndexPath, mpdHost, buildPy }).catch(() => {});

    try {
      const { stdout, stderr } = await execFileP('python3', [buildPy], {
        env: {
          ...process.env,
          INDEX_PATH: vibeIndexPath,
          MPD_HOST: String(mpdHost || 'moode.local'),
          MPD_PORT: '6600',
        },
      });
      const out = String(stdout || '').trim();
      const err = String(stderr || '').trim();
      if (out) {
        out.split(/\r?\n/).forEach((ln) => { if (ln) job.logs.push(`[index] ${ln}`); });
      }
      if (err) {
        err.split(/\r?\n/).forEach((ln) => { if (ln) job.logs.push(`[index][stderr] ${ln}`); });
      }
      appendVibeJobLog(job, 'index-build-complete', { ok: true }).catch(() => {});
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      job.error = `Index build failed: ${msg}`;
      job.phase = 'error';
      job.status = 'error';
      job.done = true;
      job.updatedAt = Date.now();
      job.logs.push(`[index] ERROR ${msg}`);
      appendVibeJobLog(job, 'index-build-complete', { ok: false, error: msg }).catch(() => {});
      return false;
    }
  }

  // --- Vibe from now playing (Queue Wizard) ---
  app.post('/config/queue-wizard/vibe-start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const targetQueueRaw = req.body?.targetQueue;
      const targetQueue = Math.max(10, Math.min(200, Number(targetQueueRaw) || 50));
      const minRating = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const excludeGenre = String(req.body?.excludeGenre || 'christmas').trim().toLowerCase();
      const playNow = !!req.body?.playNow;
      const keepPlaying = !!req.body?.keepPlaying;
      const mpdHost = String(MPD_HOST || 'moode.local');

      let artist = '';
      let title = '';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      if (line) {
        const [a = '', t = ''] = line.split('\t');
        artist = String(a || '').trim();
        title = String(t || '').trim();
      }

      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });

      const jobId = makeVibeJobId();
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/${jobId}.json`;
      const vibeIndexPath = await resolveVibeIndexPath();

      const isSmallQueue = targetQueue <= 15;
      const pyArgs = [
        '--api-key', lastfmApiKey,
        '--index', vibeIndexPath,
        '--seed-artist', artist,
        '--seed-title', title,
        '--target-queue', String(targetQueue),
        '--json-out', jsonTmp,
        '--mode', playNow ? 'play' : 'load',
        '--similar-limit', isSmallQueue ? '80' : '150',
        '--shuffle-top', isSmallQueue ? '15' : '25',
        '--reseed-random',
        '--max-misses', isSmallQueue ? '6' : '12',
        '--max-seconds', isSmallQueue ? '18' : '45',
        '--host', mpdHost,
        '--port', '6600',
        '--debug-trace',
        '--simple-seed-pass',
      ];
      if (excludeGenre === 'christmas') pyArgs.push('--exclude-christmas');
      else if (excludeGenre === 'none') pyArgs.push('--include-christmas');
      if (!playNow) {
        if (keepPlaying) {
          pyArgs.push('--crop');
          pyArgs.push('--no-final-stop');
        } else {
          pyArgs.push('--dry-run');
        }
      } else {
        pyArgs.push('--crop');
      }

      if (playNow || keepPlaying) {
        try { await execFileP('mpc', ['-h', mpdHost, '-p', '6600', 'random', 'off']); } catch (_) {}
      }

      const job = {
        id: jobId,
        status: 'running',
        phase: 'starting',
        targetQueue,
        minRating,
        excludeGenre,
        seedArtist: artist,
        seedTitle: title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        builtCount: 0,
        rawBuiltCount: 0,
        added: [],
        tracks: [],
        logs: [],
        debug: {
          fallbackUsed: false,
          fallbackCount: 0,
          previewResponseCount: 0,
          indexPath: vibeIndexPath,
        },
        nextEventId: 1,
        error: '',
        done: false,
        jsonTmp,
        logPath: path.join(vibeLogDir, `${jobId}.jsonl`),
        proc: null,
      };

      vibeJobs.set(jobId, job);
      appendVibeJobLog(job, 'start', {
        seedArtist: artist,
        seedTitle: title,
        targetQueue,
        minRating,
        excludeGenre,
        playNow,
        keepPlaying,
        mpdHost,
        indexPath: vibeIndexPath,
        pyPath,
      }).catch(() => {});

      const indexReady = await ensureVibeIndexReady(job, vibeIndexPath, mpdHost);
      if (!indexReady) {
        return res.status(500).json({ ok: false, error: job.error || 'Index build failed', jobId });
      }

      const child = spawn('python3', [pyPath, ...pyArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.proc = child;
      appendVibeJobLog(job, 'run', {
        seedArtist: artist,
        seedTitle: title,
        targetQueue,
        minRating,
        excludeGenre,
        playNow,
        keepPlaying,
        mpdHost,
        indexPath: vibeIndexPath,
        pyPath,
      }).catch(() => {});

      const onLine = (lineIn = '') => {
        const line = String(lineIn || '').trim();
        if (!line) return;
        job.updatedAt = Date.now();
        job.logs.push(line);
        if (job.logs.length > 300) job.logs.shift();
        appendVibeJobLog(job, 'line', { line }).catch(() => {});

        if (/Last\.fm get similar/i.test(line)) job.phase = 'querying last.fm';
        if (/pick from/i.test(line)) job.phase = 'matching local library';

        const m = line.match(/^\[hop\s+\d+\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i)
          || line.match(/^\[simple\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i);
        if (m) {
          const label = String(m[1] || '').trim();
          const method = String(m[2] || '').trim();
          const parts = label.split(' — ');
          const titleX = parts[0] || label;
          const artistX = parts.length > 1 ? parts.slice(1).join(' — ') : '';

          job.added.push({
            eventId: job.nextEventId++,
            artist: artistX,
            title: titleX,
            method,
          });
          if (job.added.length > 500) job.added = job.added.slice(-500);
          job.builtCount += 1;
          job.phase = 'adding tracks';
        }

        const pm = line.match(/^\[simple\]\s+pass\s+(\d+)\s+added\s+(\d+)\s+track/i);
        if (pm) {
          const p = Number(pm[1] || 0);
          const n = Number(pm[2] || 0);
          job.phase = `simple pass ${p} complete (+${n})`;
        }
      };

      let outBuf = '';
      child.stdout.on('data', (buf) => {
        outBuf += String(buf || '');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        lines.forEach(onLine);
      });

      let errBuf = '';
      child.stderr.on('data', (buf) => {
        errBuf += String(buf || '');
        const lines = errBuf.split(/\r?\n/);
        errBuf = lines.pop() || '';
        lines.forEach((ln) => onLine(`stderr: ${ln}`));
      });

      child.on('close', async (code) => {
        if (outBuf.trim()) onLine(outBuf.trim());
        if (errBuf.trim()) onLine(`stderr: ${errBuf.trim()}`);

        try {
          const jsonOut = await fs.readFile(jsonTmp, 'utf8');
          const data = JSON.parse(jsonOut);
          const baseTracks = Array.isArray(data?.tracks) ? data.tracks : [];
          job.rawBuiltCount = baseTracks.length;

          if (job.minRating > 0 && typeof getRatingForFile === 'function') {
            const kept = [];
            for (const t of baseTracks) {
              const f = String(t?.file || '').trim();
              let r = 0;
              try { r = Number(await getRatingForFile(f)) || 0; } catch {}
              if (r >= job.minRating) kept.push(t);
            }
            // Guardrail: if rating filter wipes out a successful build, keep base tracks.
            // This prevents "built N then 0" UX when ratings are sparse/missing.
            job.tracks = kept.length ? kept : baseTracks;
          } else {
            job.tracks = baseTracks;
          }

          // Fallback: if Last.fm vibe resolves to zero tracks, build a local seed list from current artist.
          if (!job.tracks.length) {
            try {
              const body = {
                genres: [],
                artists: job.seedArtist ? [job.seedArtist] : [],
                albums: [],
                excludeGenres: [],
                minRating: Number(job.minRating || 0),
                maxTracks: Number(job.targetQueue || 50),
              };
              const resp = await fetch('http://127.0.0.1:3101/config/queue-wizard/preview', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(String(req.headers?.['x-track-key'] || '').trim() ? { 'x-track-key': String(req.headers['x-track-key']).trim() } : {}),
                },
                body: JSON.stringify(body),
              });
              const pj = await resp.json().catch(() => ({}));
              const items = Array.isArray(pj?.tracks) ? pj.tracks : [];
              job.debug.previewResponseCount = Number(items.length || 0);
              if (items.length) {
                job.tracks = items.slice(0, Number(job.targetQueue || 50)).map((t) => {
                  if (typeof t === 'string') return { file: String(t || '').trim() };
                  return {
                    file: String(t?.file || '').trim(),
                    artist: String(t?.artist || '').trim(),
                    title: String(t?.title || '').trim(),
                    album: String(t?.album || '').trim(),
                    genre: String(t?.genre || '').trim(),
                    rating: Math.max(0, Math.min(5, Number(t?.rating || 0) || 0)),
                  };
                }).filter((x) => x.file);
                job.phase = 'fallback: artist local matches';
                job.debug.fallbackUsed = true;
                job.debug.fallbackCount = Number(job.tracks.length || 0);
                job.logs.push(`fallback: local artist preview produced ${job.tracks.length} track(s)`);
                appendVibeJobLog(job, 'fallback', {
                  seedArtist: job.seedArtist,
                  previewCount: Number(items.length || 0),
                  keptCount: Number(job.tracks.length || 0),
                  sample: job.tracks.slice(0, 5).map((t) => ({ artist: t.artist || '', title: t.title || '', album: t.album || '', file: t.file || '' })),
                }).catch(() => {});
              }
            } catch (e2) {
              job.logs.push(`fallback error: ${e2?.message || String(e2)}`);
              appendVibeJobLog(job, 'fallback-error', { error: e2?.message || String(e2) }).catch(() => {});
            }
          }

          job.builtCount = job.tracks.length || 0;
          await fs.unlink(jsonTmp).catch(() => {});
        } catch (e) {
          if (!job.error) job.error = 'JSON parse/out: ' + (e?.message || String(e));
        }

        if (code !== 0 && !job.error) job.error = `vibe builder exited with code ${code}`;
        job.done = true;
        job.status = job.error ? 'error' : 'done';
        job.phase = job.error ? 'error' : 'complete';
        job.updatedAt = Date.now();
        appendVibeJobLog(job, 'complete', {
          exitCode: Number(code || 0),
          status: job.status,
          phase: job.phase,
          error: job.error || '',
          rawBuiltCount: Number(job.rawBuiltCount || 0),
          builtCount: Number(job.builtCount || 0),
          fallbackUsed: !!job.debug?.fallbackUsed,
          fallbackCount: Number(job.debug?.fallbackCount || 0),
          sample: (Array.isArray(job.tracks) ? job.tracks : []).slice(0, 8).map((t) => ({ artist: t.artist || '', title: t.title || '', album: t.album || '', file: t.file || '' })),
        }).catch(() => {});
      });

      return res.json({ ok: true, jobId, targetQueue, minRating, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/vibe-status/:jobId', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const jobId = String(req.params?.jobId || '');
      const job = vibeJobs.get(jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Unknown vibe job' });

      const since = Math.max(0, Number(req.query?.since || 0));
      const added = job.added.filter((x) => Number(x.eventId || 0) > since);
      const nextSince = job.added.length ? Number(job.added[job.added.length - 1].eventId || since) : since;

      return res.json({
        ok: true,
        jobId,
        status: job.status,
        phase: job.phase,
        done: !!job.done,
        error: job.error || '',
        targetQueue: job.targetQueue,
        minRating: Number(job.minRating || 0),
        builtCount: Number(job.builtCount || 0),
        rawBuiltCount: Number(job.rawBuiltCount || 0),
        seedArtist: job.seedArtist,
        seedTitle: job.seedTitle,
        excludeGenre: String(job.excludeGenre || ''),
        debug: job.debug || {},
        logPath: String(job.logPath || ''),
        logs: Array.isArray(job.logs) ? job.logs.slice(-120) : [],
        added,
        nextSince,
        tracks: job.done ? (Array.isArray(job.tracks) ? job.tracks : []) : [],
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/vibe-debug/:jobId', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const jobId = String(req.params?.jobId || '');
      const job = vibeJobs.get(jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Unknown vibe job' });

      let fileLogs = [];
      try {
        const raw = await fs.readFile(String(job.logPath || ''), 'utf8');
        fileLogs = String(raw || '').split(/\r?\n/).filter(Boolean).slice(-200).map((ln) => {
          try { return JSON.parse(ln); } catch { return { raw: ln }; }
        });
      } catch {}

      return res.json({
        ok: true,
        jobId,
        status: job.status,
        phase: job.phase,
        done: !!job.done,
        seedArtist: job.seedArtist,
        seedTitle: job.seedTitle,
        targetQueue: Number(job.targetQueue || 0),
        minRating: Number(job.minRating || 0),
        excludeGenre: String(job.excludeGenre || ''),
        builtCount: Number(job.builtCount || 0),
        rawBuiltCount: Number(job.rawBuiltCount || 0),
        debug: job.debug || {},
        inMemoryLogs: Array.isArray(job.logs) ? job.logs.slice(-200) : [],
        fileLogPath: String(job.logPath || ''),
        fileLogs,
        sampleTracks: (Array.isArray(job.tracks) ? job.tracks : []).slice(0, 25),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/vibe-cancel/:jobId', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const jobId = String(req.params?.jobId || '');
      const job = vibeJobs.get(jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'Unknown vibe job' });

      if (!job.done && job.proc?.pid) {
        try { process.kill(job.proc.pid, 'SIGTERM'); } catch (_) {}
      }

      job.done = true;
      job.status = 'cancelled';
      job.phase = 'cancelled';
      job.error = '';
      job.updatedAt = Date.now();

      return res.json({ ok: true, jobId, cancelled: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Backward-compatible one-shot endpoint
  app.get('/config/queue-wizard/vibe-nowplaying', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(10, Math.min(200, Number(req.query?.targetQueue) || 50));
      // Use direct invoke path by spawning inline (kept simple for compatibility)
      const mpdHost = String(MPD_HOST || 'moode.local');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      const vibeIndexPath = await resolveVibeIndexPath();
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--index', vibeIndexPath, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run', '--debug-trace']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/vibe-nowplaying', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(10, Math.min(200, Number(req.body?.targetQueue) || 50));
      const mpdHost = String(MPD_HOST || 'moode.local');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      const vibeIndexPath = await resolveVibeIndexPath();
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--index', vibeIndexPath, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run', '--debug-trace']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Fire-and-forget seeded start for Alexa "vibe here" mode.
  // Returns immediately after spawning the builder process, but now also registers
  // a status/debug job so controller UI can surface progress and failures.
  app.post('/config/queue-wizard/vibe-seed-start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(1, Math.min(200, Number(req.body?.targetQueue) || 12));
      const playNow = !!req.body?.playNow;
      const keepPlaying = !!req.body?.keepPlaying;
      const seedArtist = String(req.body?.seedArtist || '').trim();
      const seedTitle = String(req.body?.seedTitle || '').trim();
      if (!seedArtist || !seedTitle) return res.status(400).json({ ok: false, error: 'Missing seedArtist/seedTitle' });

      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });

      const mpdHost = String(MPD_HOST || 'moode.local');
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jobId = makeVibeJobId();

      // Ensure deterministic queue order for seeded vibe starts.
      if (playNow || keepPlaying) {
        try { await execFileP('mpc', ['-h', mpdHost, '-p', '6600', 'random', 'off']); } catch (_) {}
      }

      const vibeIndexPath = await resolveVibeIndexPath();
      const job = {
        id: jobId,
        status: 'running',
        phase: 'starting',
        targetQueue,
        minRating: 0,
        excludeGenre: 'none',
        seedArtist,
        seedTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        builtCount: 0,
        rawBuiltCount: 0,
        added: [],
        tracks: [],
        logs: [],
        debug: {
          fallbackUsed: false,
          fallbackCount: 0,
          previewResponseCount: 0,
          indexPath: vibeIndexPath,
          seededStart: true,
          playNow: !!playNow,
          keepPlaying: !!keepPlaying,
        },
        nextEventId: 1,
        error: '',
        done: false,
        jsonTmp: '',
        logPath: path.join(vibeLogDir, `${jobId}.jsonl`),
        proc: null,
      };
      vibeJobs.set(jobId, job);
      appendVibeJobLog(job, 'start', {
        seedArtist,
        seedTitle,
        targetQueue,
        playNow,
        keepPlaying,
        mpdHost,
        indexPath: vibeIndexPath,
        pyPath,
        seededStart: true,
      }).catch(() => {});

      const indexReady = await ensureVibeIndexReady(job, vibeIndexPath, mpdHost);
      if (!indexReady) {
        return res.status(500).json({ ok: false, error: job.error || 'Index build failed', jobId });
      }

      const pyArgs = [
        pyPath,
        '--api-key', lastfmApiKey,
        '--index', vibeIndexPath,
        '--seed-artist', seedArtist,
        '--seed-title', seedTitle,
        '--target-queue', String(targetQueue),
        '--mode', playNow ? 'play' : 'load',
        '--shuffle-top', '25',
        '--reseed-random',
        '--max-misses', '12',
        '--host', mpdHost,
        '--port', '6600',
        '--debug-trace',
        '--simple-seed-pass',
      ];
      if (playNow || keepPlaying) {
        pyArgs.push('--crop');
      }
      if (keepPlaying && !playNow) {
        pyArgs.push('--no-final-stop');
      }

      const child = spawn('python3', pyArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      job.proc = child;
      appendVibeJobLog(job, 'run', {
        seedArtist,
        seedTitle,
        targetQueue,
        playNow,
        keepPlaying,
        mpdHost,
        indexPath: vibeIndexPath,
        pyPath,
        seededStart: true,
      }).catch(() => {});

      const onLine = (lineIn = '') => {
        const line = String(lineIn || '').trim();
        if (!line) return;
        job.updatedAt = Date.now();
        job.logs.push(line);
        if (job.logs.length > 300) job.logs.shift();
        appendVibeJobLog(job, 'line', { line }).catch(() => {});

        if (/Last\.fm get similar/i.test(line)) job.phase = 'querying last.fm';
        if (/pick from/i.test(line)) job.phase = 'matching local library';

        const m = line.match(/^\[hop\s+\d+\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i)
          || line.match(/^\[simple\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i);
        if (m) {
          const label = String(m[1] || '').trim();
          const method = String(m[2] || '').trim();
          const parts = label.split(' — ');
          const titleX = parts[0] || label;
          const artistX = parts.length > 1 ? parts.slice(1).join(' — ') : '';
          job.added.push({
            eventId: job.nextEventId++,
            artist: artistX,
            title: titleX,
            method,
          });
          if (job.added.length > 500) job.added = job.added.slice(-500);
          job.builtCount += 1;
          job.phase = 'adding tracks';
        }

        const pm = line.match(/^\[simple\]\s+pass\s+(\d+)\s+added\s+(\d+)\s+track/i);
        if (pm) {
          const p = Number(pm[1] || 0);
          const n = Number(pm[2] || 0);
          job.phase = `simple pass ${p} complete (+${n})`;
        }
      };

      let outBuf = '';
      let errBuf = '';
      child.stdout.on('data', (buf) => {
        outBuf += String(buf || '');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        lines.filter(Boolean).forEach(onLine);
      });
      child.stderr.on('data', (buf) => {
        errBuf += String(buf || '');
        const lines = errBuf.split(/\r?\n/);
        errBuf = lines.pop() || '';
        lines.filter(Boolean).forEach((ln) => onLine(`stderr: ${ln}`));
      });
      child.on('close', (code) => {
        if (outBuf.trim()) onLine(outBuf.trim());
        if (errBuf.trim()) onLine(`stderr: ${errBuf.trim()}`);
        if (code !== 0 && !job.error) job.error = `vibe builder exited with code ${code}`;
        job.done = true;
        job.status = job.error ? 'error' : 'done';
        job.phase = job.error ? 'error' : 'complete';
        job.updatedAt = Date.now();
        appendVibeJobLog(job, 'complete', {
          exitCode: Number(code || 0),
          status: job.status,
          phase: job.phase,
          error: job.error || '',
          builtCount: Number(job.builtCount || 0),
          seededStart: true,
        }).catch(() => {});
      });

      return res.status(202).json({
        ok: true,
        accepted: true,
        jobId,
        targetQueue,
        seedArtist,
        seedTitle,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Seeded one-shot endpoint for Alexa/Echo mode (when MPD current is not the Echo track)
  app.post('/config/queue-wizard/vibe-seed', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const targetQueue = Math.max(1, Math.min(200, Number(req.body?.targetQueue) || 12));
      const seedArtist = String(req.body?.seedArtist || '').trim();
      const seedTitle = String(req.body?.seedTitle || '').trim();
      if (!seedArtist || !seedTitle) return res.status(400).json({ ok: false, error: 'Missing seedArtist/seedTitle' });

      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });

      const mpdHost = String(MPD_HOST || 'moode.local');
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-seed-${Date.now()}-${process.pid}.json`;
      const vibeIndexPath = await resolveVibeIndexPath();
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--index', vibeIndexPath, '--seed-artist', seedArtist, '--seed-title', seedTitle, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run', '--debug-trace']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist, seedTitle });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
