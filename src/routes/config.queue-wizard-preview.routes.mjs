import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigQueueWizardPreviewRoute(app, deps) {
  const { requireTrackKey, getRatingForFile } = deps;
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || `${process.cwd()}/config/now-playing.config.json`;

  async function isRatingsEnabled() {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return Boolean(cfg?.features?.ratings ?? true);
    } catch {
      return true;
    }
  }

  app.post('/config/queue-wizard/preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const wantedGenres = Array.isArray(req.body?.genres)
        ? req.body.genres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const wantedArtists = Array.isArray(req.body?.artists)
        ? req.body.artists.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const wantedAlbums = Array.isArray(req.body?.albums)
        ? req.body.albums.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const excludeGenres = Array.isArray(req.body?.excludeGenres)
        ? req.body.excludeGenres.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
        : [];

      const ratingsEnabled = await isRatingsEnabled();
      const minRatingRaw = Math.max(0, Math.min(5, Number(req.body?.minRating || 0)));
      const minRating = ratingsEnabled ? minRatingRaw : 0;
      const maxTracks = Math.max(1, Math.min(5000, Number(req.body?.maxTracks || 250)));

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%albumartist%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });

      const tracks = [];

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;

        const [file = '', artist = '', title = '', album = '', albumartist = '', genreRaw = ''] = ln.split('\t');

        const f = String(file || '').trim();
        if (!f) continue;

        const genreTokens = String(genreRaw || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim().toLowerCase())
          .filter(Boolean);

        const a = String(artist || '').trim().toLowerCase();
        const aa = String(albumartist || '').trim().toLowerCase();
        const alb = String(album || '').trim().toLowerCase();

        if (wantedGenres.length && !wantedGenres.some((g) => genreTokens.includes(g))) continue;
        if (wantedArtists.length && !(wantedArtists.includes(a) || wantedArtists.includes(aa))) continue;
        if (wantedAlbums.length && !wantedAlbums.includes(alb)) continue;
        if (excludeGenres.length && excludeGenres.some((g) => genreTokens.includes(g))) continue;

        if (minRating > 0 && typeof getRatingForFile === 'function') {
          let rating = 0;
          try {
            rating = Number(await getRatingForFile(f)) || 0;
          } catch (_) {}
          if (rating < minRating) continue;
        }

        tracks.push({
          file: f,
          artist: String(artist || ''),
          title: String(title || ''),
          album: String(album || ''),
          albumartist: String(albumartist || ''),
          genre: String(genreRaw || ''),
        });

        if (tracks.length >= maxTracks) break;
      }

      return res.json({ ok: true, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
