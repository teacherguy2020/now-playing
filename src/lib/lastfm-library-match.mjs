import { getBrowseIndex } from './browse-index.mjs';

function norm(s = '') {
  return String(s || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’`´]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function createLastfmIndexResolver({ mpdHost = 'moode.local', baseUrl = '', trackKey = '' } = {}) {
  const idx = await getBrowseIndex(String(mpdHost || 'moode.local'));
  const tracks = Array.isArray(idx?.tracks) ? idx.tracks : [];

  const byTrackArtist = new Map();
  const byTrackAlbumArtist = new Map();
  const byArtist = new Map();
  const byAlbumTrackArtist = new Map();
  const byAlbumArtist = new Map();

  for (const t of tracks) {
    const file = String(t?.file || '').trim();
    if (!file) continue;
    const trackArtist = String(t?.artist || '').trim();
    const albumArtist = String(t?.albumArtist || t?.artist || '').trim();
    const title = String(t?.title || '').trim();
    const album = String(t?.album || '').trim();

    const trackArtistKey = norm(trackArtist);
    const albumArtistKey = norm(albumArtist);
    if (trackArtistKey && !byArtist.has(trackArtistKey)) byArtist.set(trackArtistKey, t);
    if (albumArtistKey && !byArtist.has(albumArtistKey)) byArtist.set(albumArtistKey, t);

    const trackKey = `${norm(title)}|${trackArtistKey}`;
    if (title && trackArtistKey && !byTrackArtist.has(trackKey)) byTrackArtist.set(trackKey, t);

    const albumArtistTrackKey = `${norm(title)}|${albumArtistKey}`;
    if (title && albumArtistKey && !byTrackAlbumArtist.has(albumArtistTrackKey)) byTrackAlbumArtist.set(albumArtistTrackKey, t);

    const albumTrackKey = `${norm(album)}|${trackArtistKey}`;
    if (album && trackArtistKey && !byAlbumTrackArtist.has(albumTrackKey)) byAlbumTrackArtist.set(albumTrackKey, t);

    const albk = `${norm(album)}|${albumArtistKey}`;
    if (album && albumArtistKey && !byAlbumArtist.has(albk)) byAlbumArtist.set(albk, t);
  }

  const artFor = (file) => {
    const f = String(file || '').trim();
    if (!f || !baseUrl) return '/icons/icon-192.png';
    const u = new URL('/art/track_640.jpg', baseUrl);
    u.searchParams.set('file', f);
    if (trackKey) u.searchParams.set('k', trackKey);
    return u.toString();
  };

  return {
    resolveTrack({ track = '', artist = '' } = {}) {
      const key = `${norm(track)}|${norm(artist)}`;
      const hit = byTrackArtist.get(key) || byTrackAlbumArtist.get(key);
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
    resolveAlbum({ album = '', artist = '' } = {}) {
      const key = `${norm(album)}|${norm(artist)}`;
      const hit = byAlbumTrackArtist.get(key) || byAlbumArtist.get(key);
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
    resolveArtist({ artist = '' } = {}) {
      const hit = byArtist.get(norm(artist));
      if (!hit) return null;
      return {
        file: String(hit.file || '').trim(),
        album: String(hit.album || '').trim(),
        art: artFor(hit.file),
        source: 'browse-index',
        mbTrackId: String(hit.mbTrackId || '').trim(),
        mbAlbumId: String(hit.mbAlbumId || '').trim(),
        mbArtistId: String(hit.mbArtistId || '').trim(),
      };
    },
  };
}
