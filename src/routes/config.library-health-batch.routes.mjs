import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigLibraryHealthBatchRoutes(app, deps) {
  const { requireTrackKey, setRatingForFile } = deps;

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

      const mpdHost = String(MPD_HOST || '10.0.0.254');
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
          await execFileP('metaflac', ['--remove-tag=GENRE', `--set-tag=GENRE=${genre}`, local]);
          updated += 1;
          updatedFiles.push(file);
        } catch (e) {
          errors.push({ file, error: e?.message || String(e) });
        }
      }

      try {
        const mpdHost = String(MPD_HOST || '10.0.0.254');
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
}
