import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const INDEX_PATH = process.env.BROWSE_INDEX_PATH || path.resolve(process.cwd(), 'data/library-browse-index.json');

let mem = { ts: 0, host: '', index: null, inflight: null };

function norm(s = '') {
  return String(s || '').trim().toLowerCase();
}

function parseTrackNo(track = '') {
  const n = Number.parseInt(String(track || '').replace(/[^0-9].*$/, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function buildBrowseIndex(mpdHost = 'moode.local') {
  const fmt = '%file%\t%artist%\t%albumartist%\t%album%\t%title%\t%track%\t%genre%\t%time%';
  const { stdout } = await execFileP('mpc', ['-h', String(mpdHost || 'moode.local'), '-f', fmt, 'listall'], {
    maxBuffer: 96 * 1024 * 1024,
  });

  const artists = new Map();
  const albums = new Map();
  const tracks = [];
  let id = 0;

  for (const ln of String(stdout || '').split(/\r?\n/)) {
    if (!ln) continue;
    const [file = '', artistRaw = '', albumArtistRaw = '', albumRaw = '', titleRaw = '', trackRaw = '', genreRaw = '', timeRaw = ''] = ln.split('\t');
    const filePath = String(file || '').trim();
    if (!filePath) continue;

    const artist = String(artistRaw || albumArtistRaw || '').trim();
    const albumArtist = String(albumArtistRaw || artistRaw || '').trim();
    const album = String(albumRaw || '').trim();
    const title = String(titleRaw || '').trim() || (filePath.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
    const track = String(trackRaw || '').trim();
    const genre = String(genreRaw || '').trim();
    const durationSec = Number(timeRaw || 0) || 0;

    const artistKey = norm(artist || albumArtist);
    const albumKey = `${norm(albumArtist || artist)}|${norm(album)}`;

    if (artistKey) {
      if (!artists.has(artistKey)) artists.set(artistKey, { key: artistKey, name: artist || albumArtist, albumCount: 0, trackCount: 0, sampleFile: filePath });
      const ar = artists.get(artistKey);
      ar.trackCount += 1;
      if (!ar.sampleFile) ar.sampleFile = filePath;
    }

    if (album && albumKey !== '|') {
      if (!albums.has(albumKey)) {
        albums.set(albumKey, {
          key: albumKey,
          album,
          artist: albumArtist || artist,
          sampleFile: filePath,
          trackCount: 0,
          durationSec: 0,
          genre,
        });
        if (artistKey && artists.has(artistKey)) artists.get(artistKey).albumCount += 1;
      }
      const a = albums.get(albumKey);
      a.trackCount += 1;
      a.durationSec += durationSec;
      if (!a.sampleFile) a.sampleFile = filePath;
    }

    tracks.push({
      id: ++id,
      file: filePath,
      artist,
      albumArtist,
      album,
      title,
      track,
      trackNo: parseTrackNo(track),
      genre,
      durationSec,
      albumKey,
      artistKey,
      rating: 0,
    });
  }

  const index = {
    schema: 'now-playing.browse-index.v1',
    builtAt: new Date().toISOString(),
    mpdHost: String(mpdHost || ''),
    counts: { artists: artists.size, albums: albums.size, tracks: tracks.length },
    artists: Array.from(artists.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    albums: Array.from(albums.values()).sort((a, b) => (`${a.artist} ${a.album}`).localeCompare(`${b.artist} ${b.album}`, undefined, { sensitivity: 'base' })),
    tracks,
  };

  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(index), 'utf8');
  return index;
}

export async function getBrowseIndex(mpdHost = 'moode.local', { force = false } = {}) {
  const now = Date.now();
  if (!force && mem.index && mem.host === mpdHost && (now - mem.ts) < 60_000) return mem.index;
  if (mem.inflight) return mem.inflight;

  mem.inflight = (async () => {
    if (!force) {
      try {
        const raw = await fs.readFile(INDEX_PATH, 'utf8');
        const idx = JSON.parse(raw || '{}');
        if (idx && idx.schema === 'now-playing.browse-index.v1') {
          mem = { ts: Date.now(), host: mpdHost, index: idx, inflight: null };
          return idx;
        }
      } catch {}
    }

    const built = await buildBrowseIndex(mpdHost);
    mem = { ts: Date.now(), host: mpdHost, index: built, inflight: null };
    return built;
  })();

  try {
    return await mem.inflight;
  } finally {
    mem.inflight = null;
  }
}
