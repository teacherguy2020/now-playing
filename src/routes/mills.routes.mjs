import {
  jukeboxEntries,
  isJukeboxItem,
  nextJukeboxSequence,
  parsePlaylistFiles,
  persistJukeboxState,
  withJukeboxMutation,
} from './seeburg.routes.mjs';

let millsActive = false;
let lastTransition = null;
let transitionQueue = Promise.resolve();
let millsSession = null;

function withMillsTransition(task) {
  const run = transitionQueue.then(task, task);
  transitionQueue = run.catch(() => {});
  return run;
}

function parseMpdBlocks(raw) {
  return String(raw || '').split(/\r?\n(?=file:\s*)/i).map((block) => {
    const out = {};
    String(block).split(/\r?\n/).forEach((line) => {
      const i = line.indexOf(':');
      if (i >= 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return out;
  }).filter((item) => item.file || item.id || item.pos);
}

export function getMillsIntegrationState() {
  return {
    active: millsActive,
    lastTransition,
    surrogateStarted: Boolean(millsSession?.surrogateStarted),
    surrogateFile: millsSession?.file || null,
    mpdSongId: millsSession?.mpdSongId || null,
  };
}

export function registerMillsRoutes(app, deps) {
  const {
    requireTrackKey,
    switchDenonInput,
    mpdQueryRaw,
    mpdEscapeValue,
    mpdHasACK,
    parseMpdFirstBlock,
    millsPlaylistName = 'Mills-Playlist',
  } = deps;

  function parseMpdId(raw) {
    const match = String(raw || '').match(/(?:^|\n)Id:\s*(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  async function startSurrogate() {
    if (!mpdQueryRaw || !mpdEscapeValue || !mpdHasACK || !parseMpdFirstBlock) {
      throw new Error('Mills surrogate playback dependencies are not configured');
    }
    if (millsSession?.surrogateStarted) return millsSession;

    const playlist = String(millsPlaylistName || 'Mills-Playlist').trim();
    const rawPlaylist = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(playlist)}`);
    if (!rawPlaylist || mpdHasACK(rawPlaylist)) {
      const error = new Error(`Playlist not found or unavailable: ${playlist}`);
      error.statusCode = 404;
      throw error;
    }
    const file = parsePlaylistFiles(rawPlaylist)[0] || '';
    if (!file) {
      const error = new Error(`Playlist has no entries: ${playlist}`);
      error.statusCode = 404;
      throw error;
    }

    return await withJukeboxMutation(async () => {
      if (millsSession?.surrogateStarted) return millsSession;
      const before = await mpdQueryRaw('status');
      if (mpdHasACK(before)) throw new Error('MPD status failed');
      const status = parseMpdFirstBlock(before);
      const currentPos = Number(status.song ?? -1);
      const currentSongId = Number(status.songid || 0);
      const wasPlaying = String(status.state || '').trim().toLowerCase() === 'play';
      const beforeItems = parseMpdBlocks(await mpdQueryRaw('playlistinfo'));
      const currentIsJukebox = wasPlaying && currentSongId > 0 && jukeboxEntries.has(currentSongId);
      const pendingJukebox = beforeItems
        .filter((item) => Number(item.pos || -1) > currentPos && isJukeboxItem(item))
        .sort((a, b) => Number(a.pos || 0) - Number(b.pos || 0));
      const add = await mpdQueryRaw(`addid ${mpdEscapeValue(file)}`);
      if (!add || mpdHasACK(add)) throw new Error('MPD rejected the Mills surrogate track');
      const mpdSongId = parseMpdId(add);
      if (!mpdSongId) throw new Error('MPD did not return a song ID for the Mills surrogate track');
      const position = currentPos < 0
        ? 0
        : currentIsJukebox
          ? currentPos + pendingJukebox.length + 1
          : currentPos;
      const move = await mpdQueryRaw(`moveid ${mpdSongId} ${position}`);
      if (mpdHasACK(move)) throw new Error('MPD rejected positioning the Mills surrogate track');
      jukeboxEntries.set(mpdSongId, {
        source: 'mills',
        priority: 'jukebox',
        sequence: nextJukeboxSequence(),
        file,
      });
      persistJukeboxState();
      let playbackStarted = false;
      if (!currentIsJukebox) {
        const play = await mpdQueryRaw(`play ${position}`);
        if (mpdHasACK(play)) throw new Error('MPD rejected starting the Mills surrogate track');
        playbackStarted = true;
      }
      millsSession = { ...(millsSession || {}), file, mpdSongId, surrogateStarted: true, playbackStarted };
      return { ...millsSession, currentIsJukebox, pendingJukeboxCount: pendingJukebox.length };
    });
  }

  app.post('/integrations/mills/start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return await withMillsTransition(async () => {
        if (millsActive) {
          if (millsSession?.surrogateStarted) {
            return res.json({ ok: true, active: true, duplicate: true, switched: false, surrogateStarted: true });
          }
          const surrogate = await startSurrogate();
          return res.json({ ok: true, active: true, duplicate: true, switched: false, surrogateStarted: true, file: surrogate.file, mpdSongId: surrogate.mpdSongId });
        }
        await switchDenonInput('phono');
        millsActive = true;
        millsSession = { active: true, surrogateStarted: false };
        const surrogate = await startSurrogate();
        lastTransition = { state: 'active', at: new Date().toISOString(), input: 'Phono' };
        return res.json({ ok: true, active: true, duplicate: false, switched: true, input: 'Phono', surrogateStarted: true, playbackStarted: surrogate.playbackStarted, queuedBehindJukebox: surrogate.currentIsJukebox, file: surrogate.file, mpdSongId: surrogate.mpdSongId });
      });
    } catch (error) {
      return res.status(502).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post('/integrations/mills/stop', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return await withMillsTransition(async () => {
        if (!millsActive) {
          return res.json({ ok: true, active: false, duplicate: true, switched: false });
        }
        await switchDenonInput('aux1');
        millsActive = false;
        millsSession = null;
        lastTransition = { state: 'idle', at: new Date().toISOString(), input: 'Aux 1' };
        return res.json({ ok: true, active: false, duplicate: false, switched: true, input: 'Aux 1' });
      });
    } catch (error) {
      // Keep the active latch set when source restoration fails so a repeated
      // Shelly event can safely retry the consequential operation.
      return res.status(502).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.get('/integrations/mills/status', (req, res) => {
    if (!requireTrackKey(req, res)) return;
    return res.json({ ok: true, ...getMillsIntegrationState() });
  });
}
