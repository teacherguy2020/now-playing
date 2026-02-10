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
    execFileP,
    MPD_HOST,
  } = deps;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const CHRISTMAS_GENRE_RE = /christmas/i;

  const mpdQuote = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  function parseMpdSongs(raw) {
    const lines = String(raw || '').split(/\r?\n/);
    const songs = [];
    let cur = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = m[2];

      if (k === 'file') {
        if (cur && cur.file) songs.push(cur);
        cur = { file: v.trim(), genres: [] };
        continue;
      }

      if (!cur) continue;
      if (k === 'genre') cur.genres.push(String(v || '').trim());
    }

    if (cur && cur.file) songs.push(cur);
    return songs;
  }

  function parseFileLines(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function mpcList(command, field, value) {
    const { stdout } = await execFileP('mpc', ['-h', String(MPD_HOST || ''), command, field, String(value || '')]);
    return parseFileLines(stdout || '');
  }

  async function mpcListMulti(command, pairs) {
    const args = ['-h', String(MPD_HOST || ''), command, ...pairs.map((x) => String(x || ''))];
    const { stdout } = await execFileP('mpc', args);
    return parseFileLines(stdout || '');
  }

  async function mpdCmdOk(cmd) {
    const out = await mpdQueryRaw(cmd);
    if (/^ACK\s/i.test(String(out || '').trim())) {
      throw new Error(`MPD command failed: ${cmd} :: ${String(out || '').trim()}`);
    }
    return out;
  }

  async function getRatingForFile(file) {
    const f = String(file || '').trim();
    if (!f) return 0;
    const raw = await mpdQueryRaw(`sticker get song ${mpdQuote(f)} rating`);
    const s = String(raw || '').trim();
    if (!s || /^ACK\s/i.test(s)) return 0;
    const m = s.match(/sticker:\s*rating\s*=\s*([0-9]+)/i);
    const n = m ? Number.parseInt(m[1], 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }

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

  app.post('/queue/mix', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;

      const artistsRaw = Array.isArray(req?.body?.artists) ? req.body.artists : [];
      const artists = artistsRaw
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      if (!artists.length) {
        return res.status(400).json({ ok: false, error: 'artists[] is required' });
      }

      const excludeHoliday = req?.body?.excludeHoliday !== false;
      const clearFirst = req?.body?.clearFirst !== false;
      const randomOn = req?.body?.random !== false;
      const startPlayback = req?.body?.startPlayback === true;
      const maxTracks = Math.max(1, Math.min(5000, Number(req?.body?.maxTracks || 300)));

      if (clearFirst) await mpdCmdOk('clear');

      const seen = new Set();
      const byArtist = {};
      const debugByArtist = {};
      const ratingCache = new Map();
      let added = 0;

      for (const artist of artists) {
        byArtist[artist] = 0;

        // Use mpc CLI queries (matches what user sees in moOde UI much more closely)
        const noSpace = artist.replace(/\s+/g, '');

        const filesFindArtist = await mpcList('find', 'artist', artist);
        const filesSearchArtist = await mpcList('search', 'artist', artist);
        const filesFindAlbumArtist = await mpcList('find', 'albumartist', artist);
        const filesSearchAlbumArtist = await mpcList('search', 'albumartist', artist);
        const filesSearchAnyPhrase = await mpcList('search', 'any', artist);
        const filesSearchAnyCompact = (noSpace && noSpace !== artist)
          ? await mpcList('search', 'any', noSpace)
          : [];

        const byFile = new Map();
        for (const f of [
          ...filesFindArtist,
          ...filesSearchArtist,
          ...filesFindAlbumArtist,
          ...filesSearchAlbumArtist,
          ...filesSearchAnyPhrase,
          ...filesSearchAnyCompact,
        ]) {
          const file = String(f || '').trim();
          if (!file) continue;
          if (!byFile.has(file)) byFile.set(file, { file, genres: [] });
        }

        // Precompute Christmas-tagged files once per artist (fast), avoid per-file metadata lookups.
        const christmasFiles = new Set();
        if (excludeHoliday) {
          for (const f of await mpcListMulti('find', ['artist', artist, 'genre', 'Christmas'])) christmasFiles.add(f);
          for (const f of await mpcListMulti('find', ['albumartist', artist, 'genre', 'Christmas'])) christmasFiles.add(f);
          for (const f of await mpcListMulti('search', ['artist', artist, 'genre', 'Christmas'])) christmasFiles.add(f);
          for (const f of await mpcListMulti('search', ['albumartist', artist, 'genre', 'Christmas'])) christmasFiles.add(f);
          for (const f of await mpcListMulti('search', ['any', artist, 'genre', 'Christmas'])) christmasFiles.add(f);
        }

        const parsedFind = filesFindArtist;
        const parsedSearch = filesSearchArtist;
        const parsedFindAlbumArtist = filesFindAlbumArtist;
        const parsedSearchAlbumArtist = filesSearchAlbumArtist;
        const parsedSearchFileSpaced = [];
        const parsedSearchFileCompact = [];
        const parsedSearchAnyPhrase = filesSearchAnyPhrase;
        const tokenSongsByFile = byFile;

        let excludedChristmas = 0;
        let excludedRating1 = 0;
        let skippedAlreadySeen = 0;
        const candidateCount = byFile.size;

        for (const song of byFile.values()) {
          if (added >= maxTracks) break;
          const file = String(song.file || '').trim();
          if (!file) continue;
          if (seen.has(file)) {
            skippedAlreadySeen += 1;
            continue;
          }

          // Holiday exclusion policy: ONLY exclude tracks tagged with Genre containing "Christmas".
          if (excludeHoliday) {
            const isChristmas = christmasFiles.has(file) || (Array.isArray(song.genres) && song.genres.some((g) => CHRISTMAS_GENRE_RE.test(String(g || ''))));
            if (isChristmas) {
              excludedChristmas += 1;
              continue;
            }
          }

          let rating = ratingCache.get(file);
          if (rating === undefined) {
            try { rating = await getRatingForFile(file); } catch (_) { rating = 0; }
            ratingCache.set(file, rating);
          }
          if (Number(rating) === 1) {
            excludedRating1 += 1;
            continue;
          }

          await mpdCmdOk(`add ${mpdQuote(file)}`);
          seen.add(file);
          added += 1;
          byArtist[artist] += 1;
        }

        debugByArtist[artist] = {
          parsedFind: parsedFind.length,
          parsedSearch: parsedSearch.length,
          parsedFindAlbumArtist: parsedFindAlbumArtist.length,
          parsedSearchAlbumArtist: parsedSearchAlbumArtist.length,
          parsedSearchFileSpaced: parsedSearchFileSpaced.length,
          parsedSearchFileCompact: parsedSearchFileCompact.length,
          parsedSearchAnyPhrase: parsedSearchAnyPhrase.length,
          parsedSearchAnyTokensCommon: tokenSongsByFile.size,
          uniqueCandidates: candidateCount,
          excludedChristmas,
          excludedRating1,
          skippedAlreadySeen,
          added: byArtist[artist],
        };
      }

      await mpdCmdOk(`random ${randomOn ? 1 : 0}`);

      let randomizedHeadFromPos = null;
      if (randomOn && added > 1) {
        try {
          const fromPos = Math.floor(Math.random() * added);
          if (fromPos > 0) {
            await mpdCmdOk(`move ${fromPos} 0`);
            randomizedHeadFromPos = fromPos;
          }
        } catch (e) {
          log.debug('[queue/mix] random head move failed:', e?.message || String(e));
        }
      }

      let startedPlayback = false;
      if (startPlayback && added > 0) {
        try {
          await mpdCmdOk('play');
          startedPlayback = true;
        } catch (_) {}
      }

      const statusRaw = await mpdCmdOk('status');
      const status = parseMpdKeyVals(statusRaw || '');
      const random = String(status.random || '').trim();

      let nowPlaying = null;
      try {
        nowPlaying = await resolveHeadFast();
        if (!nowPlaying) nowPlaying = await resolveHeadFallbackMoode();

        // If queue is built but MPD isn't actively playing, return queue head (pos 0)
        if (!nowPlaying && added > 0) {
          const firstRaw = await mpdCmdOk('playlistinfo 0:1');
          const first = parseMpdFirstBlock(firstRaw || '');
          const f = String(first.file || '').trim();
          if (f) {
            nowPlaying = {
              file: f,
              title: decodeHtmlEntities(String(first.title || '').trim()),
              artist: decodeHtmlEntities(String(first.artist || '').trim()),
              album: decodeHtmlEntities(String(first.album || '').trim()),
              songpos: '0',
              songid: String(first.id || '').trim(),
              source: 'mpd-queue-head',
            };
          }
        }
      } catch (_) {}

      return res.json({
        ok: true,
        artists,
        excludeHoliday,
        clearFirst,
        random: random === '1',
        randomizedHeadFromPos,
        startPlayback,
        startedPlayback,
        maxTracks,
        added,
        byArtist,
        debugByArtist,
        nowPlaying,
      });
    } catch (e) {
      console.error('/queue/mix error:', e?.message || String(e));
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
