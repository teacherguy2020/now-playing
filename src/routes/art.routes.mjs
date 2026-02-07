import fs from 'node:fs';
import sharp from 'sharp';

async function fetchMoodeCoverBytes(ref, deps) {
  const { agentForUrl, normalizeCoverUrl, MOODE_BASE_URL, dispatcherForUrl } = deps;

  const s = String(ref || '').trim();
  if (!s) throw new Error('empty cover ref');

  if (/^https?:\/\//i.test(s)) {
    const resp = await fetch(s, { agent: agentForUrl(s), cache: 'no-store' });
    if (!resp.ok) throw new Error(`cover fetch failed: HTTP ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }

  const url = normalizeCoverUrl(s.startsWith('/') ? s : `/${s}`, MOODE_BASE_URL);
  const resp = await fetch(url, { dispatcher: dispatcherForUrl(url), cache: 'no-store' });
  if (!resp.ok) throw new Error(`cover fetch failed: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function sendJpeg(res, buf, max) {
  const out = max
    ? await sharp(buf)
      .rotate()
      .resize(max, max, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    : await sharp(buf)
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.status(200).send(out);
}

async function serveCachedOrResizedSquare(res, best, size, cachePathForKey, deps) {
  const { normalizeArtKey, updateArtCacheIfNeeded, safeIsFile } = deps;

  const key = normalizeArtKey(best);
  if (key) {
    await updateArtCacheIfNeeded(best);

    const p = cachePathForKey(key);
    if (safeIsFile(p)) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-store');
      return res.status(200).send(await fs.promises.readFile(p));
    }
  }

  const buf = await fetchMoodeCoverBytes(best, deps);
  return sendJpeg(res, buf, size);
}

async function serveCachedOrBlurredBg(res, best, size, cacheBgPathForKey, deps) {
  const { normalizeArtKey, updateArtCacheIfNeeded, safeIsFile } = deps;

  const key = normalizeArtKey(best);
  if (key) {
    await updateArtCacheIfNeeded(best);

    const p = cacheBgPathForKey(key);
    if (safeIsFile(p)) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-store');
      return res.status(200).send(await fs.promises.readFile(p));
    }
  }

  const buf = await fetchMoodeCoverBytes(best, deps);
  const out = await sharp(buf)
    .rotate()
    .resize(size, size, { fit: 'cover' })
    .blur(18)
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(out);
}

export function registerArtRoutes(app, deps) {
  const {
    MOODE_BASE_URL,
    fetchJson,
    resolveBestArtForCurrentSong,
    normalizeArtKey,
    updateArtCacheIfNeeded,
    artPath640ForKey,
    artPathBgForKey,
    safeIsFile,
  } = deps;

  app.get('/art/track_640.jpg', async (req, res) => {
    try {
      const file = String(req.query.file || '').trim();
      let src = String(req.query.src || '').trim();

      if (file) src = `${MOODE_BASE_URL}/coverart.php/${encodeURIComponent(file)}`;
      if (!src) return res.status(400).send('Missing ?file= or ?src=');

      const buf = await fetchMoodeCoverBytes(src, deps);
      return sendJpeg(res, buf, 640);
    } catch (e) {
      console.warn('[art/track_640] failed:', e?.message || String(e));
      return res.status(404).end();
    }
  });

  app.get('/art/current_320.jpg', async (req, res) => {
    try {
      const v = String(req.query.v || '').trim();
      if (v) {
        const key = normalizeArtKey(v);
        if (!key) return res.status(404).end();

        await updateArtCacheIfNeeded(v);

        const p640 = artPath640ForKey(key);
        if (safeIsFile(p640)) {
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'no-store');
          return res.status(200).send(await fs.promises.readFile(p640));
        }

        const buf = await fetchMoodeCoverBytes(key, deps);
        return sendJpeg(res, buf, 640);
      }

      const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);
      const best = await resolveBestArtForCurrentSong(song, statusRaw);
      if (!best) return res.status(404).end();

      return serveCachedOrResizedSquare(res, best, 640, artPath640ForKey, deps);
    } catch (e) {
      console.warn('[art/current_320] failed:', e?.message || String(e));
      return res.status(404).end();
    }
  });

  app.get('/art/current_640.jpg', async (req, res) => {
    try {
      const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);
      const best = await resolveBestArtForCurrentSong(song, statusRaw);
      if (!best) return res.status(404).end();

      const key = normalizeArtKey(best);
      if (key) {
        await updateArtCacheIfNeeded(best);
        const p640 = artPath640ForKey(key);
        if (safeIsFile(p640)) {
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'no-store');
          return res.status(200).send(await fs.promises.readFile(p640));
        }
      }

      const buf = await fetchMoodeCoverBytes(best, deps);
      const out640 = await sharp(buf)
        .rotate()
        .resize(640, 640, { fit: 'cover' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-store');
      return res.status(200).send(out640);
    } catch (e) {
      console.warn('[art/current_640] failed:', e?.message || String(e));
      return res.status(404).end();
    }
  });

  app.get('/art/current_bg_640_blur.jpg', async (req, res) => {
    try {
      const v = String(req.query.v || '').trim();
      if (v) {
        const key = normalizeArtKey(v);
        if (!key) return res.status(404).end();

        await updateArtCacheIfNeeded(v);

        const pbg = artPathBgForKey(key);
        if (safeIsFile(pbg)) {
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'no-store');
          return res.status(200).send(await fs.promises.readFile(pbg));
        }

        return serveCachedOrBlurredBg(res, key, 640, artPathBgForKey, deps);
      }

      const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);
      const best = await resolveBestArtForCurrentSong(song, statusRaw);
      if (!best) return res.status(404).end();

      return serveCachedOrBlurredBg(res, best, 640, artPathBgForKey, deps);
    } catch (e) {
      console.warn('[art/current_bg] failed:', e?.message || String(e));
      return res.status(404).end();
    }
  });
}
