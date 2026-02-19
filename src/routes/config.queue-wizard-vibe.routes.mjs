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
      return String(cfg?.lastfmApiKey || '').trim();
    } catch {
      return '';
    }
  }

  // --- Vibe from now playing (Queue Wizard) ---
  app.post('/config/queue-wizard/vibe-start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const targetQueueRaw = req.body?.targetQueue;
      const targetQueue = Math.max(10, Math.min(200, Number(targetQueueRaw) || 50));
      const minRating = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const playNow = !!req.body?.playNow;
      const keepPlaying = !!req.body?.keepPlaying;
      const mpdHost = String(MPD_HOST || '10.0.0.254');

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

      const indexPath = '/home/moode/moode_library_index.json';
      await fs.access(indexPath);

      const jobId = makeVibeJobId();
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/${jobId}.json`;

      const pyArgs = [
        '--api-key', lastfmApiKey,
        '--seed-artist', artist,
        '--seed-title', title,
        '--target-queue', String(targetQueue),
        '--json-out', jsonTmp,
        '--mode', playNow ? 'play' : 'load',
        '--shuffle-top', '25',
        '--reseed-random',
        '--max-misses', '12',
        '--host', mpdHost,
        '--port', '6600',
      ];
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
        seedArtist: artist,
        seedTitle: title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        builtCount: 0,
        added: [],
        tracks: [],
        logs: [],
        nextEventId: 1,
        error: '',
        done: false,
        jsonTmp,
        proc: null,
      };

      const child = spawn('python3', [pyPath, ...pyArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.proc = child;
      vibeJobs.set(jobId, job);

      const onLine = (lineIn = '') => {
        const line = String(lineIn || '').trim();
        if (!line) return;
        job.updatedAt = Date.now();
        job.logs.push(line);
        if (job.logs.length > 100) job.logs.shift();

        if (/Last\.fm get similar/i.test(line)) job.phase = 'querying last.fm';
        if (/pick from/i.test(line)) job.phase = 'matching local library';

        const m = line.match(/^\[hop\s+\d+\]\s+Added:\s+(.+?)\s+\(([^)]+)\)/i);
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

          if (job.minRating > 0 && typeof getRatingForFile === 'function') {
            const kept = [];
            for (const t of baseTracks) {
              const f = String(t?.file || '').trim();
              let r = 0;
              try { r = Number(await getRatingForFile(f)) || 0; } catch {}
              if (r >= job.minRating) kept.push(t);
            }
            job.tracks = kept;
          } else {
            job.tracks = baseTracks;
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
        seedArtist: job.seedArtist,
        seedTitle: job.seedTitle,
        added,
        nextSince,
        tracks: job.done ? (Array.isArray(job.tracks) ? job.tracks : []) : [],
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
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run']);
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
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%title%', 'current']);
      const line = String(stdout || '').trim();
      const [artist = '', title = ''] = line.split('\t');
      if (!artist || !title) return res.status(404).json({ ok: false, error: 'No current track (artist/title empty)' });
      const lastfmApiKey = await resolveLastfmApiKey();
      if (!lastfmApiKey) return res.status(400).json({ ok: false, error: 'Last.fm API key is not configured' });
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-np-${Date.now()}-${process.pid}.json`;
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--seed-artist', artist, '--seed-title', title, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist: artist, seedTitle: title });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Fire-and-forget seeded start for Alexa "vibe here" mode.
  // Returns immediately after spawning the builder process.
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

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jobId = makeVibeJobId();

      // Ensure deterministic queue order for seeded vibe starts.
      if (playNow || keepPlaying) {
        try { await execFileP('mpc', ['-h', mpdHost, '-p', '6600', 'random', 'off']); } catch (_) {}
      }

      const pyArgs = [
        pyPath,
        '--api-key', lastfmApiKey,
        '--seed-artist', seedArtist,
        '--seed-title', seedTitle,
        '--target-queue', String(targetQueue),
        '--mode', playNow ? 'play' : 'load',
        '--shuffle-top', '25',
        '--reseed-random',
        '--max-misses', '12',
        '--host', mpdHost,
        '--port', '6600',
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

      let outBuf = '';
      let errBuf = '';
      child.stdout.on('data', (buf) => {
        outBuf += String(buf || '');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        lines.filter(Boolean).forEach((ln) => console.log(`[vibe-seed-start:${jobId}] ${ln}`));
      });
      child.stderr.on('data', (buf) => {
        errBuf += String(buf || '');
        const lines = errBuf.split(/\r?\n/);
        errBuf = lines.pop() || '';
        lines.filter(Boolean).forEach((ln) => console.log(`[vibe-seed-start:${jobId}] stderr: ${ln}`));
      });
      child.on('close', (code) => {
        if (outBuf.trim()) console.log(`[vibe-seed-start:${jobId}] ${outBuf.trim()}`);
        if (errBuf.trim()) console.log(`[vibe-seed-start:${jobId}] stderr: ${errBuf.trim()}`);
        console.log(`[vibe-seed-start:${jobId}] exited code=${code}`);
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

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const pyPath = path.resolve(process.cwd(), 'lastfm_vibe_radio.py');
      const jsonTmp = `/tmp/vibe-seed-${Date.now()}-${process.pid}.json`;
      await execFileP('python3', [pyPath, '--api-key', lastfmApiKey, '--seed-artist', seedArtist, '--seed-title', seedTitle, '--target-queue', String(targetQueue), '--json-out', jsonTmp, '--mode', 'load', '--host', mpdHost, '--port', '6600', '--dry-run']);
      const data = JSON.parse(await fs.readFile(jsonTmp, 'utf8'));
      await fs.unlink(jsonTmp).catch(() => {});
      return res.json({ ok: true, tracks: data?.tracks || [], summary: data, targetQueue, seedArtist, seedTitle });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
