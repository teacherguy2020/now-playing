console.log('PODCASTS_UI_VERSION', '2026-02-08_3');
  const statusEl   = document.getElementById('status');
  const statusWrap = document.getElementById('statusWrap');
  const listEl     = document.getElementById('list');
  const subCountEl = document.getElementById('subCount');

  const rssEl      = document.getElementById('rss');
  const dlEl       = document.getElementById('download');
  const limitEl    = document.getElementById('limit');
  const logEl      = document.getElementById('log');

  const btnSub     = document.getElementById('btnSub');
  const btnRefresh = document.getElementById('btnRefresh');

  const API_BASE = (() => {
    const q = new URLSearchParams(window.location.search);
    const override = (q.get('api') || '').trim();
    if (override) return override.replace(/\/$/, '');

    const host = window.location.hostname || '10.0.0.233';
    return `http://${host}:3101`;
  })();

  const apiHintEl = document.getElementById('apiHint');
  if (apiHintEl) apiHintEl.textContent = API_BASE.replace(/^https?:\/\//, '');

  // =========================
  // Modal
  // =========================
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose   = document.getElementById('modalClose');
  const modalTitle   = document.getElementById('modalTitle');
  const modalSub     = document.getElementById('modalSub');
  const modalHint    = document.getElementById('modalHint');
  const epList       = document.getElementById('epList');
  const modalCount   = document.getElementById('modalCount');
  const modalThumb   = document.getElementById('modalThumb');

  const modalRefresh          = document.getElementById('modalRefresh');
  const modalSelectAll        = document.getElementById('modalSelectAll');
  const modalDownloadSelected = document.getElementById('modalDownloadSelected');
  const modalDeleteSelected   = document.getElementById('modalDeleteSelected');

  let modalCtx = null;     // { rss, title, imageUrl, mapJson, limit }
  let lastEpisodes = [];   // list currently rendered
  
  
  
  function openModal(ctx) {
    modalCtx = ctx || null;

    modalTitle.textContent = (ctx && ctx.title) ? ctx.title : 'Podcast';
    modalSub.textContent   = (ctx && ctx.rss) ? ctx.rss : '';

    modalThumb.src = (ctx && ctx.imageUrl)
      ? ctx.imageUrl
      : placeholderSvgDataUri(modalTitle.textContent);

    modalHint.textContent = 'Loading…';
    epList.innerHTML = '';
    modalCount.textContent = '';

    modalOverlay.classList.add('open');
    document.body.classList.add('modal-open');
    modalOverlay.setAttribute('aria-hidden', 'false');

    updateModalActionState();
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    modalOverlay.setAttribute('aria-hidden', 'true');
    modalCtx = null;
    lastEpisodes = [];
  }
  
  const modalBusy = document.getElementById('modalBusy');

  function setModalBusy(on, hintText = '') {
    if (modalBusy) modalBusy.classList.toggle('on', !!on);

    // optional hint text update
    if (hintText) modalHint.textContent = hintText;

    // disable modal buttons while busy
    if (modalRefresh) modalRefresh.disabled = !!on;
    if (modalSelectAll) modalSelectAll.disabled = !!on;
    if (modalDeleteSelected) modalDeleteSelected.disabled = !!on;
    if (modalDownloadSelected) modalDownloadSelected.disabled = !!on;
  }

  modalClose.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  // =========================
  // Helpers
  // =========================
  function setStatus(msg, cls='muted') {
    statusEl.className = 'statusText' + (cls === 'ok' ? ' ok' : cls === 'err' ? ' err' : '');
    statusEl.textContent = msg;
  }

  function setBusy(isBusy) {
    statusWrap.classList.toggle('busy', !!isBusy);

    btnSub.disabled = !!isBusy;
    btnRefresh.disabled = !!isBusy;
    rssEl.disabled = !!isBusy;
    dlEl.disabled = !!isBusy;
    limitEl.disabled = !!isBusy;
  }

  function log(msg, obj) {
    const line = (obj !== undefined)
      ? `${msg} ${JSON.stringify(obj, null, 2)}`
      : msg;

    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])
    );
  }

  function placeholderSvgDataUri(label = "Podcast") {
    const text = String(label || "Podcast").slice(0, 18).replace(/[&<>"]/g, '');
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#1b2a4a"/>
            <stop offset="1" stop-color="#2b174a"/>
          </linearGradient>
        </defs>
        <rect width="112" height="112" rx="18" fill="url(#g)"/>
        <circle cx="84" cy="28" r="10" fill="rgba(125,211,252,.35)"/>
        <circle cx="28" cy="86" r="12" fill="rgba(167,139,250,.28)"/>
        <text x="56" y="62" text-anchor="middle"
              font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
              font-size="14" fill="rgba(255,255,255,.90)">${text}</text>
      </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function apiGet(path) {
    const r = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function apiPost(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  function canonicalEpisodeIdFromKeyOrUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';

    const idMatch = s.match(/^id:([A-Za-z]+[0-9]+)/);
    if (idMatch) return idMatch[1];

    const nprMatch = s.match(/(NPR[0-9]{6,})/);
    if (nprMatch) return nprMatch[1];

    try {
      const u = new URL(s);
      const last = (u.pathname.split('/').pop() || '').replace(/\.mp3$/i, '');
      if (last) return last;
    } catch (_) {}

    return s;
  }

function updateModalActionState() {
  const checked = Array.from(epList.querySelectorAll('input.epChk:checked'));

  const anyDownloadedChecked = checked.some(
    b => b.dataset.downloaded === '1'
  );

  // Only enable Download Selected if at least one checked item is NOT downloaded
  // AND has a valid enclosure URL we can actually download.
  const anyDownloadableChecked = checked.some(
    b =>
      b.dataset.downloaded !== '1' &&
      /^https?:\/\//i.test(String(b.dataset.url || '').trim())
  );

  modalDeleteSelected.disabled = !anyDownloadedChecked;
  modalDownloadSelected.disabled = !anyDownloadableChecked;
}
  // =========================
  // Episodes UI
  // =========================


function renderEpisodes(eps) {
  epList.innerHTML = '';

  if (!eps || !eps.length) {
    modalHint.textContent = 'No episodes found.';
    modalCount.textContent = '0 episode(s)';
    updateModalActionState();
    return;
  }

  modalHint.textContent = '';
  modalCount.textContent = `${eps.length} episode(s)`;

  for (const ep of eps) {
    const row = document.createElement('div');
    row.className = 'epRow';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'epChk';

    // Prefer explicit id; fall back to key "id:xxxx" if needed
    const id =
      String(ep.id || '').trim() ||
      String(ep.key || '').trim().replace(/^id:/i, '');

    const enclosure = String(ep.enclosure || '').trim();
    const title = String(ep.title || '').trim();
    const date = String(ep.date || '').trim();
    const filename = String(ep.filename || '').trim();
    const downloaded = !!ep.downloaded;

    const imageUrl = String(ep.imageUrl || ep.image || '').trim();
chk.dataset.imageUrl = imageUrl;

    chk.dataset.epid = id;
    chk.dataset.url = enclosure;
    chk.dataset.title = title;
    chk.dataset.date = date;
    chk.dataset.downloaded = downloaded ? '1' : '0';
    chk.dataset.image = imageUrl;

    chk.addEventListener('change', updateModalActionState);

    const main = document.createElement('div');
    main.className = 'epMain';

    const t = document.createElement('div');
    t.className = 'epTitle';
    t.textContent = title || '(untitled)';

    const m = document.createElement('div');
    m.className = 'epMeta';
    m.textContent = downloaded
      ? (filename || 'Downloaded')
      : 'Not downloaded';

    if (downloaded) {
      row.classList.add('epDownloaded');
    }

    main.appendChild(t);
    main.appendChild(m);

    const right = document.createElement('div');
    right.className = 'epRight';

    // Date always shows
    const dateEl = document.createElement('div');
    dateEl.className = 'epDate';
    dateEl.textContent = date || '';
    right.appendChild(dateEl);

    // ▶️ Play button only when downloaded AND we have a path to play
    // Prefer ep.mpdPath (best), else fall back to constructing it if filename exists.
    const mpdPath = String(ep.mpdPath || '').trim() ||
                    (filename ? `${String(modalCtx?.mpdPrefix || '').trim()}/${filename}` : '');

    if (downloaded && mpdPath) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'epPlayBtn';
      btn.title = 'Play';
      btn.setAttribute('aria-label', 'Play episode');
      btn.dataset.file = mpdPath;

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5v14l11-7z"></path>
        </svg>
      `;

      right.appendChild(btn);
    }

    row.appendChild(chk);
    row.appendChild(main);
    row.appendChild(right);

    epList.appendChild(row);
  }

  updateModalActionState();
}

// Play button handler (event delegation)
epList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.epPlayBtn');
  if (!btn) return;

  const file = String(btn.dataset.file || '').trim();
  if (!file) return;

  try {
    btn.disabled = true;
    await apiPost('/mpd/play-file', { file });
  } catch (err) {
    console.error('play-file failed:', err);
    alert(`Play failed: ${err?.message || err}`);
  } finally {
    btn.disabled = false;
  }
});

async function loadEpisodes() {
  try {
    if (!modalCtx?.rss) {
      modalHint.textContent = 'Missing rss for this subscription.';
      return;
    }

    setModalBusy(true, 'Loading…');
    epList.innerHTML = '';
    modalCount.textContent = '';
    updateModalActionState();

    const limit = Number(modalCtx.limit || limitEl.value || 50);

    // Fetch merged feed+disk view
    const j = await apiPost('/podcasts/episodes/list', {
      rss: modalCtx.rss,
      limit
    });

    // Helpful debugging (safe to remove later)
    console.log('[episodes/list] rss=', modalCtx.rss, 'limit=', limit);
    console.log('[episodes/list] downloadedCount=', j?.downloadedCount);
    console.log(
      '[episodes/list] sample:',
      (j?.episodes || []).slice(0, 10).map(e => ({
        id: e?.id,
        downloaded: e?.downloaded,
        filename: e?.filename,
        mpdPath: e?.mpdPath,
        title: e?.title
      }))
    );

    const raw = Array.isArray(j?.episodes) ? j.episodes : [];

    const eps = raw.map(ep => {
      const downloaded =
        ep?.downloaded === true ||
        ep?.downloaded === 1 ||
        ep?.downloaded === '1' ||
        ep?.downloaded === 'true';

      // IMPORTANT: mpdPath is what we will POST to /mpd/play-file
      // Prefer ep.mpdPath if the API provides it; otherwise fall back to building it.
      // (If your server always returns mpdPath, this fallback won’t be used.)
      const mpdPath =
        String(ep?.mpdPath || '').trim() ||
        (modalCtx?.mpdPrefix && ep?.id
          ? `${String(modalCtx.mpdPrefix).replace(/\/$/, '')}/${String(ep.id).trim().toLowerCase()}.mp3`
          : '');

      return {
        ...ep,
        downloaded,
        enclosure: String(ep?.enclosure || ''),
        imageUrl: String(ep?.imageUrl || ep?.image || ''),
        filename: String(ep?.filename || ''),
        date: String(ep?.date || ''),
        mpdPath
      };
    });

    renderEpisodes(eps);
    modalHint.textContent = '';
  } catch (e) {
    modalHint.textContent = `Error loading episodes: ${e?.message || String(e)}`;
  } finally {
    setModalBusy(false);
  }
}

  // Modal Refresh: rebuild map/playlist, no downloads
  modalRefresh.addEventListener('click', async () => {
    if (!modalCtx?.rss) return;

    try {
      modalHint.textContent = 'Refreshing…';

      // If your API has a dedicated "refresh map" endpoint, use it instead.
      // For now, call subscribe with download=0 to rebuild map/m3u coherently.
      const limit = Number(modalCtx.limit || limitEl.value || 50);

      await apiPost('/podcasts/subscribe', {
        rss: modalCtx.rss,
        download: 0,
        limit
      });

      await loadEpisodes();
      modalHint.textContent = '';
    } catch (e) {
      modalHint.textContent = `Refresh failed: ${e.message || String(e)}`;
    }
  });

  modalSelectAll.addEventListener('click', () => {
    const boxes = Array.from(epList.querySelectorAll('input.epChk'));
    if (!boxes.length) return;

    const allChecked = boxes.every(b => b.checked);
    for (const b of boxes) b.checked = !allChecked;

    updateModalActionState();
  });

  modalDownloadSelected.addEventListener('click', async () => {
  if (!modalCtx?.rss) return;

  const checked = Array.from(epList.querySelectorAll('input.epChk:checked'));

  // Only download ones not already downloaded, and that have a feed enclosure URL
  // IMPORTANT: include the episode id so download-one can trust UI's stem
  const jobs = checked
    .filter(b => b.dataset.downloaded !== '1')
    .map(b => ({
      id: String(b.dataset.epid || '').trim().toLowerCase(),
      enclosure: String(b.dataset.url || '').trim(),
      title: String(b.dataset.title || '').trim(),
      date: String(b.dataset.date || '').trim(),
      imageUrl: String(b.dataset.imageUrl || '').trim()   // ✅ add this
    }))
    .filter(j => /^[a-f0-9]{12}$/i.test(j.id) && /^https?:\/\//i.test(j.enclosure));
  
  if (!jobs.length) {
    modalHint.textContent = 'Nothing to download (selected items are already downloaded or missing URL).';
    return;
  }

  const ok = confirm(`Download ${jobs.length} episode(s)?`);
  if (!ok) return;

  try {
    setModalBusy(true, `Downloading ${jobs.length}…`);

    let done = 0;
    for (const j of jobs) {
      await apiPost('/podcasts/download-one', {
        rss: modalCtx.rss,
        id: j.id,
        enclosure: j.enclosure,
        title: j.title,
        date: j.date,
        imageUrl: j.imageUrl || "",
      });
      done++;
      setModalBusy(true, `Downloading… ${done}/${jobs.length}`);
    }

    // Make the phase change explicit so "stuck" reports are diagnosable.
    setModalBusy(true, 'Refreshing…');
    console.log('[modal] downloads complete -> loadEpisodes()', { rss: modalCtx.rss, count: jobs.length });

    await loadEpisodes();
    modalHint.textContent = '';
  } catch (e) {
    modalHint.textContent = `Download failed: ${e.message || String(e)}`;
  } finally {
    setModalBusy(false);
    updateModalActionState();
  }
});

  modalDeleteSelected.addEventListener('click', async () => {
    if (!modalCtx?.rss) {
      modalHint.textContent = 'Delete failed: Missing rss';
      return;
  }

  const checked = Array.from(epList.querySelectorAll('input.epChk:checked'));

  // Only delete ones that are downloaded
  const episodeUrls = checked
    .filter(b => b.dataset.downloaded === '1')
    .map(b => {
      const k = String(b.dataset.key || '').trim();
      if (k) return k; // preferred: "id:xxxxxxxxxxxx"
      const id = String(b.dataset.epid || '').trim();
      return /^[a-f0-9]{12}$/i.test(id) ? `id:${id.toLowerCase()}` : '';
    })
    .filter(Boolean);

  const uniq = Array.from(new Set(episodeUrls));
  if (!uniq.length) {
    modalHint.textContent = 'Select at least one downloaded episode to delete.';
    return;
  }

  const ok = confirm(`Delete ${uniq.length} episode(s)?`);
  if (!ok) return;

  try {
    setModalBusy(true, `Deleting ${uniq.length}…`);

    await apiPost('/podcasts/episodes/delete', {
      rss: modalCtx.rss,
      episodeUrls: uniq
    });

    await loadEpisodes();
    modalHint.textContent = '';
  } catch (e) {
    modalHint.textContent = `Delete failed: ${e.message || String(e)}`;
  } finally {
    setModalBusy(false);
    updateModalActionState();
  }
});

  // =========================
  // Subscription list UI
  // =========================
  function renderSubscriptions(items) {
    listEl.innerHTML = '';
    const n = (items || []).length;
    subCountEl.textContent = String(n);

    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = `<div class="empty">No subscriptions yet.</div>`;
      listEl.appendChild(empty);
      return;
    }

    for (const p of items) {
      const title = esc(p.title || '(untitled)');
      const rss   = esc(p.rss || '');

      const built = p.lastBuilt ? esc(p.lastBuilt) : '';
      const itemsCount = (typeof p.items === 'number') ? p.items : null;
      const downloadedCount = (typeof p.downloadedCount === 'number') ? p.downloadedCount : null;

      const imgUrlRaw = String(p.imageUrl || '').trim();
      const imgSrc = imgUrlRaw ? esc(imgUrlRaw) : placeholderSvgDataUri(p.title || 'Podcast');

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="cardHead">
          <img class="thumb" src="${imgSrc}" alt="" loading="lazy" decoding="async" />
          <div class="cardTitleWrap">
            <div class="cardTitle">${title}</div>
            <div class="cardSub">${rss}</div>
          </div>
          <button class="btn btnDanger" data-unsub="${rss}" title="Remove subscription" type="button">Unsubscribe</button>
        </div>

        <div class="cardBody">
          ${built ? `<div class="metaLine"><span class="metaKey">Built</span> <span>${built}</span></div>` : ``}
          ${itemsCount !== null ? `<div class="metaLine"><span class="metaKey">Items</span> <span>${itemsCount}</span></div>` : ``}
          ${downloadedCount !== null ? `<div class="metaLine"><span class="metaKey">Files</span> <span>${downloadedCount}</span></div>` : ``}
        </div>
      `;

      const img = card.querySelector('img.thumb');
      img.addEventListener('error', () => {
        img.src = placeholderSvgDataUri(p.title || 'Podcast');
      }, { once: true });

      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;

        openModal({
          title: p.title || '(untitled)',
          rss: p.rss || '',
          imageUrl: String(p.imageUrl || '').trim(),
          mapJson: p.mapJson || '',
          limit: Number(p.limit || 0) || null
        });

        loadEpisodes();
      });

      listEl.appendChild(card);
    }

    listEl.querySelectorAll('button[data-unsub]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const rss = btn.getAttribute('data-unsub');
        if (!rss) return;

        setBusy(true);
        logEl.textContent = '';

        try {
          setStatus('Unsubscribing…');
          log('→ POST /podcasts/unsubscribe');
          log('Payload:', { rss });

          const res = await apiPost('/podcasts/unsubscribe', { rss });

          log('✓ Unsubscribed');
          log('Response:', res);

          setStatus('Unsubscribed.', 'ok');
          await boot();
        } catch (err) {
          log('✗ Error:', { message: err.message });
          setStatus(`Error: ${err.message}`, 'err');
        } finally {
          setBusy(false);
        }
      });
    });
  }

  async function boot() {
    setBusy(true);
    try {
      setStatus('Refreshing subscription state…');
      logEl.textContent = '';

      log('→ GET /podcasts/refresh');
      const j = await apiGet('/podcasts/refresh');

      renderSubscriptions(j.items || []);
      log('✓ Loaded subscriptions', { count: (j.items || []).length });

      setStatus(`Loaded ${(j.items || []).length} subscription(s).`, 'muted');
    } catch (e) {
      setStatus(`Error: ${e.message}`, 'err');
      listEl.innerHTML = '';
      log('✗ Error:', { message: e.message });
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // Hero actions
  // =========================
  btnRefresh.addEventListener('click', boot);

  btnSub.addEventListener('click', async () => {
    const rss = rssEl.value.trim();
    if (!rss) return;

    const download = Number(dlEl.value) || 0;
    const limit    = Number(limitEl.value) || 50;

    logEl.textContent = '';
    setBusy(true);

    const payload = { rss, download, limit };

    try {
      setStatus(`Subscribing (download ${download}, feed scan ${limit})…`, 'muted');

      log('→ POST /podcasts/subscribe');
      log('Payload:', payload);

      const res = await apiPost('/podcasts/subscribe', payload);

      log('✓ Subscribe complete');
      log('Response:', res);

      // Your API now returns work.sync in the updated flow
      if (res.work?.sync) log('Sync:', res.work.sync);

      setStatus('Subscribed.', 'ok');
      rssEl.value = '';
      await boot();
    } catch (e) {
      log('✗ Error:', { message: e.message });
      setStatus(`Error: ${e.message}`, 'err');
    } finally {
      setBusy(false);
    }
  });

  boot();
