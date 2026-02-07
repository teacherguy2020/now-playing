import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export function registerPodcastDownloadRoutes(app, deps) {
  const {
    normUrl,
    readSubs,
    makePodcastId,
    ensureDir,
    safeFileName,
    downloadToFile,
    embedArtWithFfmpeg,
    hasAttachedPic,
    replaceFileAtomic,
    safeUnlink,
    fetchPodcastRSS,
    downloadCoverForSub,
    resolveFinalUrl,
    stripQueryHash,
    downloadWithFetch,
    tagAudioFileWithFfmpeg,
    yyyyMmDd,
    getLocalItemsForSub,
    buildPodcastMapFromLocalItems,
    buildLocalPlaylistForRss,
  } = deps;

  app.post('/podcasts/build-playlist', async (req, res) => {
    try {
      const rss = normUrl(req.body?.rss);
      const newestFirst = req.body?.newestFirst !== false;
      const limit = Math.max(1, Math.min(5000, Number(req.body?.limit || 500)));

      if (!rss) return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });

      const items = readSubs();
      const sub = items.find(it => normUrl(it?.rss) === rss);
      if (!sub) return res.status(404).json({ ok: false, error: 'Subscription not found', rss });

      const dir = String(sub.dir || '').trim();
      const mpdPrefix = String(sub.mpdPrefix || '').trim();
      if (!dir || !mpdPrefix) {
        return res.status(400).json({
          ok: false,
          error: 'Subscription missing dir/mpdPrefix (download folder). Re-subscribe or fix subscriptions.json.',
          rss,
          dir: dir || null,
          mpdPrefix: mpdPrefix || null,
        });
      }

      const base =
        String(req.body?.name || '').trim() ||
        String(sub.slug || '').trim() ||
        makePodcastId(rss);

      const playlistName = `${base}-local`;
      const playlistFile = `/var/lib/mpd/playlists/${playlistName}.m3u`;

      const exts = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wav']);
      const entries = [];

      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        names = [];
      }

      for (const name of names) {
        if (!exts.has(path.extname(name).toLowerCase())) continue;

        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          entries.push({ name, full, mtimeMs: st.mtimeMs || 0 });
        } catch {}
      }

      if (!entries.length) {
        return res.json({
          ok: true,
          rss,
          playlistName,
          wrote: false,
          reason: 'No local audio files found in dir yet',
          dir,
          mpdPrefix,
          count: 0,
        });
      }

      entries.sort((a, b) =>
        newestFirst ? (b.mtimeMs - a.mtimeMs) : (a.mtimeMs - b.mtimeMs)
      );

      const chosen = entries.slice(0, limit);
      const lines = chosen.map(x => `${mpdPrefix}/${x.name}`).join('\n') + '\n';

      const MOODE_HOST = process.env.MOODE_HOST || '10.0.0.254';
      const MOODE_USER = process.env.MOODE_USER || 'moode';
      const MPD_PORT = Number(process.env.MPD_PORT || 6600);

      const execFileP = (cmd, args, opts = {}) =>
        new Promise((resolve, reject) => {
          const child = execFile(cmd, args, { ...opts }, (err, stdout, stderr) => {
            if (err) {
              err.stdout = stdout;
              err.stderr = stderr;
              return reject(err);
            }
            resolve({ stdout, stderr });
          });

          if (opts.input != null) child.stdin.end(opts.input);
        });

      await execFileP(
        'ssh',
        [`${MOODE_USER}@${MOODE_HOST}`, 'sudo', 'tee', playlistFile],
        { input: lines, maxBuffer: 10 * 1024 * 1024 }
      );

      await execFileP('mpc', ['-h', MOODE_HOST, '-p', String(MPD_PORT), 'update', mpdPrefix]);

      return res.json({
        ok: true,
        rss,
        playlistName,
        playlistFile,
        dir,
        mpdPrefix,
        newestFirst,
        limit,
        count: chosen.length,
        sample: chosen.slice(0, 5).map(x => x.name),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/podcasts/download-one', async (req, res) => {
    try {
      const rss = normUrl(req.body?.rss);
      const id = String(req.body?.id || '').trim().toLowerCase();
      const enclosure = String(req.body?.enclosure || '').trim();
      const imageUrl = String(req.body?.imageUrl || '').trim();

      if (!rss) return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });
      if (!/^[a-f0-9]{12}$/.test(id)) return res.status(400).json({ ok: false, error: 'Missing/invalid id' });
      if (!/^https?:\/\//i.test(enclosure)) return res.status(400).json({ ok: false, error: 'Missing/invalid enclosure' });

      const subs = readSubs();
      const sub = subs.find(it => normUrl(it?.rss) === rss);
      if (!sub) return res.status(404).json({ ok: false, error: 'Subscription not found', rss });

      if (!sub.dir || !sub.mpdPrefix) {
        return res.status(400).json({ ok: false, error: 'Subscription missing required fields (dir/mpdPrefix)', rss });
      }

      const rawTitle = String(req.body?.title || '').trim();
      const rawDate = String(req.body?.date || '').trim();
      const show = String(sub?.title || sub?.name || 'Podcast').trim();

      const dateTag = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
      const yearTag =
        /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate.slice(0, 4) :
          /^\d{4}$/.test(rawDate) ? rawDate :
            '';

      const finalName = `${id}.mp3`;
      const finalPath = path.join(sub.dir, finalName);
      await ensureDir(finalPath);

      const destDir = path.dirname(finalPath);
      const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

      const mp3Tmp = path.join(destDir, `.${finalName}.${nonce}.dl.tmp.mp3`);
      const jpgTmp = path.join(destDir, `.${id}.${nonce}.tmp.jpg`);
      const outTmp = path.join(destDir, `.${finalName}.${nonce}.tagged.tmp.mp3`);

      let embeddedArt = false;

      try {
        await downloadToFile(enclosure, mp3Tmp, { retries: 3 });

        let toInstall = mp3Tmp;

        if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
          await downloadToFile(imageUrl, jpgTmp, { retries: 3 });

          await embedArtWithFfmpeg({
            mp3In: mp3Tmp,
            imgIn: jpgTmp,
            mp3Out: outTmp,
            title: rawTitle,
            show,
            date: dateTag,
            year: yearTag,
          });

          const ok = await hasAttachedPic(outTmp);
          if (ok) {
            toInstall = outTmp;
            embeddedArt = true;
          } else {
            toInstall = mp3Tmp;
            embeddedArt = false;
          }
        }

        await replaceFileAtomic(toInstall, finalPath);

        return res.json({
          ok: true,
          rss,
          id,
          filename: finalName,
          mpdPath: `${sub.mpdPrefix}/${finalName}`,
          embeddedArt,
        });
      } finally {
        await safeUnlink(mp3Tmp);
        await safeUnlink(jpgTmp);
        await safeUnlink(outTmp);
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post('/podcasts/download-latest', async (req, res) => {
    try {
      const rss = normUrl(req.body?.rss);
      const count = Math.max(0, Math.min(50, Number(req.body?.count ?? 5)));

      if (!rss) {
        return res.status(400).json({ ok: false, error: 'Missing/invalid rss' });
      }

      const subs = readSubs();
      const sub = subs.find(it => normUrl(it?.rss) === rss);
      if (!sub) {
        return res.status(404).json({ ok: false, error: 'Subscription not found', rss });
      }

      if (!sub.dir || !sub.mpdPrefix || !sub.outM3u || !sub.mapJson) {
        return res.status(400).json({
          ok: false,
          error: 'Subscription missing required fields (dir/mpdPrefix/outM3u/mapJson)',
          rss,
        });
      }

      await fsp.mkdir(sub.dir, { recursive: true });

      const limit = Number(sub.limit || 200);
      const scanN = Math.max(count, Math.min(limit, 200));

      const feed = await fetchPodcastRSS(rss, scanN);
      await downloadCoverForSub(sub, feed);
      const feedItems = Array.isArray(feed?.items) ? feed.items : [];
      const episodes = feedItems.slice(0, count);

      const existing = new Set();
      try {
        for (const f of fs.readdirSync(sub.dir)) existing.add(f);
      } catch {}

      const results = [];

      for (const ep of episodes) {
        const rawUrl = String(ep?.enclosure || '').trim();
        if (!rawUrl) continue;

        const finalUrl = await resolveFinalUrl(rawUrl);
        const canonUrl = stripQueryHash(finalUrl || rawUrl);

        const guid = String(ep?.guid || '').trim();
        const seed = guid || canonUrl;
        const id = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);

        let ext = '.mp3';
        try {
          const u = new URL(canonUrl);
          const base = path.basename(u.pathname) || '';
          const m = base.toLowerCase().match(/\.(mp3|m4a|aac|mp4)$/);
          if (m) ext = `.${m[1]}`;
        } catch {}

        const filename = safeFileName(`${id}${ext}`, `episode${ext}`);

        if (existing.has(filename)) {
          results.push({ ok: true, skipped: true, id, filename });
          continue;
        }

        const outPath = path.join(sub.dir, filename);
        await downloadWithFetch(canonUrl, outPath);
        existing.add(filename);

        try {
          await tagAudioFileWithFfmpeg(outPath, {
            title: String(ep?.title || '').trim() || id,
            album: String(sub.title || '').trim() || 'Podcast',
            artist: String(sub.title || '').trim() || 'Podcast',
            date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || ''),
            genre: 'Podcast',
            comment: canonUrl,
          });
        } catch {}

        results.push({
          ok: true,
          skipped: false,
          id,
          filename,
          saved: { path: outPath, mpdPath: `${sub.mpdPrefix}/${filename}` },
        });
      }

      const metaByStem = Object.create(null);

      for (const ep of feedItems) {
        const rawUrl = String(ep?.enclosure || '').trim();
        if (!rawUrl) continue;

        const finalUrl = await resolveFinalUrl(rawUrl);
        const canonUrl = stripQueryHash(finalUrl || rawUrl);

        const guid = String(ep?.guid || '').trim();
        const seed = guid || canonUrl;
        const id = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);

        metaByStem[id] = {
          title: String(ep?.title || '').trim(),
          date: yyyyMmDd(ep?.isoDate || ep?.pubDate || ep?.published || ep?.date || ''),
        };
      }

      const localItems = await getLocalItemsForSub(sub, metaByStem);

      const mapRes = await buildPodcastMapFromLocalItems({
        sub,
        items: localItems,
        outM3u: sub.outM3u,
        mapJson: sub.mapJson,
      });

      try {
        await buildLocalPlaylistForRss({ rss: sub.rss });
      } catch {}

      return res.json({
        ok: true,
        rss,
        requested: count,
        processed: results.length,
        results,
        map: mapRes,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
