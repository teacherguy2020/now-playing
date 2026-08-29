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

export function registerSeeburgRoutes(app, deps) {
  const {
    requireTrackKey,
    mpdQueryRaw,
    mpdEscapeValue,
    mpdHasACK,
    parseMpdFirstBlock,
    seeburgPlaylistName = 'Seeburg Playlist',
  } = deps;

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
      let queueWasCleared = false;

      if (!wasPlaying) {
        const clearResult = await mpdQueryRaw('clear');
        if (mpdHasACK(clearResult)) throw new Error('MPD rejected clearing the queue');
        queueWasCleared = true;
      }

      const addResult = await mpdQueryRaw(`add ${mpdEscapeValue(resolved.file)}`);
      if (!addResult || mpdHasACK(addResult)) throw new Error('MPD rejected the selected track');

      let playbackStarted = false;
      if (queueWasCleared) {
        const playResult = await mpdQueryRaw('play 0');
        if (mpdHasACK(playResult)) throw new Error('MPD rejected starting the selected track');
        playbackStarted = true;
      }

      const after = await mpdQueryRaw('status');
      if (mpdHasACK(after)) throw new Error('MPD status failed after queueing');

      const afterStatus = parseMpdFirstBlock(after);
      const queued = Number(afterStatus.playlistlength) === Number(beforeStatus.playlistlength) + 1;
      if (!queued) throw new Error('MPD did not report the selected track as queued');

      return res.json({
        ...result,
        queued: true,
        queueLength: Number(afterStatus.playlistlength),
        playbackStarted,
        queueWasCleared,
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
