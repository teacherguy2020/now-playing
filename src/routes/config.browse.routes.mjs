import { MPD_HOST } from '../config.mjs';
import { getBrowseIndex } from '../lib/browse-index.mjs';

export function registerConfigBrowseRoutes(app, deps) {
  const { requireTrackKey } = deps;

  // Warm browse index in background shortly after API startup (non-blocking).
  setTimeout(() => {
    const mpdHost = String(MPD_HOST || 'moode.local');
    getBrowseIndex(mpdHost).catch(() => null);
  }, 1500);

  app.get('/config/browse/stats', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost);
      return res.json({ ok: true, builtAt: String(idx?.builtAt || ''), counts: idx?.counts || {} });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/browse/rebuild', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost, { force: true });
      return res.json({ ok: true, builtAt: String(idx?.builtAt || ''), counts: idx?.counts || {} });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/browse/artists', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const q = String(req.query?.q || '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(5000, Number(req.query?.limit || 200) || 200));
      const offset = Math.max(0, Number(req.query?.offset || 0) || 0);
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost);
      let artists = Array.isArray(idx?.artists) ? idx.artists : [];
      if (q) artists = artists.filter((a) => String(a?.name || '').toLowerCase().includes(q));
      const total = artists.length;
      artists = artists.slice(offset, offset + limit);
      return res.json({ ok: true, offset, limit, total, count: artists.length, artists });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/browse/albums', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.query?.artist || '').trim().toLowerCase();
      const q = String(req.query?.q || '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(10000, Number(req.query?.limit || 3000) || 3000));
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost);
      let albums = Array.isArray(idx?.albums) ? idx.albums : [];
      if (artist) albums = albums.filter((a) => String(a?.artist || '').trim().toLowerCase() === artist);
      if (q) albums = albums.filter((a) => (`${String(a?.artist || '')} ${String(a?.album || '')}`).toLowerCase().includes(q));
      albums = albums.slice(0, limit);
      return res.json({ ok: true, count: albums.length, albums });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/browse/artist-albums', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const artist = String(req.query?.artist || '').trim();
      if (!artist) return res.status(400).json({ ok: false, error: 'artist is required' });
      const artLc = artist.toLowerCase();
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost);
      const byAlbum = new Map();
      for (const t of (Array.isArray(idx?.tracks) ? idx.tracks : [])) {
        const rowArtist = String(t?.artist || t?.albumArtist || '').trim();
        if (rowArtist.toLowerCase() !== artLc) continue;
        const albumName = String(t?.album || '').trim();
        const fileName = String(t?.file || '').trim();
        if (!albumName || !fileName) continue;
        const key = albumName.toLowerCase();
        if (!byAlbum.has(key)) {
          const i = fileName.lastIndexOf('/');
          const folder = i > 0 ? fileName.slice(0, i) : '';
          byAlbum.set(key, {
            album: albumName,
            artist: rowArtist || artist,
            genre: String(t?.genre || '').trim(),
            sampleFile: fileName,
            folder,
            thumbUrl: `/config/library-health/album-thumb?folder=${encodeURIComponent(String(folder || ''))}&file=${encodeURIComponent(String(fileName || ''))}`,
            count: 1,
          });
        } else {
          byAlbum.get(key).count += 1;
        }
      }
      const albums = Array.from(byAlbum.values()).sort((a, b) => String(a.album || '').localeCompare(String(b.album || ''), undefined, { sensitivity: 'base' }));
      return res.json({ ok: true, artist, count: albums.length, albums });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/browse/album-tracks', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const album = String(req.query?.album || '').trim();
      const artist = String(req.query?.artist || '').trim();
      if (!album) return res.status(400).json({ ok: false, error: 'album is required' });
      const albLc = album.toLowerCase();
      const artLc = artist.toLowerCase();
      const mpdHost = String(MPD_HOST || 'moode.local');
      const idx = await getBrowseIndex(mpdHost);
      const tracks = (Array.isArray(idx?.tracks) ? idx.tracks : [])
        .filter((t) => String(t?.album || '').trim().toLowerCase() === albLc)
        .filter((t) => !artLc || String(t?.artist || t?.albumArtist || '').trim().toLowerCase() === artLc)
        .map((t) => ({
          file: String(t?.file || '').trim(),
          track: String(t?.track || '').trim(),
          title: String(t?.title || '').trim(),
          artist: String(t?.artist || t?.albumArtist || artist || '').trim(),
          album: String(t?.album || album || '').trim(),
        }))
        .filter((t) => !!t.file)
        .sort((a, b) => {
          const ta = Number.parseInt(String(a.track || '').replace(/[^0-9].*$/, ''), 10);
          const tb = Number.parseInt(String(b.track || '').replace(/[^0-9].*$/, ''), 10);
          if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
          return `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, undefined, { sensitivity: 'base' });
        });
      return res.json({ ok: true, album, artist, count: tracks.length, tracks });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
