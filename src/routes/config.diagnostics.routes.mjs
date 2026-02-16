import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST } from '../config.mjs';

const execFileP = promisify(execFile);

export function registerConfigDiagnosticsRoutes(app, deps) {
  const { requireTrackKey, getRatingForFile, setRatingForFile } = deps;
  const configPath = process.env.NOW_PLAYING_CONFIG_PATH || `${process.cwd()}/config/now-playing.config.json`;

  async function isRatingsEnabled() {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return Boolean(cfg?.features?.ratings ?? true);
    } catch {
      return true;
    }
  }

  app.post('/config/diagnostics/playback', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const action = String(req.body?.action || '').trim().toLowerCase();
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const map = { play: 'play', pause: 'pause', toggle: 'toggle', next: 'next', prev: 'prev', stop: 'stop' };

      if (action === 'shuffle') {
        const { stdout: beforeStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const wasOn = /random:\s*on/i.test(String(beforeStatus || ''));
        const setTo = wasOn ? 'off' : 'on';
        await execFileP('mpc', ['-h', mpdHost, 'random', setTo]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'remove') {
        const posRaw = Number(req.body?.position);
        const pos = Number.isFinite(posRaw) ? Math.max(1, Math.floor(posRaw)) : 0;
        if (!pos) return res.status(400).json({ ok: false, error: 'position is required for remove' });
        await execFileP('mpc', ['-h', mpdHost, 'del', String(pos)]);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, removedPosition: pos, randomOn, status: String(afterStatus || '') });
      }

      if (action === 'rate') {
        const ratingsEnabled = await isRatingsEnabled();
        if (!ratingsEnabled) return res.status(403).json({ ok: false, error: 'Ratings feature is disabled' });
        if (typeof setRatingForFile !== 'function') return res.status(501).json({ ok: false, error: 'rating dependency not wired' });
        const file = String(req.body?.file || '').trim();
        const ratingRaw = Number(req.body?.rating);
        const rating = Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, Math.round(ratingRaw))) : -1;
        if (!file) return res.status(400).json({ ok: false, error: 'file is required for rate' });
        if (rating < 0) return res.status(400).json({ ok: false, error: 'rating must be 0..5' });
        await setRatingForFile(file, rating);
        const { stdout: afterStatus } = await execFileP('mpc', ['-h', mpdHost, 'status']);
        const randomOn = /random:\s*on/i.test(String(afterStatus || ''));
        return res.json({ ok: true, action, file, rating, randomOn, status: String(afterStatus || '') });
      }

      const cmd = map[action];
      if (!cmd) return res.status(400).json({ ok: false, error: 'Invalid action' });
      await execFileP('mpc', ['-h', mpdHost, cmd]);
      const { stdout } = await execFileP('mpc', ['-h', mpdHost, 'status']);
      const randomOn = /random:\s*on/i.test(String(stdout || ''));
      return res.json({ ok: true, action, randomOn, status: String(stdout || '') });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get('/config/diagnostics/queue', async (req, res) => {
    try {
      if (!requireTrackKey(req, res)) return;
      const mpdHost = String(MPD_HOST || '10.0.0.254');
      const ratingsEnabled = await isRatingsEnabled();
      const [{ stdout: qOut }, { stdout: sOut }] = await Promise.all([
        execFileP('mpc', ['-h', mpdHost, '-f', '%position%\t%artist%\t%title%\t%album%\t%file%', 'playlist']),
        execFileP('mpc', ['-h', mpdHost, 'status']),
      ]);
      const st = String(sOut || '');
      const m = st.match(/#(\d+)\/(\d+)/);
      const headPos = m ? Number(m[1] || 0) : -1;
      const randomOn = /random:\s*on/i.test(st);

      const lines = String(qOut || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean);
      const items = [];
      for (const ln of lines) {
        const [position = '', artist = '', title = '', album = '', file = ''] = ln.split('\t');
        const pos = Number(position || 0);
        const f = String(file || '').trim();
        let rating = 0;
        if (ratingsEnabled && f && typeof getRatingForFile === 'function') {
          try { rating = Number(await getRatingForFile(f)) || 0; } catch {}
        }
        const artistTxt = String(artist || '').trim();
        const titleTxt = String(title || '').trim();
        const albumTxt = String(album || '').trim();
        const podcastBlob = `${f}\n${artistTxt}\n${titleTxt}\n${albumTxt}`.toLowerCase();
        const isPodcast = /\bpodcast\b/.test(podcastBlob) || /\/podcasts?\//.test(podcastBlob);
        items.push({
          position: pos,
          isHead: Number.isFinite(pos) && pos === headPos,
          artist: artistTxt,
          title: titleTxt,
          album: albumTxt,
          file: f,
          isPodcast,
          rating: Math.max(0, Math.min(5, Math.round(Number(rating) || 0))),
          thumbUrl: f ? `/art/track_640.jpg?file=${encodeURIComponent(f)}` : '',
        });
      }
      return res.json({ ok: true, count: items.length, headPos, randomOn, ratingsEnabled, items });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
