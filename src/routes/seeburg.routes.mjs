const MIN_SELECTION = 1;
const MAX_SELECTION = 100;

export function parsePlaylistFiles(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^file:\s*(.*)$/i);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean);
}

export function parseSelectionNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= MIN_SELECTION && number <= MAX_SELECTION
    ? number
    : null;
}

function parseMpdBlocks(raw) {
  return String(raw || '').split(/\r?\n\r?\n/).map((block) => {
    const out = {};
    String(block).split(/\r?\n/).forEach((line) => {
      const i = line.indexOf(':');
      if (i < 0) return;
      out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return out;
  }).filter((x) => x.file || x.id || x.pos);
}

function parseMpdId(raw) {
  const match = String(raw || '').match(/(?:^|\n)Id:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function registerSeeburgRoutes(app, deps) {
  const {
    requireTrackKey,
    mpdQueryRaw,
    mpdEscapeValue,
    mpdHasACK,
    parseMpdFirstBlock,
    seeburgPlaylistName = 'Seeburg Playlist',
  } = deps;
  const seeburgEntries = new Map();
  let seeburgSequence = 0;

  async function resolveSelection(number) {
    const playlist = String(seeburgPlaylistName || 'Seeburg Playlist').trim();
    const raw = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(playlist)}`);
    if (!raw || mpdHasACK(raw)) {
      const error = new Error(`Playlist not found or unavailable: ${playlist}`);
      error.statusCode = 404;
      throw error;
    }

    const files = parsePlaylistFiles(raw);
    const file = files[number - 1] || '';
    if (!file) {
      const error = new Error(`Selection ${number} is outside the playlist (${files.length} tracks)`);
      error.statusCode = 404;
      error.playlistLength = files.length;
      throw error;
    }

    return { playlist, files, file };
  }

  app.post('/integrations/seeburg/selection', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const rawNumber = typeof req.body === 'number' ? req.body : req.body?.number;
      const number = parseSelectionNumber(rawNumber);
      if (number === null) {
        return res.status(400).json({
          ok: false,
          error: 'number must be an integer from 1 through 100',
        });
      }

      const resolved = await resolveSelection(number);
      const dryRun = req.body?.dryRun === true;
      const result = {
        ok: true,
        number,
        playlist: resolved.playlist,
        playlistLength: resolved.files.length,
        file: resolved.file,
        dryRun,
      };

      if (dryRun) return res.json(result);

      const before = await mpdQueryRaw('status');
      if (mpdHasACK(before)) throw new Error('MPD status failed');

      const beforeStatus = parseMpdFirstBlock(before);
      const wasPlaying = String(beforeStatus.state || '').trim().toLowerCase() === 'play';
      const beforeItems = parseMpdBlocks(await mpdQueryRaw('playlistinfo'));
      const currentSongId = Number(beforeStatus.songid || 0) || 0;
      const currentPos = Number(beforeStatus.song || -1);
      const currentIsJukebox = currentSongId > 0 && seeburgEntries.has(currentSongId);
      const pendingJukebox = beforeItems
        .filter((item) => Number(item.id || 0) > 0 && Number(item.pos || -1) > currentPos && seeburgEntries.has(Number(item.id)))
        .sort((a, b) => Number(seeburgEntries.get(Number(a.id))?.sequence || 0) - Number(seeburgEntries.get(Number(b.id))?.sequence || 0));

      const addResult = await mpdQueryRaw(`addid ${mpdEscapeValue(resolved.file)}`);
      if (!addResult || mpdHasACK(addResult)) throw new Error('MPD rejected the selected track');
      const insertedSongId = parseMpdId(addResult);
      if (!insertedSongId) throw new Error('MPD did not return a song ID for the selected track');

      // Insert directly after the current track and any already-pending
      // jukebox selections. MPD positions are zero-based.
      const insertionPos = currentPos >= 0
        ? currentPos + pendingJukebox.length + 1
        : 0;
      const moveResult = await mpdQueryRaw(`moveid ${insertedSongId} ${insertionPos}`);
      if (mpdHasACK(moveResult)) throw new Error('MPD rejected positioning the selected track');
      const sequence = ++seeburgSequence;
      seeburgEntries.set(insertedSongId, {
        source: 'seeburg',
        priority: 'jukebox',
        sequence,
        file: resolved.file,
      });

      let playbackStarted = false;
      if (!currentIsJukebox) {
        const playResult = await mpdQueryRaw(`play ${insertionPos}`);
        if (mpdHasACK(playResult)) throw new Error('MPD rejected starting the selected track');
        playbackStarted = true;
      }

      const after = await mpdQueryRaw('status');
      if (mpdHasACK(after)) throw new Error('MPD status failed after queueing');

      const afterStatus = parseMpdFirstBlock(after);
      const expectedQueueLength = Number(beforeStatus.playlistlength) + 1;
      const queued = Number(afterStatus.playlistlength) === expectedQueueLength;
      if (!queued) throw new Error('MPD did not report the selected track as queued');

      return res.json({
        ...result,
        queued: true,
        queueLength: Number(afterStatus.playlistlength),
        playbackStarted,
        queueWasCleared: false,
        source: 'seeburg',
        priority: 'jukebox',
        interruptedNormalPlayback: !currentIsJukebox && wasPlaying,
        queuedBehindJukebox: currentIsJukebox,
        mpdSongId: insertedSongId,
      });
    } catch (e) {
      const status = Number.isInteger(e?.statusCode) ? e.statusCode : 500;
      return res.status(status).json({
        ok: false,
        error: e?.message || String(e),
        ...(e?.playlistLength !== undefined ? { playlistLength: e.playlistLength } : {}),
      });
    }
  });

  // Read-only mapping endpoint for commissioning and playlist verification.
  app.get('/integrations/seeburg/playlist', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const playlist = String(seeburgPlaylistName || 'Seeburg Playlist').trim();
      const raw = await mpdQueryRaw(`listplaylist ${mpdEscapeValue(playlist)}`);
      if (!raw || mpdHasACK(raw)) {
        return res.status(404).json({ ok: false, error: `Playlist not found or unavailable: ${playlist}` });
      }
      const files = parsePlaylistFiles(raw);
      return res.json({
        ok: true,
        playlist,
        count: files.length,
        tracks: files.map((file, index) => ({ number: index + 1, file })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
