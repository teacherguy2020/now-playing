import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigLibraryHealthArtRoutes(app, deps) {
  const { requireTrackKey } = deps;

  // --- library health: fetch cover.jpg for a folder (base64) ---
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
      ]
        .map((x) => String(x || '').replace(/\/+/g, '/'))
        .filter(Boolean);

      let coverPath = '';
      for (const c of localCandidates) {
        const p = path.join(c, 'cover.jpg');
        try {
          await fs.access(p);
          coverPath = p;
          break;
        } catch (_) {}
      }

      if (!coverPath) return res.json({ ok: true, folder, hasCover: false });

      const buf = await fs.readFile(coverPath);
      return res.json({
        ok: true,
        folder,
        hasCover: true,
        mimeType: 'image/jpeg',
        dataBase64: buf.toString('base64'),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: set cover.jpg and/or embed artwork into FLACs for a folder ---
  app.post('/config/library-health/album-art', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.body?.folder || '').trim();
      const base64In = String(req.body?.imageBase64 || '').trim();
      const mode = String(req.body?.mode || 'both').trim().toLowerCase();

      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!base64In) return res.status(400).json({ ok: false, error: 'imageBase64 is required' });
      if (!['cover', 'embed', 'both'].includes(mode)) {
        return res.status(400).json({ ok: false, error: 'mode must be cover|embed|both' });
      }

      const b64 = base64In.includes(',') ? base64In.split(',').pop() : base64In;
      let imgBuf = Buffer.from(String(b64 || ''), 'base64');
      if (!imgBuf.length) return res.status(400).json({ ok: false, error: 'invalid imageBase64' });

      const ts = Date.now();
      const tmpPath = path.join('/tmp', `library-health-art-${ts}.jpg`);
      const tmpSquarePath = path.join('/tmp', `library-health-art-square-${ts}.jpg`);
      await fs.writeFile(tmpPath, imgBuf);

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
        // keep original
      }

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      let files = [];
      try {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'find', 'base', folder]);
        files = String(stdout || '').split(/\r?\n/).map((x) => String(x || '').trim()).filter(Boolean);
      } catch (_) {}

      if (!files.length) {
        const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall']);
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

      return res.json({
        ok: true,
        folder,
        mode,
        totalFiles: files.length,
        updatedTracks,
        skippedTracks,
        skipped: skipped.slice(0, 200),
        coverUpdated,
        coverCreated,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
