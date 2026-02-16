import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

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

      const keepNowPlaying =
        req.body?.keepNowPlaying === true ||
        req.body?.crop === true ||
        String(req.body?.keepNowPlaying || '').toLowerCase() === 'true' ||
        String(req.body?.crop || '').toLowerCase() === 'true';

      const tracks = Array.isArray(req.body?.tracks)
        ? req.body.tracks.map((x) => String(x || '').trim()).filter(Boolean)
        : [];

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

      for (const file of tracks) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'add', file]);
          added += 1;
        } catch (_) {
          failedFiles.push(file);
        }
      }

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

        try {
          await execFileP(localScript, [playlistName], {
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
