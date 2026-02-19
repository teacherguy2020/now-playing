import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigLibraryHealthArtRoutes(app, deps) {
  const { requireTrackKey } = deps;

  async function getAlbumSeedFromFolder(folder = '') {
    const mpdHost = String(MPD_HOST || '10.0.0.254');
    try {
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%artist%\t%albumartist%\t%album%', 'find', 'base', String(folder || '').trim()]);
      const first = String(stdout || '').split(/\r?\n/).find((ln) => String(ln || '').trim()) || '';
      const [artist = '', albumArtist = '', album = ''] = first.split('\t');
      return {
        artist: String(artist || albumArtist || '').trim(),
        album: String(album || '').trim(),
      };
    } catch {
      return { artist: '', album: '' };
    }
  }

  // --- library health: search high-quality artwork candidates for an album folder ---
  app.get('/config/library-health/album-art-search', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const folder = String(req.query?.folder || '').trim();
      if (!folder) return res.status(400).json({ ok: false, error: 'folder is required' });

      const { artist, album } = await getAlbumSeedFromFolder(folder);
      if (!artist || !album) return res.status(404).json({ ok: false, error: 'Could not resolve album artist/name from folder' });

      const term = `${artist} ${album}`.trim();
      const u = `https://itunes.apple.com/search?entity=album&limit=10&term=${encodeURIComponent(term)}`;
      const r = await fetch(u, {
        headers: { 'user-agent': 'now-playing-next/1.0 (+https://moode.brianwis.com)' },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ ok: false, error: `iTunes HTTP ${r.status}` });

      const rows = Array.isArray(j?.results) ? j.results : [];
      const candidates = rows
        .map((it) => {
          const artistName = String(it?.artistName || '').trim();
          const albumName = String(it?.collectionName || '').trim();
          const art100 = String(it?.artworkUrl100 || '').trim();
          const hi = art100
            ? art100.replace(/\/[0-9]+x[0-9]+bb\./i, '/3000x3000bb.')
            : '';
          return { artistName, albumName, art100, hiResUrl: hi, collectionViewUrl: String(it?.collectionViewUrl || '').trim() };
        })
        .filter((x) => x.hiResUrl)
        .filter((x) => {
          const a = x.artistName.toLowerCase();
          const al = x.albumName.toLowerCase();
          return a.includes(artist.toLowerCase().split(' ')[0]) && al.includes(album.toLowerCase().split(' ')[0]);
        });

      return res.json({ ok: true, folder, artist, album, count: candidates.length, candidates });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --- library health: fetch remote artwork URL and return base64 for preview/apply ---
  app.get('/config/library-health/album-art-fetch', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const url = String(req.query?.url || '').trim();
      if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'valid url is required' });

      const r = await fetch(url, { headers: { 'user-agent': 'now-playing-next/1.0 (+https://moode.brianwis.com)' } });
      if (!r.ok) return res.status(502).json({ ok: false, error: `image fetch HTTP ${r.status}` });
      const ab = await r.arrayBuffer();
      const buf = Buffer.from(ab);
      if (!buf.length) return res.status(502).json({ ok: false, error: 'empty image response' });

      const ct = String(r.headers.get('content-type') || 'image/jpeg');
      return res.json({ ok: true, mimeType: ct, dataBase64: buf.toString('base64') });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

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
