export function registerQueueRoutes(app, deps) {
  const {
    requireTrackKey,
    mpdPlaylistInfoById,
    mpdDeleteId,
    mpdDeletePos0,
    fetchJson,
    MOODE_BASE_URL,
    moodeValByKey,
    decodeHtmlEntities,
    log,
  } = deps;

  app.post('/queue/advance', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const songidRaw =
        (req?.body?.songid !== undefined ? req.body.songid : undefined) ??
        (req?.query?.songid !== undefined ? req.query.songid : undefined);

      const songid = Number.parseInt(String(songidRaw ?? '').trim(), 10);

      const pos0raw =
        (req?.body?.pos0 !== undefined ? req.body.pos0 : undefined) ??
        (req?.query?.pos0 !== undefined ? req.query.pos0 : undefined);

      const pos0 = Number.parseInt(String(pos0raw ?? '').trim(), 10);

      const file = String(req?.body?.file || req?.query?.file || '').trim();

      const haveSongId = Number.isFinite(songid) && songid >= 0;
      const havePos0 = Number.isFinite(pos0) && pos0 >= 0;

      if (!haveSongId && !havePos0) {
        return res.status(400).json({ ok: false, error: 'Missing/invalid songid (preferred) or pos0 (fallback)' });
      }

      if (file && haveSongId) {
        try {
          const info = await mpdPlaylistInfoById(songid);
          const actual = String(info?.file || '').trim();

          if (actual && actual !== file) {
            log.debug('[queue/advance] id mismatch, priming only', {
              songid,
              tokenFile: file,
              mpdFile: actual,
            });

            return res.json({
              ok: true,
              skippedDelete: true,
              reason: 'id-mismatch-primed',
            });
          }
        } catch (e) {
          log.debug('[queue/advance] id check failed, continuing:', e?.message || String(e));
        }
      }

      if (haveSongId) {
        await mpdDeleteId(songid);
      } else {
        await mpdDeletePos0(pos0);
      }

      const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);

      const songposNow = moodeValByKey(statusRaw, 'song');
      const songidNow = moodeValByKey(statusRaw, 'songid');

      return res.json({
        ok: true,
        nowPlaying: {
          file: song.file || '',
          title: decodeHtmlEntities(song.title || ''),
          artist: decodeHtmlEntities(song.artist || ''),
          album: decodeHtmlEntities(song.album || ''),
          songpos: String(songposNow || '').trim(),
          songid: String(songidNow || '').trim(),
        },
      });
    } catch (e) {
      console.error('/queue/advance error:', e?.message || String(e));
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
