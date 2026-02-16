import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { MPD_HOST, MOODE_SSH_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigQueueWizardBasicRoutes(app, deps) {
  const { requireTrackKey } = deps;

  // --- queue wizard options (artists/genres) ---
  app.get('/config/queue-wizard/options', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%artist%\t%albumartist%\t%album%\t%genre%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });

      const artists = new Set();
      const albumArtistByName = new Map();
      const genres = new Set();

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [artist = '', albumArtist = '', album = '', genreRaw = ''] = ln.split('\t');

        const a = String(artist || albumArtist || '').trim();
        if (a) artists.add(a);

        const alb = String(album || '').trim();
        if (alb && !albumArtistByName.has(alb)) albumArtistByName.set(alb, a);

        for (const g of String(genreRaw || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim())
          .filter(Boolean)) {
          genres.add(g);
        }
      }

      const albums = Array.from(albumArtistByName.entries())
        .map(([albumName, artistName]) => ({
          value: String(albumName || ''),
          label: artistName ? `${String(artistName)} — ${String(albumName)}` : String(albumName || ''),
          sortArtist: String(artistName || '').toLowerCase(),
          sortAlbum: String(albumName || '').toLowerCase(),
        }))
        .sort((a, b) => {
          const aa = a.sortArtist.localeCompare(b.sortArtist, undefined, { sensitivity: 'base' });
          if (aa !== 0) return aa;
          return a.sortAlbum.localeCompare(b.sortAlbum, undefined, { sensitivity: 'base' });
        })
        .map(({ value, label }) => ({ value, label }));

      return res.json({
        ok: true,
        moodeHost: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
        genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        artists: Array.from(artists).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        albums,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/playlists', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'lsplaylists']);
      const isPodcastName = (name) => /podcast/i.test(String(name || ''));
      const isPodcastFile = (f) => {
        const s = String(f || '').toLowerCase();
        return /\/podcasts?\//.test(s) || /\bpodcast\b/.test(s);
      };

      const names = String(stdout || '')
        .split(/\r?\n/)
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      const kept = [];
      for (const name of names) {
        if (isPodcastName(name)) continue;
        let skip = false;
        try {
          const r = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'playlist', name], { maxBuffer: 8 * 1024 * 1024 });
          const files = String(r?.stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
          if (files.length && files.every((f) => isPodcastFile(f))) skip = true;
        } catch (_) {
          // if inspection fails, keep name rather than hiding unexpectedly
        }
        if (!skip) kept.push(name);
      }

      const playlists = kept.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return res.json({ ok: true, count: playlists.length, playlists });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/queue-wizard/load-playlist', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const playlist = String(req.body?.playlist || '').trim();
      const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
      const play = req.body?.play !== false;
      if (!playlist) return res.status(400).json({ ok: false, error: 'playlist is required' });
      if (!['replace', 'append'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be replace|append' });

      if (mode === 'replace') {
        await execFileP('mpc', ['-h', mpdHost, 'clear']);
      }
      await execFileP('mpc', ['-h', mpdHost, 'load', playlist]);
      if (play) {
        await execFileP('mpc', ['-h', mpdHost, 'play']);
      }
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'playlist']);
      const added = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean).length;
      return res.json({ ok: true, playlist, mode, play, added });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/queue-wizard/playlist-preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const playlist = String(req.query?.playlist || '').trim();
      if (!playlist) return res.status(400).json({ ok: false, error: 'playlist is required' });

      const fmt = '%artist%\t%title%\t%album%\t%file%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'playlist', playlist]);
      const tracks = String(stdout || '')
        .split(/\r?\n/)
        .map((ln) => String(ln || '').trim())
        .filter(Boolean)
        .map((ln) => {
          const [artist = '', title = '', album = '', file = ''] = ln.split('\t');
          const f = String(file || '').trim();
          const t = String(title || '').trim() || (f ? path.basename(f) : '');
          return {
            artist: String(artist || '').trim(),
            title: t,
            album: String(album || '').trim(),
            file: f,
          };
        })
        .filter((x) => x.file);

      return res.json({ ok: true, playlist, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
