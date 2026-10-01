function text(value) {
  return String(value ?? '').trim();
}

function requestBaseUrl(req) {
  const host = text(req?.get?.('host'));
  return host ? `${req?.protocol || 'http'}://${host}` : '';
}

export function registerConfigListeningHistoryRoutes(app, {
  requireTrackKey,
  getItems,
  getEvents,
  trackKey = '',
} = {}) {
  const register = (path, kind) => {
    app.get(path, async (req, res) => {
      try {
        if (typeof requireTrackKey === 'function' && !requireTrackKey(req, res)) return;
        if (typeof getItems !== 'function') return res.status(503).json({ ok: false, error: 'local listening history is unavailable' });

        const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 18) || 18));
        const period = text(req.query?.period || 'overall').toLocaleLowerCase() || 'overall';
        const windowDays = Number(req.query?.windowDays || 0) || 0;
        const items = await getItems({
          kind,
          limit,
          period,
          windowDays,
          baseUrl: requestBaseUrl(req),
          trackKey,
        });

        return res.json({
          ok: true,
          source: 'local-history',
          provider: 'local-history',
          period,
          items: Array.isArray(items) ? items : [],
        });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error?.message || String(error) });
      }
    });
  };

  register('/config/listening-history/top-tracks', 'top-tracks');
  register('/config/listening-history/recent-tracks', 'recent-tracks');
  register('/config/listening-history/top-artists', 'top-artists');
  register('/config/listening-history/top-albums', 'top-albums');

  app.get('/config/listening-history/events', async (req, res) => {
    try {
      if (typeof requireTrackKey === 'function' && !requireTrackKey(req, res)) return;
      if (typeof getEvents !== 'function') return res.status(503).json({ ok: false, error: 'local listening history is unavailable' });
      const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 50) || 50));
      return res.json({ ok: true, source: 'local-history', events: await getEvents({ limit }) });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });
}
