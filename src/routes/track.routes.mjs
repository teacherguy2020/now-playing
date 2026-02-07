import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function parseRange(rangeHeader, size) {
  const m = String(rangeHeader || '').match(/bytes=(\d*)-(\d*)/i);
  if (!m) return null;

  let start = m[1] ? Number.parseInt(m[1], 10) : NaN;
  let end = m[2] ? Number.parseInt(m[2], 10) : NaN;

  if (!Number.isFinite(start) && Number.isFinite(end)) {
    const n = end;
    if (!(n > 0)) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else if (Number.isFinite(start) && !Number.isFinite(end)) {
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0) return null;
  if (start > end) return null;
  if (start >= size) return null;

  end = Math.min(end, size - 1);
  return { start, end };
}

function serveFileWithRange(req, res, absPath, contentType) {
  const stat = fs.statSync(absPath);
  const size = stat.size;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', size);
    fs.createReadStream(absPath).pipe(res);
    return;
  }

  const r = parseRange(range, size);
  if (!r) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${size}`);
    res.end();
    return;
  }

  const { start, end } = r;
  const chunkSize = (end - start) + 1;

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', chunkSize);

  fs.createReadStream(absPath, { start, end }).pipe(res);
}

function ensureDirSync(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function cacheKeyFor(mpdFile, startSec) {
  const raw = `${mpdFile}||t=${Math.floor(startSec || 0)}`;
  return Buffer.from(raw, 'utf8').toString('base64').replace(/[/+=]/g, '_');
}

async function transcodeToMp3File({ inputPath, outputPath, startSec }) {
  const tmp = outputPath + '.part';
  try { fs.unlinkSync(tmp); } catch {}

  const args = ['-hide_banner', '-loglevel', 'error'];
  if (startSec > 0) args.push('-ss', String(startSec));

  args.push(
    '-i', inputPath,
    '-vn',
    '-map', '0:a:0',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    tmp
  );

  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let errTxt = '';
    ff.stderr.on('data', (d) => { errTxt += d.toString('utf8'); });

    ff.on('error', reject);
    ff.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed code=${code} ${errTxt.slice(0, 300)}`));
    });
  });

  fs.renameSync(tmp, outputPath);
}

export function registerTrackRoutes(app, deps) {
  const {
    ENABLE_ALEXA,
    TRANSCODE_TRACKS,
    TRACK_CACHE_DIR,
    requireTrackKey,
    isStreamPath,
    isAirplayFile,
    mpdFileToLocalPath,
    safeIsFile,
    log,
  } = deps;

  app.get('/track', async (req, res) => {
    if (!ENABLE_ALEXA) return res.status(404).end();

    try {
      if (!requireTrackKey(req, res)) return;

      const mpdFile = String(req.query.file || '').trim();
      if (!mpdFile) return res.status(400).send('Missing ?file=');

      if (isStreamPath(mpdFile) || isAirplayFile(mpdFile)) {
        return res.status(400).send('Not a local track');
      }

      const localPath = mpdFileToLocalPath(mpdFile);
      if (!localPath || !safeIsFile(localPath)) {
        return res.status(404).send('Track not found');
      }

      const startSec = Math.max(0, Number.parseFloat(String(req.query.t || '0')) || 0);

      if (localPath.toLowerCase().endsWith('.mp3') && startSec === 0) {
        return serveFileWithRange(req, res, localPath, 'audio/mpeg');
      }

      if (!TRANSCODE_TRACKS) {
        if (startSec > 0) return res.status(400).send('Seek requires transcoding');

        const ext = localPath.toLowerCase();
        const ct =
          ext.endsWith('.flac') ? 'audio/flac' :
          ext.endsWith('.wav') ? 'audio/wav' :
          ext.endsWith('.aac') ? 'audio/aac' :
          ext.endsWith('.m4a') ? 'audio/mp4' :
          ext.endsWith('.mp3') ? 'audio/mpeg' :
          'application/octet-stream';

        return serveFileWithRange(req, res, localPath, ct);
      }

      ensureDirSync(TRACK_CACHE_DIR);
      const key = cacheKeyFor(mpdFile, startSec);
      const cachedMp3 = path.join(TRACK_CACHE_DIR, key + '.mp3');

      if (!safeIsFile(cachedMp3)) {
        log.debug('[track] cache miss → transcoding:', mpdFile, 't=', startSec);
        await transcodeToMp3File({ inputPath: localPath, outputPath: cachedMp3, startSec });
      }

      return serveFileWithRange(req, res, cachedMp3, 'audio/mpeg');
    } catch (e) {
      console.error('/track error:', e?.message || String(e));
      try { res.status(500).send('track failed'); } catch {}
    }
  });
}
