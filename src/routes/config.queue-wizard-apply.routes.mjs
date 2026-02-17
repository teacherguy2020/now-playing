import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function safePlaylistName(name = '') {
  return String(name || '')
    .replace(/[^A-Za-z0-9 _.\-]/g, '')
    .trim();
}

export function registerConfigQueueWizardApplyRoute(app, deps) {
  const { requireTrackKey } = deps;

  // --- apply route ---
  app.post('/config/queue-wizard/apply', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
      if (!['replace', 'append'].includes(mode)) {
        return res.status(400).json({ ok: false, error: 'mode must be replace|append' });
      }

      const shuffle = Boolean(req.body?.shuffle);
      const forceRandomOff = Boolean(req.body?.forceRandomOff);
      const generateCollage = Boolean(req.body?.generateCollage);
      const previewCoverBase64 = String(req.body?.previewCoverBase64 || '').trim();
      const previewCoverMimeType = String(req.body?.previewCoverMimeType || 'image/jpeg').trim().toLowerCase();

      const keepNowPlaying =
        req.body?.keepNowPlaying === true ||
        req.body?.crop === true ||
        String(req.body?.keepNowPlaying || '').toLowerCase() === 'true' ||
        String(req.body?.crop || '').toLowerCase() === 'true';

      const tracks = Array.isArray(req.body?.tracks)
        ? req.body.tracks.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const trackMeta = Array.isArray(req.body?.trackMeta) ? req.body.trackMeta : [];

      const playlistName = String(req.body?.playlistName || '').trim();
      if (!tracks.length) return res.status(400).json({ ok: false, error: 'tracks[] is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let didCrop = false;
      let didClear = false;
      let randomTurnedOff = false;

      if (mode === 'replace') {
        if (keepNowPlaying) {
          await execFileP('mpc', ['-h', mpdHost, 'crop']);
          didCrop = true;
        } else {
          await execFileP('mpc', ['-h', mpdHost, 'clear']);
          didClear = true;
        }

        // Always disable random before building a deterministic queue.
        try {
          await execFileP('mpc', ['-h', mpdHost, 'random', 'off']);
          randomTurnedOff = true;
        } catch (_) {}
      }

      if (forceRandomOff && !randomTurnedOff) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'random', 'off']);
          randomTurnedOff = true;
        } catch (_) {}
      }

      let added = 0;
      const failedFiles = [];
      const addedFiles = [];

      for (const file of tracks) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'add', file]);
          added += 1;
          addedFiles.push(file);
        } catch (_) {
          failedFiles.push(file);
        }
      }

      // Persist lightweight station hint map for radio queue rows.
      try {
        const metaByFile = new Map();
        for (const m of trackMeta) {
          const f = String(m?.file || '').trim();
          const stationName = String(m?.stationName || m?.artist || '').trim();
          const genre = String(m?.genre || '').trim();
          if (f && (stationName || genre)) metaByFile.set(f, { stationName, genre });
        }
        if (metaByFile.size && addedFiles.length) {
          const entries = addedFiles
            .map((f) => ({ file: f, ...(metaByFile.get(f) || {}) }))
            .filter((x) => x.file && (x.stationName || x.genre));
          if (entries.length) {
            const outPath = path.resolve(process.cwd(), 'data', 'radio-queue-map.json');
            await fs.mkdir(path.dirname(outPath), { recursive: true });
            await fs.writeFile(outPath, JSON.stringify({ ts: Date.now(), entries }, null, 2), 'utf8');
          }
        }
      } catch {}

      let playStarted = false;
      // Only auto-play when we replaced the queue and did NOT crop (crop keeps playing).
      if (mode === 'replace' && !didCrop && added > 0) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'play']);
          playStarted = true;
        } catch (_) {}
      }

      let randomEnabled = false;
      if (shuffle) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'random', 'on']);
          randomEnabled = true;
        } catch (_) {}
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
        } catch (e) {
          playlistError = e?.message || String(e);
        }
      }

      let collageGenerated = false;
      let collageError = '';
      if (generateCollage && playlistName && playlistSaved) {
        const localScript = String(
          process.env.MOODE_PLAYLIST_COVER_SCRIPT || path.resolve(process.cwd(), 'scripts/moode-playlist-cover.sh')
        );

        // Prefer promoting the exact preview image the user saw.
        const canPromotePreview = previewCoverBase64 && previewCoverMimeType.includes('jpeg');
        if (canPromotePreview) {
          const moodeUser = String(MOODE_SSH_USER || 'moode');
          const moodeHost = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
          const coverDir = String(process.env.MOODE_PLAYLIST_COVER_DIR || '/var/local/www/imagesw/playlist-covers');
          const safeName = safePlaylistName(playlistName);
          const localTmp = path.join('/tmp', `qw-preview-cover-${process.pid}-${Date.now()}.jpg`);
          const remoteTmp = `/tmp/qw-preview-cover-${process.pid}-${Date.now()}.jpg`;
          const remoteDst = `${coverDir}/${safeName}.jpg`;

          try {
            const imgBuf = Buffer.from(previewCoverBase64, 'base64');
            if (!imgBuf.length) throw new Error('preview image empty');
            await fs.writeFile(localTmp, imgBuf);

            await execFileP('scp', [
              '-q',
              '-o', 'BatchMode=yes',
              '-o', 'ConnectTimeout=6',
              localTmp,
              `${moodeUser}@${moodeHost}:${remoteTmp}`,
            ], { timeout: 20000 });

            const sudoCmd = `sudo -n bash -lc 'set -euo pipefail; mkdir -p -- ${JSON.stringify(coverDir)}; mv -f -- ${JSON.stringify(remoteTmp)} ${JSON.stringify(remoteDst)}; chmod 0644 -- ${JSON.stringify(remoteDst)} 2>/dev/null || true'`;
            const nonSudoCmd = `bash -lc 'set -euo pipefail; mkdir -p -- ${JSON.stringify(coverDir)}; mv -f -- ${JSON.stringify(remoteTmp)} ${JSON.stringify(remoteDst)}; chmod 0644 -- ${JSON.stringify(remoteDst)} 2>/dev/null || true'`;

            try {
              await execFileP('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', `${moodeUser}@${moodeHost}`, sudoCmd], { timeout: 20000 });
            } catch (_) {
              await execFileP('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', `${moodeUser}@${moodeHost}`, nonSudoCmd], { timeout: 20000 });
            }

            collageGenerated = true;
          } catch (e) {
            collageError = e?.message || String(e);
          } finally {
            await fs.unlink(localTmp).catch(() => {});
            await execFileP('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', `${moodeUser}@${moodeHost}`, `rm -f -- ${JSON.stringify(remoteTmp)} >/dev/null 2>&1 || true`], { timeout: 10000 }).catch(() => {});
          }
        }

        if (!collageGenerated) {
          try {
            await execFileP(localScript, [playlistName, '--force'], {
              timeout: 120000,
              env: {
                ...process.env,
                MOODE_SSH_USER: String(MOODE_SSH_USER || 'moode'),
                MOODE_SSH_HOST: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
              },
            });
            collageGenerated = true;
          } catch (e) {
            collageError = e?.message || String(e);
          }
        }
      }

      return res.json({
        ok: true,
        mode,
        keepNowPlaying,
        didCrop,
        didClear,
        shuffle,
        forceRandomOff,
        randomTurnedOff,
        randomEnabled,
        generateCollage,
        requested: tracks.length,
        added,
        failedFiles: failedFiles.slice(0, 50),
        playStarted,
        playlistSaved,
        playlistError,
        collageGenerated,
        collageError,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
