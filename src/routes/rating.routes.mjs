export function registerRatingRoutes(app, deps) {
  const {
    clampRating,
    isStreamPath,
    isAirplayFile,
    getRatingForFile,
    setRatingForFile,
    fetchJson,
    MOODE_BASE_URL,
    bumpRatingCache,
  } = deps;

  app.get('/rating', async (req, res) => {
    try {
      const file = String(req.query.file || '').trim();
      if (!file) return res.status(400).json({ ok: false, error: 'Missing ?file=' });

      if (isStreamPath(file) || isAirplayFile(file)) {
        return res.json({ ok: true, file, rating: 0, disabled: true });
      }

      const rating = await getRatingForFile(file);
      return res.json({ ok: true, file, rating });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/rating', async (req, res) => {
    try {
      const file = String(req?.body?.file || '').trim();
      if (!file) return res.status(400).json({ ok: false, error: 'Missing JSON body { file, rating }' });

      if (isStreamPath(file) || isAirplayFile(file)) {
        return res.json({ ok: true, file, rating: 0, disabled: true });
      }

      const r = clampRating(req?.body?.rating);
      if (r === null) return res.status(400).json({ ok: false, error: 'rating must be an integer 0..5' });

      const newRating = await setRatingForFile(file, r);
      return res.json({ ok: true, file, rating: newRating });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/rating/current', async (req, res) => {
    try {
      const song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      const file = String(song.file || '').trim();

      if (!file || isStreamPath(file) || isAirplayFile(file)) {
        return res.json({ ok: true, file: file || '', rating: 0, disabled: true });
      }

      const rating = await getRatingForFile(file);
      return res.json({ ok: true, file, rating, disabled: false });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/rating/current', async (req, res) => {
    try {
      const raw = req?.body?.rating;
      const r = clampRating(raw);
      if (!Number.isFinite(Number(raw))) {
        return res.status(400).json({ ok: false, error: 'rating must be a number 0..5' });
      }

      let song;
      try {
        song = await fetchJson(`${MOODE_BASE_URL}/command/?cmd=get_currentsong`);
      } catch (e) {
        return res.status(503).json({
          ok: false,
          error: 'get_currentsong unavailable',
          detail: e?.message || String(e),
        });
      }

      const file = String(song?.file || '').trim();
      const disabled = !file || isStreamPath(file) || isAirplayFile(file);
      if (disabled) {
        try { bumpRatingCache(file || '', 0); } catch {}
        return res.json({ ok: true, file: file || '', rating: 0, disabled: true });
      }

      const newRating = await setRatingForFile(file, r);
      try { bumpRatingCache(file, newRating); } catch {}

      return res.json({ ok: true, file, rating: newRating, disabled: false });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
