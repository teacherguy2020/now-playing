import crypto from 'node:crypto';
import sharp from 'sharp';

function uniqCleanTracks(arr = []) {
  return Array.from(new Set((arr || [])
    .map((x) => String(x ?? '').replace(/\r/g, '').trim())
    .map((s) => s.replace(/^"(.*)"$/, '$1'))
    .filter(Boolean)));
}

function apiBases(req) {
  const proto = String(req?.protocol || 'http');
  const host = String(req?.get?.('host') || '').trim();
  const localPort = Number(req?.socket?.localPort || process.env.PORT || 3101) || 3101;
  const out = [`${proto}://127.0.0.1:${localPort}`];
  if (host) out.push(`${proto}://${host}`);
  return Array.from(new Set(out));
}

async function fetchTrackArtBuffer(file, req) {
  const qs = `file=${encodeURIComponent(String(file || '').trim())}`;
  for (const base of apiBases(req)) {
    const url = `${base}/art/track_640.jpg?${qs}`;
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const ct = String(r.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('image')) continue;
      const ab = await r.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length < 1024) continue;
      return buf;
    } catch {}
  }
  return null;
}

function shuffleInPlace(arr = []) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

async function buildCollageJpeg({ tracks = [], req, forceSingle = false, randomize = false }) {
  const files = uniqCleanTracks(tracks);
  if (!files.length) throw new Error('tracks[] is required');

  const seen = new Set();
  const arts = [];

  // Spread picks across list; stop after enough unique covers.
  const idxs = [];
  const n = files.length;
  const targetSamples = Math.min(Math.max(n, 1), 24);
  for (let i = 0; i < targetSamples; i++) idxs.push(Math.floor((i * n) / targetSamples));
  for (let i = 0; i < n && arts.length < 8; i++) idxs.push(i);

  for (const i of idxs) {
    if (arts.length >= 8) break;
    const f = files[Math.max(0, Math.min(n - 1, i))];
    const buf = await fetchTrackArtBuffer(f, req);
    if (!buf) continue;
    const h = crypto.createHash('sha1').update(buf).digest('hex');
    if (seen.has(h)) continue;
    seen.add(h);
    arts.push(buf);
  }

  if (!arts.length) throw new Error('No artwork found for supplied tracks');

  if (randomize && arts.length > 1) shuffleInPlace(arts);

  if (forceSingle || arts.length === 1) {
    return sharp(arts[0]).resize(600, 600, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  }

  const slots = [arts[0], arts[1] || arts[0], arts[2] || arts[0], arts[3] || arts[1] || arts[0]];
  const tiles = await Promise.all(slots.map((b) => sharp(b).resize(300, 300, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer()));

  return sharp({
    create: { width: 600, height: 600, channels: 3, background: '#0b1220' },
  })
    .composite([
      { input: tiles[0], left: 0, top: 0 },
      { input: tiles[1], left: 300, top: 0 },
      { input: tiles[2], left: 0, top: 300 },
      { input: tiles[3], left: 300, top: 300 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export function registerConfigQueueWizardCollageRoute(app, deps) {
  const { requireTrackKey } = deps;

  app.post('/config/queue-wizard/collage-preview', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const playlistName = String(req.body?.playlistName || '').trim() || null;
      const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
      const forceSingle = Boolean(req.body?.forceSingle);
      const randomize = Boolean(req.body?.randomize);

      const jpg = await buildCollageJpeg({ tracks, req, forceSingle, randomize });
      return res.json({
        ok: true,
        playlistName,
        mimeType: 'image/jpeg',
        dataBase64: jpg.toString('base64'),
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        reason: 'preview_failed',
        error: e?.message || String(e),
      });
    }
  });
}
