import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigLibraryHealthGenreRoutes(app, deps) {
  const { requireTrackKey } = deps;

  // --- library health: list unique genres present within an album folder ---
  app.get('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let rows = [];
      try {
        const { stdout } = await execFileP(
          'mpc',
          ['-h', mpdHost, '-f', '%file%\t%genre%', 'find', 'base', folder],
          { maxBuffer: 64 * 1024 * 1024 }
        );
        rows = String(stdout || '')
          .split(/\r?\n/)
          .map((ln) => {
            const [file = '', genre = ''] = ln.split('\t');
            return { file: String(file || '').trim(), genre: String(genre || '').trim() };
          })
          .filter((r) => r.file);
      } catch (_) {}

      if (!rows.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%genre%', 'listall'], {
          maxBuffer: 64 * 1024 * 1024,
        });
        rows = String(stdout || '')
          .split(/\r?\n/)
          .map((ln) => {
            const [file = '', genre = ''] = ln.split('\t');
            return { file: String(file || '').trim(), genre: String(genre || '').trim() };
          })
          .filter((r) => r.file && r.file.startsWith(folder + '/'));
      }

      const genres = new Set();
      for (const r of rows) {
        for (const g of String(r.genre || '')
          .split(/[;,|/]/)
          .map((x) => String(x || '').trim())
          .filter(Boolean)) {
          genres.add(g);
        }
      }

      return res.json({
        ok: true,
        folder,
        trackCount: rows.length,
        genres: Array.from(genres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: set GENRE tag for all FLACs in an album folder ---
  app.post('/config/library-health/album-genre', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.body?.folder || '').trim();
      const genre = String(req.body?.genre || '').trim();

      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!genre) return res.status(400).json({ ok: false, error: 'genre is required' });

      const mpdHost = String(MPD_HOST || '10.0.0.254');

      let files = [];
      try {
        const { stdout } = await execFileP(
          'mpc',
          ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder],
          { maxBuffer: 64 * 1024 * 1024 }
        );
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}

      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall'], {
          maxBuffer: 64 * 1024 * 1024,
        });
        files = String(stdout || '')
          .split(/\r?\n/)
          .map((x) => String(x || '').trim())
          .filter((f) => f && f.startsWith(folder + '/'));
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

      let updated = 0;
      let skipped = 0;
      const updatedFiles = [];
      const skippedFiles = [];

      for (const f of files) {
        const local = await resolveLocalPath(f);
        if (!local || !/\.flac$/i.test(local)) {
          skipped += 1;
          skippedFiles.push(f);
          continue;
        }
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

      return res.json({
        ok: true,
        folder,
        genre,
        requested: files.length,
        updated,
        skipped,
        updatedFiles,
        skippedFiles: skippedFiles.slice(0, 200),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
