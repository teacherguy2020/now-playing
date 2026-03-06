import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PROFILE = {
  devicePreset: 'iphone17',
  theme: 'auto',
  layout: 'home-rail',
  showRecent: true,
  recentSource: 'albums',
  colorPreset: 'ocean',
  recentCount: 18,
};

function sanitizeProfile(input = {}) {
  const p = (input && typeof input === 'object') ? input : {};
  const colorPreset = String(p.colorPreset || DEFAULT_PROFILE.colorPreset).toLowerCase();
  const recentSource = String(p.recentSource || DEFAULT_PROFILE.recentSource).toLowerCase();
  return {
    devicePreset: String(p.devicePreset || DEFAULT_PROFILE.devicePreset),
    theme: String(p.theme || DEFAULT_PROFILE.theme),
    layout: String(p.layout || DEFAULT_PROFILE.layout),
    showRecent: Boolean(p.showRecent ?? DEFAULT_PROFILE.showRecent),
    recentSource: ['albums','podcasts','playlists','radio'].includes(recentSource) ? recentSource : DEFAULT_PROFILE.recentSource,
    colorPreset: ['ocean','violet','mint','amber','black','orange'].includes(colorPreset) ? colorPreset : DEFAULT_PROFILE.colorPreset,
    recentCount: Math.max(6, Math.min(30, Number(p.recentCount || DEFAULT_PROFILE.recentCount) || DEFAULT_PROFILE.recentCount)),
  };
}

export function registerConfigControllerProfileRoutes(app, deps) {
  const { requireTrackKey } = deps;
  const profilePath = process.env.NOW_PLAYING_CONTROLLER_PROFILE_PATH || path.resolve(process.cwd(), 'data/controller-profile.json');

  app.get('/config/controller-profile', async (_req, res) => {
    try {
      const raw = await fs.readFile(profilePath, 'utf8').catch(() => '');
      const parsed = raw ? JSON.parse(raw) : {};
      return res.json({ ok: true, profile: sanitizeProfile(parsed) });
    } catch (e) {
      return res.json({ ok: true, profile: { ...DEFAULT_PROFILE }, warning: e?.message || String(e) });
    }
  });

  app.post('/config/controller-profile', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const profile = sanitizeProfile(req.body?.profile || req.body || {});
      await fs.mkdir(path.dirname(profilePath), { recursive: true });
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
      return res.json({ ok: true, profile });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
