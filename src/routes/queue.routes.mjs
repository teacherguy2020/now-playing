export function registerQueueRoutes(app, deps) {
  const {
    requireTrackKey,
    mpdPlaylistInfoById,
    mpdDeleteId,
    mpdDeletePos0,
    mpdQueryRaw,
    parseMpdKeyVals,
    parseMpdFirstBlock,
    mpdPrimeIfIdle,
    fetchJson,
    MOODE_BASE_URL,
    moodeValByKey,
    decodeHtmlEntities,
    log,
  } = deps;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function resolveHeadFast() {
    for (let i = 0; i < 5; i++) {
      try {
        const stRaw = await mpdQueryRaw('status');
        const st = parseMpdKeyVals(stRaw || '');
        const songPosRaw = String(st.song || '').trim();
        const songIdRaw = String(st.songid || '').trim();
        const songPos = Number.parseInt(songPosRaw, 10);

        if (Number.isFinite(songPos) && songPos >= 0) {
          const infoRaw = await mpdQueryRaw(`playlistinfo ${songPos}:${songPos + 1}`);
          const info = parseMpdFirstBlock(infoRaw || '');
          const f = String(info.file || '').trim();
          if (f) {
            return {
              file: f,
              title: decodeHtmlEntities(String(info.title || '').trim()),
              artist: decodeHtmlEntities(String(info.artist || '').trim()),
              album: decodeHtmlEntities(String(info.album || '').trim()),
              songpos: String(songPosRaw || '').trim(),
              songid: String(info.id || songIdRaw || '').trim(),
              source: 'mpd-fast',
            };
          }
        }
      } catch (e) {
        if (i === 4) log.debug('[queue/advance] resolveHeadFast failed:', e?.message || String(e));
      }
      await sleep(60);
    }
    return null;
  }

  async function resolveHeadFallbackMoode() {
    const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
    const statusRaw = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=status`);

    const songposNow = moodeValByKey(statusRaw, 'song');
    const songidNow = moodeValByKey(statusRaw, 'songid');
    const fileNow = String(song?.file || '').trim();

    if (!fileNow) return null;

    return {
      file: fileNow,
      title: decodeHtmlEntities(song.title || ''),
      artist: decodeHtmlEntities(song.artist || ''),
      album: decodeHtmlEntities(song.album || ''),
      songpos: String(songposNow || '').trim(),
      songid: String(songidNow || '').trim(),
      source: 'moode-json',
    };
  }

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

      let skippedDelete = false;
      let reason = '';

      if (file && haveSongId) {
        try {
          const info = await mpdPlaylistInfoById(songid);
          const actual = String(info?.file || '').trim();

          if (actual && actual !== file) {
            skippedDelete = true;
            reason = 'id-mismatch-primed';
            log.debug('[queue/advance] id mismatch, skip delete', {
              songid,
              tokenFile: file,
              mpdFile: actual,
            });
          }
        } catch (e) {
          log.debug('[queue/advance] id check failed, continuing:', e?.message || String(e));
        }
      }

      if (!skippedDelete) {
        if (haveSongId) {
          await mpdDeleteId(songid);
        } else {
          await mpdDeletePos0(pos0);
        }
      }

      // Invariant: always leave a head ready for Alexa.
      let nowPlaying = await resolveHeadFast();
      if (!nowPlaying) {
        try {
          const prime = await mpdPrimeIfIdle();
          log.debug('[queue/advance] prime-on-miss', prime || {});
        } catch (e) {
          log.debug('[queue/advance] prime-on-miss failed:', e?.message || String(e));
        }

        nowPlaying = await resolveHeadFast();
      }

      if (!nowPlaying) {
        try {
          nowPlaying = await resolveHeadFallbackMoode();
        } catch (e) {
          log.debug('[queue/advance] moode fallback failed:', e?.message || String(e));
        }
      }

      if (!nowPlaying || !nowPlaying.file) {
        return res.status(409).json({
          ok: false,
          noHead: true,
          skippedDelete,
          reason: reason || 'no-head-after-advance',
          error: 'Queue advanced but no current head could be resolved',
        });
      }

      return res.json({
        ok: true,
        skippedDelete,
        reason: reason || 'advanced',
        nowPlaying,
      });
    } catch (e) {
      console.error('/queue/advance error:', e?.message || String(e));
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
