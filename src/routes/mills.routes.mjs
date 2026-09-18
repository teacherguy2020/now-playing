import {
  jukeboxEntries,
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

export function getMillsIntegrationState() {
  return {
    active: millsActive,
    lastTransition,
    surrogateStarted: Boolean(millsSession?.surrogateStarted),
    surrogateFile: millsSession?.file || null,
    mpdSongId: millsSession?.mpdSongId || null,
    selectionSlot: millsSession?.selectionSlot || null,
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
    millsPlaylistName = 'Mills Playlist',
  } = deps;

  function parseMpdId(raw) {
    const match = String(raw || '').match(/(?:^|\n)Id:\s*(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  function parseMillsSlot(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const slot = Number(text);
    return Number.isSafeInteger(slot) && slot >= 1 && slot <= 20 ? slot : null;
  }

  async function resolveMillsPlaylist() {
    const playlist = String(millsPlaylistName || 'Mills Playlist').trim();
    const rawPlaylist = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(playlist)}`);
    if (!rawPlaylist || mpdHasACK(rawPlaylist)) {
      const error = new Error(`Playlist not found or unavailable: ${playlist}`);
      error.statusCode = 404;
      throw error;
    }
    const files = parsePlaylistFiles(rawPlaylist);
    if (!files.length) {
      const error = new Error(`Playlist has no entries: ${playlist}`);
      error.statusCode = 404;
      throw error;
    }
    return { playlist, files };
  }

  async function playMillsSelection(slot, file) {
    return await withJukeboxMutation(async () => {
      if (millsSession?.selectionSlot === slot && millsSession?.surrogateStarted) {
        return { ...millsSession, duplicate: true, playbackStarted: false };
      }

      const before = await mpdQueryRaw('status');
      if (mpdHasACK(before)) throw new Error('MPD status failed');
      const status = parseMpdFirstBlock(before);
      const currentPos = Number(status.song ?? -1);
      const add = await mpdQueryRaw(`addid ${mpdEscapeValue(file)}`);
      if (!add || mpdHasACK(add)) throw new Error('MPD rejected the Mills selection');
      const mpdSongId = parseMpdId(add);
      if (!mpdSongId) throw new Error('MPD did not return a song ID for the Mills selection');
      const position = currentPos < 0 ? 0 : currentPos;
      const move = await mpdQueryRaw(`moveid ${mpdSongId} ${position}`);
      if (mpdHasACK(move)) throw new Error('MPD rejected positioning the Mills selection');

      jukeboxEntries.set(mpdSongId, {
        source: 'mills',
        priority: 'jukebox',
        sequence: nextJukeboxSequence(),
        file,
      });
      persistJukeboxState();

      const play = await mpdQueryRaw(`play ${position}`);
      if (mpdHasACK(play)) throw new Error('MPD rejected starting the Mills selection');

      // Mills is a physical source, not a digitally queueable source. Once the
      // new physical selection is authoritative, remove older Mills
      // surrogates so MPD cannot play stale records after this one finishes.
      const staleIds = [...jukeboxEntries.entries()]
        .filter(([id, entry]) => Number(id) !== mpdSongId && entry?.source === 'mills')
        .map(([id]) => Number(id));
      for (const staleId of staleIds) {
        await mpdQueryRaw(`deleteid ${staleId}`);
        jukeboxEntries.delete(staleId);
      }
      if (staleIds.length) persistJukeboxState();

      millsSession = {
        ...(millsSession || {}),
        file,
        mpdSongId,
        selectionSlot: slot,
        surrogateStarted: true,
        playbackStarted: true,
      };
      return { ...millsSession, duplicate: false, playbackStarted: true };
    });
  }

  app.post('/integrations/mills/start', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      return await withMillsTransition(async () => {
        if (millsActive) {
          return res.json({
            ok: true,
            active: true,
            duplicate: true,
            switched: false,
            surrogateStarted: Boolean(millsSession?.surrogateStarted),
            awaitingSelection: !millsSession?.surrogateStarted,
          });
        }
        await switchDenonInput('phono');
        millsActive = true;
        millsSession = { active: true, surrogateStarted: false };
        lastTransition = { state: 'active', at: new Date().toISOString(), input: 'Phono' };
        return res.json({
          ok: true,
          active: true,
          duplicate: false,
          switched: true,
          input: 'Phono',
          surrogateStarted: false,
          playbackStarted: false,
          awaitingSelection: true,
        });
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

  app.post('/integrations/mills/selection', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const slot = parseMillsSlot(req.body?.slot);
      if (slot === null) {
        return res.status(400).json({ ok: false, error: 'slot must be an integer from 1 through 20' });
      }
      if (!millsActive) {
        return res.status(409).json({ ok: false, active: false, error: 'Mills session is not active' });
      }

      return await withMillsTransition(async () => {
        if (millsSession?.selectionSlot === slot && millsSession?.surrogateStarted) {
          return res.json({
            ok: true,
            active: true,
            duplicate: true,
            switched: false,
            slot,
            file: millsSession.file,
            mpdSongId: millsSession.mpdSongId,
            surrogateStarted: true,
            playbackStarted: false,
          });
        }
        const { files } = await resolveMillsPlaylist();
        const file = files[slot - 1] || '';
        if (!file) {
          return res.status(404).json({
            ok: false,
            active: true,
            error: `Selection ${slot} is outside the Mills Playlist (${files.length} tracks)`,
            playlistLength: files.length,
          });
        }
        const selection = await playMillsSelection(slot, file);
        return res.json({
          ok: true,
          active: true,
          duplicate: false,
          switched: false,
          slot,
          file: selection.file,
          mpdSongId: selection.mpdSongId,
          surrogateStarted: true,
          playbackStarted: selection.playbackStarted,
          source: 'mills',
          priority: 'jukebox',
        });
      });
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
      return res.status(status).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.get('/integrations/mills/status', (req, res) => {
    if (!requireTrackKey(req, res)) return;
    return res.json({ ok: true, ...getMillsIntegrationState() });
  });
}
