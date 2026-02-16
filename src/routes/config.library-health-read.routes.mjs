import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function sshArgsFor(user, host, extra = []) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', ...extra, `${user}@${host}`];
}

function shQuoteArg(s) {
  const v = String(s ?? '');
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

function mpdQuote(s = '') {
  return `"${String(s).replace(/(["\\])/g, '\\$1')}"`;
}

async function sshBashLc({ user, host, script, timeoutMs = 20000, maxBuffer = 10 * 1024 * 1024 }) {
  return execFileP('ssh', [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(String(script || ''))], {
    timeout: timeoutMs,
    maxBuffer,
  });
}

export function registerConfigLibraryHealthReadRoutes(app, deps) {
  const { requireTrackKey, mpdQueryRaw, getRatingForFile, mpdStickerGetSong } = deps;

  app.get('/config/library-health', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      if (
        typeof mpdQueryRaw !== 'function' ||
        typeof getRatingForFile !== 'function' ||
        typeof mpdStickerGetSong !== 'function'
      ) {
        return res.status(501).json({ ok: false, error: 'library-health dependencies not wired' });
      }

      const sampleLimit = Math.max(10, Math.min(500, Number(req.query?.sampleLimit || 100)));
      const scanLimit =
        req.query?.scanLimit != null
          ? Math.max(100, Math.min(200000, Number(req.query.scanLimit || 100)))
          : Number.MAX_SAFE_INTEGER;
      const started = Date.now();

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const pick = (arr, row) => {
        if (arr.length < sampleLimit) arr.push(row);
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const fmt = '%file%\t%artist%\t%title%\t%album%\t%genre%\t%MUSICBRAINZ_TRACKID%';
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', fmt, 'listall'], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const allFiles = String(stdout || '')
        .split(/\r?\n/)
        .map((ln) => {
          const [file = '', artist = '', title = '', album = '', genre = '', mbid = ''] = ln.split('\t');
          return {
            file: String(file || '').trim(),
            artist: String(artist || '').trim(),
            title: String(title || '').trim(),
            album: String(album || '').trim(),
            genres: String(genre || '').trim() ? [String(genre || '').trim()] : [],
            musicbrainz_trackid: String(mbid || '').trim(),
          };
        })
        .filter((x) => x.file && isAudio(x.file))
        .slice(0, Number.isFinite(scanLimit) ? scanLimit : undefined);

      const summary = {
        totalTracks: 0,
        totalAlbums: 0,
        missingArtwork: 0,
        unrated: 0,
        lowRated1: 0,
        missingMbid: 0,
        missingGenre: 0,
        christmasGenre: 0,
        podcastGenre: 0,
      };
      const genreSet = new Set();
      const genreCounts = new Map();
      const ratingCounts = new Map();

      const samples = {
        unrated: [],
        lowRated1: [],
        missingMbid: [],
        missingGenre: [],
      };

      let scanned = 0;
      for (const b0 of allFiles) {
        const file = String(b0?.file || '').trim();
        if (!file || !isAudio(file)) continue;
        if (scanned >= scanLimit) break;
        scanned += 1;

        summary.totalTracks += 1;

        const b = b0 || { file, genres: [] };

        const artist = String(b.artist || b.albumartist || '').trim();
        const title = String(b.title || '').trim();
        const album = String(b.album || '').trim();

        const genreVals = Array.isArray(b.genres) ? b.genres : [];
        for (const g of genreVals) {
          const raw = String(g || '').trim();
          if (!raw) continue;
          const splitVals = raw.split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean);
          const list = splitVals.length ? splitVals : [raw];
          for (const gg of list) {
            genreSet.add(gg);
            genreCounts.set(gg, Number(genreCounts.get(gg) || 0) + 1);
          }
        }
        const genreBlob = genreVals.join(' | ').trim();

        if (!genreBlob) {
          summary.missingGenre += 1;
          pick(samples.missingGenre, { file, artist, title, album });
        }
        if (/christmas/i.test(genreBlob)) summary.christmasGenre += 1;
        if (/\bpodcast\b/i.test(genreBlob)) summary.podcastGenre += 1;

        const isPodcast = /\bpodcast\b/i.test(genreBlob);

        let rating = 0;
        try {
          rating = Number(await getRatingForFile(file)) || 0;
        } catch (_) {}
        const ratingBucket = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
        ratingCounts.set(String(ratingBucket), Number(ratingCounts.get(String(ratingBucket)) || 0) + 1);

        if (!isPodcast && rating <= 0) {
          summary.unrated += 1;
          pick(samples.unrated, { file, artist, title, album, rating });
        }
        if (rating === 1) {
          summary.lowRated1 += 1;
          pick(samples.lowRated1, { file, artist, title, album, rating });
        }

        const mbTag = String(b.musicbrainz_trackid || '').trim();
        let mbSticker = '';
        if (!mbTag) {
          try {
            mbSticker = String(await mpdStickerGetSong(file, 'mb_trackid') || '').trim();
          } catch (_) {}
        }
        if (!mbTag && !mbSticker) {
          summary.missingMbid += 1;
          pick(samples.missingMbid, { file, artist, title, album });
        }
      }

      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ]
          .map((x) => String(x || '').replace(/\/+/g, '/'))
          .filter(Boolean);
        for (const c of candidates) {
          try {
            await fs.access(c);
            return c;
          } catch (_) {}
        }
        return '';
      };

      const folderSet = new Set(allFiles.map((r) => folderOf(r.file)).filter((f) => f && f !== '(root)'));
      summary.totalAlbums = folderSet.size;

      for (const folder of folderSet) {
        const localFolder = await resolveLocalFolder(folder);
        if (!localFolder) {
          summary.missingArtwork += 1;
          continue;
        }
        const coverPath = path.join(localFolder, 'cover.jpg');
        try {
          await fs.access(coverPath);
        } catch (_) {
          summary.missingArtwork += 1;
        }
      }

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        summary,
        samples,
        genreCounts: Array.from(genreCounts.entries())
          .map(([genre, count]) => ({ genre, count: Number(count || 0) }))
          .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, undefined, { sensitivity: 'base' })),
        ratingCounts: [0, 1, 2, 3, 4, 5].map((r) => ({ rating: r, count: Number(ratingCounts.get(String(r)) || 0) })),
        genreOptions: Array.from(genreSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        sampleLimit,
        scanLimit,
        scannedTracks: summary.totalTracks,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/missing-artwork', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const leafName = (p) => {
        const s = String(p || '');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
      };

      const resolveLocalFolder = async (folder) => {
        const f = String(folder || '').trim().replace(/^\/+/, '');
        if (!f || f === '(root)') return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const resolveLocalPath = async (file) => {
        const f = String(file || '').trim().replace(/^\/+/, '');
        if (!f) return '';
        const candidates = [
          f.startsWith('/mnt/') ? f : '',
          f.startsWith('mnt/') ? '/' + f : '',
          f.startsWith('USB/SamsungMoode/') ? '/mnt/SamsungMoode/' + f.slice('USB/SamsungMoode/'.length) : '',
          f.startsWith('OSDISK/') ? '/mnt/OSDISK/' + f.slice('OSDISK/'.length) : '',
          '/mnt/SamsungMoode/' + f,
          '/mnt/OSDISK/' + f,
        ].map((x) => String(x || '').replace(/\/+/g, '/')).filter(Boolean);

        for (const c of candidates) {
          try { await fs.access(c); return c; } catch (_) {}
        }
        return '';
      };

      const hasEmbeddedArtwork = async (files) => {
        const sample = (Array.isArray(files) ? files : []).slice(0, 3);
        for (const f of sample) {
          const local = await resolveLocalPath(f);
          if (!local) continue;
          try {
            const { stdout } = await execFileP(
              'ffprobe',
              [
                '-v', 'error',
                '-show_entries', 'stream=codec_type:stream_disposition=attached_pic',
                '-of', 'json',
                local,
              ],
              { timeout: 1500 }
            );
            const txt = String(stdout || '');
            if (/"attached_pic"\s*:\s*1/.test(txt)) return true;
          } catch (_) {}
        }
        return false;
      };

      const onlyFolder = String(req.query?.folder || '').trim();

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP(
        'mpc',
        ['-h', mpdHost, '-f', '%file%\t%album%\t%artist%\t%albumartist%', 'listall'],
        { maxBuffer: 64 * 1024 * 1024 }
      );

      const byFolder = new Map();

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', album = '', artist = '', albumArtist = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;

        const folder = folderOf(f);
        if (!byFolder.has(folder)) byFolder.set(folder, { files: [], album: '', artists: new Set() });

        const row = byFolder.get(folder);
        row.files.push(f);

        const a = String(albumArtist || artist || '').trim();
        if (a) row.artists.add(a);

        if (!row.album) row.album = String(album || '').trim();
      }

      const missing = [];

      for (const [folder, row] of byFolder.entries()) {
        if (!folder || folder === '(root)') continue;
        if (onlyFolder && folder !== onlyFolder) continue;

        let hasCover = false;
        const localFolder = await resolveLocalFolder(folder);
        if (localFolder) {
          const coverPath = path.join(localFolder, 'cover.jpg');
          try { await fs.access(coverPath); hasCover = true; } catch (_) {}
        }

        if (!hasCover) {
          const hasEmbedded = await hasEmbeddedArtwork(row.files);
          if (!hasEmbedded) {
            const artists = Array.from(row.artists || []);
            missing.push({
              folder,
              album: row.album || leafName(folder),
              artist: artists.length === 1 ? artists[0] : (artists.length > 1 ? 'Various Artists' : 'Unknown Artist'),
              trackCount: row.files.length,
              files: row.files.slice(0, 200),
            });
          }
        }
      }

      missing.sort((a, b) =>
        `${a.artist} — ${a.album}`.localeCompare(`${b.artist} — ${b.album}`, undefined, { sensitivity: 'base' })
      );

      return res.json({ ok: true, totalMissing: missing.length, filterFolder: onlyFolder || null, albums: missing });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/library-health/album-tracks', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folderWanted = String(req.query?.folder || '').trim();
      if (!folderWanted) return res.status(400).json({ ok: false, error: 'folder is required' });

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP(
        'mpc',
        ['-h', mpdHost, '-f', '%file%\t%track%\t%title%\t%artist%\t%albumartist%\t%album%\t%date%\t%genre%', 'listall'],
        { maxBuffer: 64 * 1024 * 1024 }
      );

      const musicRoot = String(process.env.MPD_MUSIC_ROOT || '/var/lib/mpd/music').replace(/\/$/, '');

      const tracks = [];
      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', track = '', title = '', artist = '', albumartist = '', album = '', date = '', genre = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;
        const ff = folderOf(f);
        if (!(ff === folderWanted || ff.startsWith(`${folderWanted}/`))) continue;

        let rating = 0;
        try {
          const raw = await mpdQueryRaw(`sticker get song ${mpdQuote(f)} rating`);
          const m = String(raw || '').match(/sticker:\s*rating\s*=\s*([0-9]+)/i);
          rating = m ? (Number(m[1]) || 0) : 0;
        } catch {}

        let metaflac = '';
        let performerCurrent = [];
        try {
          if (/\.flac$/i.test(f)) {
            const remotePath = `${musicRoot}/${f}`;
            const pQ = shQuoteArg(remotePath);
            const script = `if [ -f ${pQ} ]; then metaflac --export-tags-to=- ${pQ} 2>/dev/null || true; fi`;
            const { stdout: mfOut } = await sshBashLc({
              user: String(MOODE_SSH_USER || 'moode'),
              host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
              script,
              timeoutMs: 8000,
            });
            const rawTags = String(mfOut || '').split(/\r?\n/).map((ln) => String(ln || '').trim()).filter(Boolean);
            const sortedTags = rawTags.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            metaflac = sortedTags.join('\n');
            performerCurrent = sortedTags
              .filter((ln) => /^performer=/i.test(ln))
              .map((ln) => `PERFORMER=${ln.split('=').slice(1).join('=').trim()}`);
          }
        } catch {}

        tracks.push({
          file: f,
          track: String(track || '').trim(),
          title: String(title || '').trim(),
          artist: String(artist || albumartist || '').trim(),
          album: String(album || '').trim(),
          date: String(date || '').trim(),
          genre: String(genre || '').trim(),
          rating,
          performerCurrent,
          metaflac,
        });
      }

      tracks.sort((a, b) => {
        const ta = Number.parseInt(String(a.track || '').replace(/[^0-9].*$/, ''), 10);
        const tb = Number.parseInt(String(b.track || '').replace(/[^0-9].*$/, ''), 10);
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        return `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, undefined, { sensitivity: 'base' });
      });

      return res.json({ ok: true, folder: folderWanted, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
