import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function sshArgsFor(user, host, extra = []) {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    ...extra,
    `${user}@${host}`,
  ];
}

function shQuoteArg(s) {
  const v = String(s ?? '');
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

async function sshBashLc({ user, host, script, timeoutMs = 20000, maxBuffer = 10 * 1024 * 1024 }) {
  return execFileP('ssh', [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(String(script || ''))], {
    timeout: timeoutMs,
    maxBuffer,
  });
}

export function registerConfigLibraryHealthPerformersRoutes(app, deps) {
  const { requireTrackKey, log } = deps;

  app.get('/config/library-health/album-performers-suggest', async (req, res) => {
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
      const split = (s) => String(s || '').split(/[;,/|]/).map((x) => String(x || '').trim()).filter(Boolean);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      const ua = String(process.env.MUSICBRAINZ_USER_AGENT || 'now-playing-next/1.0 ( brianjwis@gmail.com )');
      const mbFetch = async (url) => {
        const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'application/json' } });
        if (!r.ok) throw new Error(`MusicBrainz HTTP ${r.status}`);
        return r.json();
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%\t%track%\t%title%\t%artist%\t%albumartist%\t%album%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });

      const tracks = [];
      const localSet = new Set();
      let albumName = '';
      let albumArtistName = '';

      for (const ln of String(stdout || '').split(/\r?\n/)) {
        if (!ln) continue;
        const [file = '', track = '', title = '', artist = '', albumartist = '', album = ''] = ln.split('\t');
        const f = String(file || '').trim();
        if (!f || !isAudio(f)) continue;
        const ff = folderOf(f);
        if (!(ff === folderWanted || ff.startsWith(`${folderWanted}/`))) continue;

        if (!albumName) albumName = String(album || '').trim();
        if (!albumArtistName) albumArtistName = String(albumartist || artist || '').trim();

        for (const p of split(artist || albumartist)) localSet.add(p);
        tracks.push({ file: f, track: String(track || '').trim(), title: String(title || '').trim(), artist: String(artist || '').trim() });
      }

      const performerRoles = new Map();
      const producers = new Set();
      const normalizeInstrument = (role = '') => {
        let r = String(role || '').trim().toLowerCase();
        if (!r) return '';
        r = r.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        if (r === 'drum set' || r === 'drums set') r = 'drums';
        if (r.includes('drum')) r = 'drums';
        if (r === 'electric bass' || r === 'bass guitar') r = 'bass';
        return r;
      };
      const addPerf = (name, role = '') => {
        const n = String(name || '').trim();
        if (!n) return;
        if (!performerRoles.has(n)) performerRoles.set(n, new Set());
        const s = performerRoles.get(n);
        const r = normalizeInstrument(role);
        if (r && !['instrument', 'recording', 'arranger', 'producer', 'local tag'].includes(r)) s.add(r);
      };
      const addProducer = (name) => {
        const n = String(name || '').trim();
        if (n) producers.add(n);
      };

      for (const n of localSet) addPerf(n, '');

      try {
        if (albumName) {
          const q = encodeURIComponent(`release:"${albumName}" AND artist:"${albumArtistName || albumName}"`);
          const search = await mbFetch(`https://musicbrainz.org/ws/2/release?query=${q}&fmt=json&limit=3`);
          const rel = Array.isArray(search?.releases) ? search.releases[0] : null;
          const relId = String(rel?.id || '').trim();

          if (relId) {
            const relFull = await mbFetch(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(relId)}?inc=recordings+artist-credits&fmt=json`);
            const recIds = [];
            for (const med of Array.isArray(relFull?.media) ? relFull.media : []) {
              for (const tr of Array.isArray(med?.tracks) ? med.tracks : []) {
                const rid = String(tr?.recording?.id || '').trim();
                if (rid) recIds.push(rid);
              }
            }

            const seenRec = new Set();
            for (const rid of recIds.slice(0, 20)) {
              if (seenRec.has(rid)) continue;
              seenRec.add(rid);
              await sleep(120);
              const rec = await mbFetch(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(rid)}?inc=artist-credits+artist-rels&fmt=json`);

              for (const reln of Array.isArray(rec?.relations) ? rec.relations : []) {
                const n = String(reln?.artist?.name || '').trim();
                if (!n) continue;
                const t = String(reln?.type || '').trim().toLowerCase();
                const attrs = Array.isArray(reln?.attributes) ? reln.attributes.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : [];

                if (t.includes('producer')) {
                  addProducer(n);
                  continue;
                }

                const instrumentAttrs = attrs.filter((a) => !['lead vocals', 'additional vocals', 'backing vocals', 'arranger', 'conductor', 'recording', 'mix', 'mastering', 'engineer', 'producer', 'instrument'].includes(a));

                if (t.includes('instrument') || instrumentAttrs.length) {
                  if (instrumentAttrs.length) instrumentAttrs.forEach((a) => addPerf(n, a));
                  else addPerf(n, '');
                }
              }
            }
          }
        }
      } catch (e) {
        log.debug('[album-performers-suggest] musicbrainz enrich failed:', e?.message || String(e));
      }

      const performerLines = Array.from(performerRoles.entries())
        .map(([name, roles]) => {
          const rs = Array.from(roles || []).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
          return `PERFORMER=${name}${rs.length ? ` (${rs.join(', ')})` : ''}`;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      const producerLines = Array.from(producers)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map((n) => `PRODUCER=${n}`);

      const merged = [...performerLines, ...producerLines];

      return res.json({ ok: true, folder: folderWanted, album: albumName, albumArtist: albumArtistName, tracks: tracks.length, performers: merged });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/album-artist-cleanup', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folderWanted = String(req.body?.folder || '').trim();
      if (!folderWanted) return res.status(400).json({ ok: false, error: 'folder is required' });

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };
      const mode = String(req.body?.mode || 'featOnly').trim(); // featOnly | normalizeAll
      const hasJoiners = (artist) => /\bfeat\.?\b|\bfeaturing\b|\bwith\b|\s&\s|,/.test(String(artist || ''));
      const toPrimaryArtist = (name) => {
        const s = String(name || '').trim();
        if (!s) return '';
        return s
          .split(/\bwith\b|\bconducted by\b|\bfeat\.?\b|\bfeaturing\b|\s&\s|,|;|\//i)[0]
          .replace(/\s+/g, ' ')
          .trim();
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP(
        'mpc',
        ['-h', mpdHost, '-f', '%file%\t%artist%\t%albumartist%\t%title%', 'listall'],
        { maxBuffer: 64 * 1024 * 1024 }
      );

      const rows = String(stdout || '').split(/\r?\n/)
        .map((ln) => {
          const [file = '', artist = '', albumartist = '', title = ''] = String(ln || '').split('\t');
          return {
            file: String(file || '').trim(),
            artist: String(artist || '').trim(),
            albumArtist: String(albumartist || '').trim(),
            title: String(title || '').trim(),
          };
        })
        .filter((r) => r.file && isAudio(r.file))
        .filter((r) => {
          const ff = folderOf(r.file);
          return ff === folderWanted || ff.startsWith(`${folderWanted}/`);
        });

      const candidates = rows
        .map((r) => ({ ...r, proposedArtist: toPrimaryArtist(r.albumArtist || r.artist) }))
        .filter((r) => {
          const proposed = String(r.proposedArtist || '').trim();
          if (!proposed) return false;
          if (proposed.toLowerCase() === String(r.artist || '').trim().toLowerCase()) return false;
          if (mode === 'normalizeAll') return true;
          return hasJoiners(r.artist);
        });
      if (!candidates.length) {
        return res.json({ ok: true, folder: folderWanted, candidates: 0, updated: 0, skipped: rows.length, changes: [], errors: [] });
      }

      const musicRoot = String(process.env.MPD_MUSIC_ROOT || '/var/lib/mpd/music').replace(/\/$/, '');
      let updated = 0;
      let skipped = 0;
      const changes = [];
      const errors = [];

      for (const c of candidates) {
        if (!/\.flac$/i.test(c.file)) {
          skipped += 1;
          continue;
        }

        const full = `${musicRoot}/${c.file}`;
        const pQ = shQuoteArg(full);
        const nextArtist = String(c.proposedArtist || '').trim();
        const script = [
          `if ! sudo test -f ${pQ}; then echo MISS; exit 3; fi`,
          `sudo metaflac --remove-tag=ARTIST ${pQ}`,
          `sudo metaflac --set-tag=${shQuoteArg(`ARTIST=${nextArtist}`)} ${pQ}`,
          'echo OK',
        ].join('; ');

        try {
          const { stdout: outStd } = await sshBashLc({
            user: String(MOODE_SSH_USER || 'moode'),
            host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'),
            script,
            timeoutMs: 12000,
          });
          const out = String(outStd || '').trim();
          if (out.includes('OK')) {
            updated += 1;
            if (changes.length < 100) changes.push({ file: c.file, title: c.title, fromArtist: c.artist, toArtist: nextArtist });
          } else {
            skipped += 1;
            if (errors.length < 20) errors.push({ file: c.file, error: out || 'apply failed' });
          }
        } catch (e) {
          skipped += 1;
          if (errors.length < 20) errors.push({ file: c.file, error: e?.message || String(e) });
        }
      }

      // Ask MPD to refresh tags for this folder so UI reflects updates quickly.
      if (updated > 0) {
        try {
          await execFileP('mpc', ['-h', mpdHost, 'update', folderWanted]);
        } catch (_) {}
      }

      return res.json({ ok: true, folder: folderWanted, mode, candidates: candidates.length, updated, skipped, total: rows.length, changes, errors });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/config/library-health/album-performers-apply', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const folderWanted = String(req.body?.folder || '').trim();
      const rawLines = Array.isArray(req.body?.performers)
        ? req.body.performers.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const performerVals = [];
      const producerVals = [];
      for (const ln of rawLines) {
        if (/^PERFORMER=/i.test(ln)) {
          const v = ln.replace(/^PERFORMER=/i, '').trim();
          if (v) performerVals.push(v);
          continue;
        }
        if (/^PRODUCER=/i.test(ln)) {
          const v = ln.replace(/^PRODUCER=/i, '').trim();
          if (v) producerVals.push(v);
          continue;
        }
      }
      if (!folderWanted) return res.status(400).json({ ok: false, error: 'folder is required' });
      if (!performerVals.length && !producerVals.length) return res.status(400).json({ ok: false, error: 'performers[] is required' });

      const isAudio = (f) => /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff|alac|dsf|wv|ape)$/i.test(String(f || ''));
      const folderOf = (file) => {
        const s = String(file || '');
        const i = s.lastIndexOf('/');
        return i > 0 ? s.slice(0, i) : '(root)';
      };

      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, '-f', '%file%', 'listall'], { maxBuffer: 64 * 1024 * 1024 });
      const files = String(stdout || '').split(/\r?\n/).map((x) => x.trim()).filter((f) => f && isAudio(f)).filter((f) => {
        const ff = folderOf(f);
        return ff === folderWanted || ff.startsWith(`${folderWanted}/`);
      });

      const musicRoot = String(process.env.MPD_MUSIC_ROOT || '/var/lib/mpd/music').replace(/\/$/, '');
      let updated = 0;
      let skipped = 0;
      const errors = [];
      for (const f of files) {
        if (!/\.flac$/i.test(f)) { skipped += 1; continue; }
        const full = `${musicRoot}/${f}`;
        const pQ = shQuoteArg(full);
        const perfArgs = performerVals.map((p) => `--set-tag=${shQuoteArg(`PERFORMER=${p}`)}`).join(' ');
        const prodArgs = producerVals.map((p) => `--set-tag=${shQuoteArg(`PRODUCER=${p}`)}`).join(' ');
        const setArgs = [perfArgs, prodArgs].filter(Boolean).join(' ');
        const script = [
          `if ! sudo test -f ${pQ}; then echo MISS; exit 3; fi`,
          `sudo metaflac --remove-tag=PERFORMER ${pQ}`,
          `sudo metaflac --remove-tag=PRODUCER ${pQ}`,
          `${setArgs ? `sudo metaflac ${setArgs} ${pQ}` : ':'}`,
          'echo OK',
        ].join('; ');

        try {
          const { stdout } = await sshBashLc({ user: String(MOODE_SSH_USER || 'moode'), host: String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254'), script, timeoutMs: 12000 });
          const out = String(stdout || '').trim();
          if (out.includes('OK')) updated += 1;
          else {
            skipped += 1;
            if (errors.length < 20) errors.push({ file: f, error: out || 'apply failed' });
          }
        } catch (e) {
          skipped += 1;
          if (errors.length < 20) errors.push({ file: f, error: e?.message || String(e) });
        }
      }

      return res.json({ ok: true, folder: folderWanted, performers: performerVals, producers: producerVals, updated, skipped, total: files.length, errors });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
