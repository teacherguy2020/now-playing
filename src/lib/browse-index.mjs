import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const INDEX_PATH = process.env.BROWSE_INDEX_PATH || path.resolve(process.cwd(), 'data/library-browse-index.json');

let mem = { ts: 0, host: '', index: null, inflight: null, dbCheckTs: 0, dbUpdateIso: '' };

function norm(s = '') {
  return String(s || '').trim().toLowerCase();
}

function parseTrackNo(track = '') {
  const n = Number.parseInt(String(track || '').replace(/[^0-9].*$/, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function localCandidatesForMpdFile(filePath = '') {
  const raw = String(filePath || '').trim();
  const rel = raw.replace(/^\/+/, '');
  if (!rel) return [];
  return [
    raw.startsWith('/') ? raw : '',
    rel.startsWith('/mnt/') ? rel : '',
    rel.startsWith('mnt/') ? '/' + rel : '',
    `/var/lib/mpd/music/${rel}`,
    `/media/${rel}`,
    rel.startsWith('USB/SamsungMoode/') ? `/mnt/SamsungMoode/${rel.slice('USB/SamsungMoode/'.length)}` : '',
    rel.startsWith('OSDISK/') ? `/mnt/OSDISK/${rel.slice('OSDISK/'.length)}` : '',
    `/mnt/SamsungMoode/${rel}`,
    `/mnt/OSDISK/${rel}`,
  ].map((x) => String(x || '').replace(/\/+/g, '/').trim()).filter(Boolean);
}

async function getAddedTsForSample(filePath = '') {
  for (const p of localCandidatesForMpdFile(filePath)) {
    try {
      const st = await fs.stat(p);
      const ts = Number(st?.birthtimeMs || st?.mtimeMs || 0) || 0;
      if (Number.isFinite(ts) && ts > 0) return ts;
    } catch {}
  }
  return 0;
}

async function getRemoteAddedTsBySample(sampleFiles = []) {
  const out = new Map();
  const host = String(process.env.MOODE_SSH_HOST || process.env.MPD_HOST || '').trim();
  const user = String(process.env.MOODE_SSH_USER || 'moode').trim();
  const files = Array.from(new Set((sampleFiles || []).map((x) => String(x || '').trim()).filter(Boolean)));
  if (!host || !files.length) return out;

  const code = [
    'import os,sys,json',
    'samples=json.loads(sys.argv[1])',
    'for f in samples:',
    '  s=str(f or "").strip().lstrip("/")',
    '  if not s: continue',
    '  c=[f"/var/lib/mpd/music/{s}", f"/media/{s}"]',
    '  if s.startswith("USB/SamsungMoode/"):',
    '    c.append("/media/SamsungMoode/" + s[len("USB/SamsungMoode/"):])',
    '  m=0',
    '  for p in c:',
    '    try:',
    '      st=os.stat(p)',
    '      m=int(st.st_mtime*1000)',
    '      break',
    '    except Exception:',
    '      pass',
    '  print(f"{f}\t{m}")',
  ].join('\n');

  try {
    const { stdout } = await execFileP('ssh', [`${user}@${host}`, 'python3', '-c', code, JSON.stringify(files)], {
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const ln of String(stdout || '').split(/\r?\n/)) {
      if (!ln || !ln.includes('\t')) continue;
      const i = ln.lastIndexOf('\t');
      const f = ln.slice(0, i).trim();
      const n = Number(ln.slice(i + 1).trim());
      if (f && Number.isFinite(n) && n > 0) out.set(f, n);
    }
  } catch {}

  return out;
}

async function getMpdDbUpdateIso(mpdHost = 'moode.local') {
  try {
    const { stdout } = await execFileP('mpc', ['-h', String(mpdHost || 'moode.local'), 'stats'], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 8000,
    });
    const txt = String(stdout || '');
    // mpc usually emits: "DB Updated: Fri Mar 15 12:34 :56 2026"
    const m = txt.match(/^\s*DB Updated:\s*(.+)$/im);
    const raw = String(m?.[1] || '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toISOString();
  } catch {
    return '';
  }
}

export async function buildBrowseIndex(mpdHost = 'moode.local') {
  const dbUpdateAt = await getMpdDbUpdateIso(mpdHost);
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
          addedTs: 0,
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

  // Compute album addedTs once per album from sampleFile metadata.
  // Prefer local stat; fallback to one batched remote SSH stat pass.
  const samples = Array.from(albums.values()).map((a) => String(a?.sampleFile || '')).filter(Boolean);
  const remoteTsBySample = await getRemoteAddedTsBySample(samples);
  for (const a of albums.values()) {
    try {
      const sf = String(a?.sampleFile || '');
      const localTs = await getAddedTsForSample(sf);
      const remoteTs = Number(remoteTsBySample.get(sf) || 0);
      a.addedTs = Number(localTs || remoteTs || 0) || 0;
    } catch {
      a.addedTs = 0;
    }
  }

  const index = {
    schema: 'now-playing.browse-index.v1',
    builtAt: new Date().toISOString(),
    dbUpdateAt,
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
  const host = String(mpdHost || 'moode.local');
  const sameHost = mem.host === host;

  // Fast memory return unless forced. Keep this very cheap.
  if (!force && mem.index && sameHost && (now - mem.ts) < 60_000) return mem.index;
  if (mem.inflight) return mem.inflight;

  mem.inflight = (async () => {
    let idx = null;

    if (!force) {
      if (mem.index && sameHost) {
        idx = mem.index;
      } else {
        try {
          const raw = await fs.readFile(INDEX_PATH, 'utf8');
          const parsed = JSON.parse(raw || '{}');
          if (parsed && parsed.schema === 'now-playing.browse-index.v1') idx = parsed;
        } catch {}
      }
    }

    // Lightweight staleness check against MPD DB update time every ~30s.
    if (!force && idx) {
      const shouldCheckDb = !sameHost || (now - Number(mem.dbCheckTs || 0)) > 30_000;
      if (shouldCheckDb) {
        const dbUpdateIso = await getMpdDbUpdateIso(host);
        const idxDb = String(idx?.dbUpdateAt || '').trim();
        const idxBuilt = String(idx?.builtAt || '').trim();
        const marker = idxDb || idxBuilt;

        if (dbUpdateIso && marker) {
          const dbMs = Date.parse(dbUpdateIso);
          const idxMs = Date.parse(marker);
          if (Number.isFinite(dbMs) && Number.isFinite(idxMs) && dbMs > idxMs) {
            idx = null; // stale; force rebuild below
          }
        }

        mem.dbCheckTs = Date.now();
        mem.dbUpdateIso = dbUpdateIso || mem.dbUpdateIso || '';
      }
    }

    if (!idx) {
      idx = await buildBrowseIndex(host);
    }

    mem = {
      ts: Date.now(),
      host,
      index: idx,
      inflight: null,
      dbCheckTs: mem.dbCheckTs || Date.now(),
      dbUpdateIso: mem.dbUpdateIso || String(idx?.dbUpdateAt || ''),
    };

    return idx;
  })();

  try {
    return await mem.inflight;
  } finally {
    mem.inflight = null;
  }
}
