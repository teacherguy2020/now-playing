/* scripts/queue-wizard.js */

(() => {
  const $ = (id) => document.getElementById(id);

  console.log('queue-wizard.js loaded');

  // ---- Elements (match your HTML IDs) ----
  const statusEl = $('status');
  const resultsEl = $('results');
  const countEl = $('count');
  const summaryEl = $('filtersSummary');

  const vibeBtn = $('vibeBuild');
  const sendBtn = $('sendToMoode');

  const cropEl = $('crop');

  const savePlaylistEl = $('savePlaylist');
  const playlistNameEl = $('playlistName');
  const generateCollageEl = $('generateCollage');
  const playlistHintEl = $('playlistHint');

  const coverCardEl = $('coverCard');
  const coverImgEl = $('coverPreview');
  const coverStatusEl = $('coverStatus');
  // ---- Config ----
  const COLLAGE_PREVIEW_PATH = '/config/queue-wizard/collage-preview'; // change if your route differs
  const MAX_RENDER_ROWS = 1000;

  let moodeHost = '10.0.0.254';
  let previewTimer = null;

  let busy = false;        // general guard
  let sendBusy = false;    // prevent double saves/sends
  let collageBusy = false; // prevent repeated preview calls

  // Persist the current list (vibe OR filters)
  let currentListSource = 'none'; // 'none' | 'filters' | 'vibe'
  let currentTracks = [];         // array of {artist,title,album,genre,file,...}
  let currentFiles = [];          // array of file paths

  // Prevent repeated collage preview for the same inputs
  let lastCollageSig = '';

// ---------- Vibe progress + Cancel/Send button (single-source-of-truth) ----------

const vibeProgressWrap   = $('vibeProgressWrap');
const vibeProgressBar    = $('vibeProgressBar');
const vibeProgressText   = $('vibeProgressText');
const vibeProgressDetail = $('vibeProgressDetail');
const vibeCancelBtn      = $('vibeCancel');

let vibeCancelled = false;
let vibeAbortController = null;
let cancelMode = 'none'; // 'none' | 'cancel' | 'send'

function showVibeProgress() {
  if (!vibeProgressWrap) return;
  vibeProgressWrap.classList.remove('hidden');
  vibeCancelled = false;
  setCancelButtonMode('cancel'); // default when showing
}

function hideVibeProgress() {
  if (!vibeProgressWrap) return;
  vibeProgressWrap.classList.add('hidden');
  setCancelButtonMode('none');
}

function setVibeProgress({ current = 0, total = 0, label = '', detail = '' } = {}) {
  if (vibeProgressText) vibeProgressText.textContent = label || '';
  if (vibeProgressDetail) vibeProgressDetail.textContent = detail || '';

  if (vibeProgressBar) {
    const max = Math.max(1, Number(total) || 1);
    const val = Math.min(Math.max(0, Number(current) || 0), max);
    vibeProgressBar.max = max;
    vibeProgressBar.value = val;
  }
}

function setCancelButtonMode(mode) {
  cancelMode = mode;

  if (!vibeCancelBtn) return;

  if (mode === 'none') {
    vibeCancelBtn.classList.add('hidden');
    vibeCancelBtn.disabled = true;
    vibeCancelBtn.textContent = 'Cancel';
    vibeCancelBtn.title = '';
    return;
  }

  vibeCancelBtn.classList.remove('hidden');
  vibeCancelBtn.disabled = false;

  if (mode === 'cancel') {
    vibeCancelBtn.textContent = 'Cancel';
    vibeCancelBtn.title = 'Cancel building the vibe list';
  } else {
    vibeCancelBtn.textContent = 'Send vibe list to moOde';
    vibeCancelBtn.title = 'Send the currently built vibe list to moOde';
  }
}

// Optional: “fake” progress while the fetch is in-flight.
// 1 tick per second, holds at 90% until real completion.
let vibeFakeTimer = null;

function startFakeVibeProgress({ seconds = 12, label = 'Building vibe list…' } = {}) {
  stopFakeVibeProgress();

  const total = Math.max(3, Number(seconds) || 12) * 2;
  let i = 0;

  showVibeProgress();
  setVibeProgress({ current: 0, total, label, detail: 'Working…' });

  vibeFakeTimer = setInterval(() => {
    i += 1;
    if (i >= total) {
      setVibeProgress({ current: total - 1, total, label, detail: 'Still working…' });
      return;
    }
    setVibeProgress({ current: i, total, label, detail: `Working… (${i}s)` });
  }, 1000);
}

function stopFakeVibeProgress() {
  if (vibeFakeTimer) clearInterval(vibeFakeTimer);
  vibeFakeTimer = null;
}

  // ---- Helpers ----
  

  
  function showInlineCoverPreview({ mimeType, dataBase64, note = '' }) {
    if (!coverCardEl || !coverImgEl || !coverStatusEl) return;

    coverCardEl.style.display = '';
    coverStatusEl.textContent = note || 'Preview ready.';
    coverImgEl.src = `data:${mimeType || 'image/jpeg'};base64,${dataBase64 || ''}`;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  function setStatus(html) {
    if (!statusEl) return;
    statusEl.innerHTML = String(html ?? '');
  }

  function setCount(text) {
    if (!countEl) return;
    countEl.textContent = String(text ?? '');
  }

  function showPlaylistHint(msg) {
    if (!playlistHintEl) return;
    playlistHintEl.textContent = msg || '';
  }

  function selectedValues(sel) {
    return Array.from(sel?.selectedOptions || []).map((o) => o.value);
  }

  function defaultApiBase() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.protocol}//${location.hostname}:3101`;
    }
    return 'http://10.0.0.233:3101';
  }

  function getApiBase() {
    return ($('apiBase')?.value || '').trim().replace(/\/$/, '');
  }

  function getKey() {
    return ($('key')?.value || '').trim();
  }

  function getMaxTracks() {
    const n = Number($('maxTracks')?.value || 25);
    return Number.isFinite(n) ? n : 25;
  }

  function getMinRating() {
    return Number($('minRating')?.value || 0);
  }

  function getMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || 'replace';
  }

  function getShuffle() {
    return !!$('shuffle')?.checked;
  }

  // Your definition:
  // - clear: delete entire queue
  // - crop: keep currently playing track, delete all else
  // Only meaningful when mode=replace
  function getKeepNowPlaying() {
    return getMode() === 'replace' && !!cropEl?.checked;
  }

  function syncCropUi() {
    const mode = getMode();
    if (!cropEl) return;
    cropEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropEl.checked = false;
  }

  function disableUI(disabled) {
    const disable = !!disabled;

    if (vibeBtn) vibeBtn.disabled = disable;
    if (sendBtn) sendBtn.disabled = disable || currentFiles.length === 0;

    [
      'apiBase', 'key', 'maxTracks', 'minRating',
      'genres', 'artists', 'excludeGenres',
      'shuffle', 'crop',
      'savePlaylist', 'playlistName', 'generateCollage',
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = disable;
    });

    document.querySelectorAll('input[name="mode"]').forEach((el) => { el.disabled = disable; });
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---- Playlist name validation (warn on / and friends) ----
  function getPlaylistNameRaw() {
    return (playlistNameEl?.value || '').trim();
  }

  function playlistNameProblems(nameRaw) {
    const name = String(nameRaw || '').trim();
    if (!name) return { ok: false, msg: 'Playlist name is required.' };

    // Must warn/block on slash because it breaks paths/remote scripts
    if (/[\/\\]/.test(name)) return { ok: false, msg: 'Playlist name cannot contain / or \\.' };

    // Other characters that commonly cause trouble with shells/filesystems
    if (/[\0<>:"|?*]/.test(name)) return { ok: false, msg: 'Playlist name contains invalid characters (<>:"|?*).' };

    if (name.length > 80) return { ok: false, msg: 'Playlist name is too long (max ~80 characters).' };

    return { ok: true, msg: '' };
  }

  // ---- Results table ----
  function clearResults() {
    if (resultsEl) resultsEl.innerHTML = '';
  }

  function ensureResultsTable() {
    if (!resultsEl) return null;
    resultsEl.innerHTML =
      `<table>
        <thead>
          <tr><th>Artist</th><th>Title</th><th>Album</th><th>Genre</th></tr>
        </thead>
        <tbody id="resultsBody"></tbody>
      </table>`;
    return $('resultsBody');
  }

  function appendRow(t, tbody) {
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${esc(t.artist || '')}</td>` +
      `<td>${esc(t.title || '')}</td>` +
      `<td>${esc(t.album || '')}</td>` +
      `<td>${esc(t.genre || '')}</td>`;
    tbody.appendChild(tr);
  }

  function renderTracksToTable(tracks) {
    clearResults();
    const tbody = ensureResultsTable();
    for (const t of (tracks || []).slice(0, MAX_RENDER_ROWS)) appendRow(t, tbody);
  }

  function setCurrentList(source, tracks) {
    currentListSource = source || 'none';
    currentTracks = Array.isArray(tracks) ? tracks.slice() : [];
    currentFiles = currentTracks.map((t) => String(t.file || '').trim()).filter(Boolean);

    renderTracksToTable(currentTracks);

    const label = currentListSource === 'vibe'
      ? 'Vibe list'
      : (currentListSource === 'filters' ? 'Filter list' : 'List');

    setCount(`${label} ready: ${currentTracks.length.toLocaleString()} track(s).`);
    if (sendBtn) sendBtn.disabled = currentFiles.length === 0;

    lastCollageSig = '';
    renderFiltersSummary();
  }

  // ---- Cover preview display ----
  function refreshCoverPreview(note = '') {
    if (!coverCardEl || !coverImgEl || !coverStatusEl) return;

    const savePlaylist = !!savePlaylistEl?.checked;
    const wants = !!generateCollageEl?.checked && savePlaylist;
    const nameRaw = getPlaylistNameRaw();

    if (!wants || !nameRaw) {
      coverCardEl.style.display = 'none';
      return;
    }

    const p = playlistNameProblems(nameRaw);
    if (!p.ok) {
      coverCardEl.style.display = '';
      coverStatusEl.textContent = p.msg;
      coverImgEl.src = '';
      return;
    }

    coverCardEl.style.display = '';
    coverStatusEl.textContent = note || `Cover preview for “${nameRaw}”.`;
  }

async function forceReloadCoverUntilItLoads({ name, note = '', tries = 10 }) {
  if (!coverCardEl || !coverImgEl || !coverStatusEl) return false;

  const baseUrl = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(name)}.jpg`;
  coverCardEl.style.display = '';
  coverStatusEl.textContent = note || `Loading cover for “${name}”…`;

  const delays = [150, 250, 400, 650, 900, 1200, 1500, 1700, 2000, 2200];

  for (let i = 0; i < tries; i++) {
    const url = `${baseUrl}?t=${Date.now()}&try=${i + 1}`;

    const loaded = await new Promise((resolve) => {
      // Use a *fresh* Image each try (Safari behaves much better)
      const img = new Image();

      const done = (ok) => {
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };

      img.onload = () => done(true);
      img.onerror = () => done(false);

      img.src = url;
    });

    if (loaded) {
      // Only now swap into the real DOM <img>
      coverImgEl.src = url;
      coverStatusEl.textContent = note || `Cover loaded for “${name}”.`;
      return true;
    }

    coverStatusEl.textContent = `Cover not visible yet… retry ${i + 1}/${tries}`;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, delays[Math.min(i, delays.length - 1)]));
  }

  coverStatusEl.textContent = `Cover still not showing for “${name}”.`;
  return false;
}

  // ---- Summary ----
  function renderFiltersSummary() {
    if (!summaryEl) return;

    const genres = selectedValues($('genres'));
    const artists = selectedValues($('artists'));
    const excludes = selectedValues($('excludeGenres'));
    const stars = getMinRating();
    const maxTracks = getMaxTracks();

    const mode = getMode();
    const keep = getKeepNowPlaying();
    const doShuffle = getShuffle();

    const savePlaylist = !!savePlaylistEl?.checked;
    const playlistName = getPlaylistNameRaw();
    const wantsCollage = !!generateCollageEl?.checked && savePlaylist;

    const starsTxt = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'Any';
    const fmt = (arr) => arr.length ? arr.map(esc).join(', ') : 'Any';

    const src = currentListSource === 'vibe' ? 'vibe'
      : (currentListSource === 'filters' ? 'filters' : 'none');

    summaryEl.innerHTML =
      `List source: <b>${esc(src)}</b> · ` +
      `Genres: ${fmt(genres)} · Artists: ${fmt(artists)} · Excluding: ${fmt(excludes)} · ` +
      `Min rating: ${esc(starsTxt)} · Max: ${Number(maxTracks).toLocaleString()} · ` +
      `Mode: ${esc(mode)}${mode === 'replace' ? (keep ? ' (crop)' : ' (clear)') : ''} · ` +
      `Shuffle: ${doShuffle ? 'Yes' : 'No'} · ` +
      `Save playlist: ${savePlaylist ? `Yes (${esc(playlistName || 'unnamed')})` : 'No'}` +
      (wantsCollage ? ' · Cover: collage' : '');
  }

  // ---- Load options ----
  function setOptions(el, arr) {
    if (!el) return;
    el.innerHTML = (arr || []).map((v) => `<option>${esc(v)}</option>`).join('');
  }

  async function loadOptions() {
    const apiBase = getApiBase();
    const key = getKey();

    if (!apiBase) {
      setStatus('API base is empty.');
      return;
    }

    setStatus('<span class="spin"></span>Loading options…');
    try {
      const r = await fetch(`${apiBase}/config/queue-wizard/options`, {
        headers: { 'x-track-key': key },
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      setOptions($('genres'), j.genres || []);
      setOptions($('excludeGenres'), j.genres || []);
      setOptions($('artists'), j.artists || []);

      // Default exclude "Christmas"
      const ex = $('excludeGenres');
      if (ex) {
        Array.from(ex.options).forEach((opt) => {
          opt.selected = /^christmas$/i.test(String(opt.value || '').trim());
        });
      }

      moodeHost = String(j.moodeHost || moodeHost || '10.0.0.254');

      setStatus('');
      renderFiltersSummary();
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    }
  }

  // ---- Preview (filters) ----
  function schedulePreview(delayMs = 250) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { doPreview(); }, delayMs);
  }

  async function doPreview() {
    if (busy) return;
    busy = true;

    const apiBase = getApiBase();
    const key = getKey();

    renderFiltersSummary();
    setStatus('<span class="spin"></span>Building list…');
    setCount('Building list…');

    try {
      const body = {
        genres: selectedValues($('genres')),
        artists: selectedValues($('artists')),
        excludeGenres: selectedValues($('excludeGenres')),
        minRating: getMinRating(),
        maxTracks: getMaxTracks(),
      };

      const r = await fetch(`${apiBase}/config/queue-wizard/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const tracks = Array.isArray(j.tracks) ? j.tracks.slice() : [];
      if (getShuffle()) shuffleInPlace(tracks);

      setCurrentList('filters', tracks);
      setStatus('List built. Ready to send.');

      await maybeGenerateCollagePreview('filters-preview');
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
      if (sendBtn) sendBtn.disabled = true;
    } finally {
      busy = false;
    }
  }

// ---- VIBE build (list only; persistent) ----
async function doVibeBuild() {
  if (busy) return;
  busy = true;

  const apiBase = getApiBase();
  const key = getKey();
  const targetQueue = getMaxTracks();

  vibeCancelled = false;
  vibeAbortController = null;

  disableUI(true);

  // SHOW progress + make button act like Cancel while building
  showVibeProgress();
  setCancelButtonMode('cancel');
  startFakeVibeProgress({ seconds: 12, label: 'Building vibe list…' });

  try {
    // ... your existing setup code ...

    const controller = new AbortController();
    vibeAbortController = controller;

    const timeoutId = setTimeout(() => controller.abort(), 180000);

    let r;
    try {
      r = await fetch(
        `${apiBase}/config/queue-wizard/vibe-nowplaying?targetQueue=${encodeURIComponent(targetQueue)}`,
        { signal: controller.signal, headers: { 'x-track-key': key } }
      );
    } finally {
      clearTimeout(timeoutId);
      stopFakeVibeProgress();
    }

    if (vibeCancelled) {
      setStatus('Vibe build cancelled.');
      setCount('Cancelled.');
      setVibeProgress({ current: 0, total: 1, label: 'Cancelled.', detail: '' });
      setCancelButtonMode('none');     // hide it on cancel
      hideVibeProgress();              // optional
      return;
    }

    // ... parse JSON, build list, etc ...

    // When list is READY, repurpose Cancel -> Send
    setVibeProgress({ current: 1, total: 1, label: 'Vibe list ready.', detail: '' });
    setCancelButtonMode('send');

    // If you also want to keep the progress visible after ready, do nothing.
    // If you want it to hide, call hideVibeProgress() here.

  } catch (e) {
    const msg = e?.message || String(e);

    if (String(msg).toLowerCase().includes('abort') || vibeCancelled) {
      setStatus('Vibe build cancelled.');
      setCount('Cancelled.');
      setVibeProgress({ current: 0, total: 1, label: 'Cancelled.', detail: '' });
      setCancelButtonMode('none');
      hideVibeProgress(); // optional
      return;
    }

    setStatus(`Error: ${esc(msg)}`);
    setCount('Error building vibe list.');
    setVibeProgress({ current: 0, total: 1, label: 'Error.', detail: msg });
    setCancelButtonMode('none');       // hide on error (or leave 'send' if you want)
    hideVibeProgress();                // optional
  } finally {
    disableUI(false);
    busy = false;
    vibeAbortController = null;
  }
}
  // ---- Collage preview generation (server-side) ----
  function collageEnabledAndValid() {
    const savePlaylist = !!savePlaylistEl?.checked;
    const wants = !!generateCollageEl?.checked && savePlaylist;
    if (!wants) return { ok: false, msg: '' };

    const nameRaw = getPlaylistNameRaw();
    const p = playlistNameProblems(nameRaw);
    if (!p.ok) return { ok: false, msg: p.msg };

    if (!currentFiles.length) return { ok: false, msg: 'Build a list first to preview a collage.' };

    return { ok: true, msg: '' };
  }

  function computeCollageSig() {
    const name = getPlaylistNameRaw();
    const head = currentFiles.slice(0, 50).join('|');
    return `${name}::${currentFiles.length}::${head}`;
  }

async function maybeGenerateCollagePreview(reason = '') {
  if (!coverCardEl || !coverImgEl || !coverStatusEl) return;

  const apiBase = getApiBase();
  const key = getKey();

  // VIBE PREVIEW: always allowed, does NOT require Save Playlist
  const isVibe = (reason === 'vibe-build') || (currentListSource === 'vibe');

  if (isVibe) {
    if (!apiBase) { setStatus('Cover preview error: API base is empty.'); return; }
    if (!key) { setStatus('Cover preview error: track key is empty.'); return; }
    if (!currentFiles.length) { setStatus('Cover preview error: no tracks to preview.'); return; }

    // Prevent repeated calls for identical list
    const sig = `vibe::${currentFiles.length}::${currentFiles.slice(0, 50).join('|')}`;
    if (sig === lastCollageSig) return;
    lastCollageSig = sig;

    if (collageBusy) return;
    collageBusy = true;

    try {
      coverCardEl.style.display = '';
      coverStatusEl.textContent = 'Generating vibe collage preview…';

      const r = await fetch(`${apiBase}${COLLAGE_PREVIEW_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({
          // playlistName omitted on purpose for vibe preview
          tracks: currentFiles.slice(),
          forceSingle: false,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);

      // Show immediately (no moOde URL / no caching issues)
      showInlineCoverPreview({
        mimeType: j.mimeType || 'image/jpeg',
        dataBase64: j.dataBase64 || '',
        note: 'Vibe collage preview ready.',
      });

      setStatus('Vibe list built. (Preview generated.)');
    } catch (e) {
      const msg = e?.message || String(e);
      setStatus(`Cover preview error: ${esc(msg)}`);
      coverStatusEl.textContent = `Cover preview error: ${msg}`;
      coverImgEl.src = '';
    } finally {
      collageBusy = false;
    }

    return;
  }

  // ---- NON-VIBE behavior (saved playlist collage) ----
  const gate = collageEnabledAndValid(); // this requires Save Playlist + valid name
  if (!gate.ok) {
    if (gate.msg) showPlaylistHint(gate.msg);
    // keep your old behavior (hide or message)
    refreshCoverPreview(gate.msg ? gate.msg : '');
    return;
  }

  const sig = computeCollageSig();
  if (sig && sig === lastCollageSig) {
    refreshCoverPreview(`Collage preview ready for “${getPlaylistNameRaw()}”.`);
    return;
  }

  if (collageBusy) return;
  collageBusy = true;

  const playlistName = getPlaylistNameRaw();

  try {
    showPlaylistHint('');
    setStatus(`<span class="spin"></span>Generating collage preview for “${esc(playlistName)}”…`);

    const r = await fetch(`${apiBase}${COLLAGE_PREVIEW_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify({
        playlistName,
        tracks: currentFiles.slice(),
        forceSingle: false,
      }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    lastCollageSig = sig;

    // Saved playlist case: keep your robust moOde URL polling
    await forceReloadCoverUntilItLoads({
      name: playlistName,
      note: `Collage preview generated for “${playlistName}”.`,
      tries: 10,
    });

    setStatus(`Collage preview generated for “${esc(playlistName)}”.`);
  } catch (e) {
    const msg = e?.message || String(e);
    setStatus(`Cover preview error: ${esc(msg)}`);
    refreshCoverPreview(`Cover preview error: ${msg}`);
  } finally {
    collageBusy = false;
  }
}

  function updatePlaylistUi() {
    const savePlaylist = !!savePlaylistEl?.checked;
    const opts = $('playlistOptions');

    if (opts) opts.classList.toggle('hidden', !savePlaylist);
    if (!savePlaylist && generateCollageEl) generateCollageEl.checked = false;

    if (savePlaylist) {
      const p = playlistNameProblems(getPlaylistNameRaw());
      showPlaylistHint(p.ok ? '' : p.msg);
    } else {
      showPlaylistHint('');
    }

    renderFiltersSummary();
    refreshCoverPreview('');

    // If collage toggled on, try generating right away
    maybeGenerateCollagePreview('updatePlaylistUi');
  }

  // ---- Send current list to moOde ----
  async function doSendToMoode() {
    if (sendBusy) return;
    sendBusy = true;

    if (!currentFiles.length) {
      await doPreview();
      if (!currentFiles.length) {
        setStatus('No tracks to send.');
        sendBusy = false;
        return;
      }
    }

    const apiBase = getApiBase();
    const key = getKey();

    const mode = getMode();
    const keepNowPlaying = getKeepNowPlaying();
    const doShuffleFlag = getShuffle();

    const savePlaylist = !!savePlaylistEl?.checked;
    const playlistName = savePlaylist ? getPlaylistNameRaw() : '';
    const wantsCollage = !!generateCollageEl?.checked && savePlaylist;

    if (savePlaylist) {
      const p = playlistNameProblems(playlistName);
      if (!p.ok) {
        setStatus(p.msg);
        showPlaylistHint(p.msg);
        sendBusy = false;
        return;
      }
    }

    if (mode === 'replace' && !keepNowPlaying) {
      const ok = confirm('Replace queue by CLEARING everything and loading this list?');
      if (!ok) { sendBusy = false; return; }
    }

    disableUI(true);
    try {
      setStatus('<span class="spin"></span>Sending list to moOde…');

      const r = await fetch(`${apiBase}/config/queue-wizard/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({
          mode,
          keepNowPlaying,
          tracks: currentFiles.slice(),
          shuffle: doShuffleFlag,
          playlistName,
          generateCollage: wantsCollage,
        }),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const replaceModeMsg = keepNowPlaying
        ? 'crop (keep current track, delete all else)'
        : 'clear (delete entire queue)';

      const failedN = Array.isArray(j.failedFiles) ? j.failedFiles.length : 0;

      setStatus(
        `Added to moOde queue: ${j.added}/${j.requested}` +
        (mode === 'replace' ? ` · ${replaceModeMsg}` : ' · appended') +
        (j.randomTurnedOff ? ' · random off' : '') +
        (j.playStarted ? ' · playing' : '') +
        (j.playlistSaved ? ' · playlist saved' : '') +
        (j.collageGenerated ? ' · collage generated' : '') +
        (failedN ? ` · failed: ${failedN}` : '') +
        (j.playlistError ? ` · playlist error: ${esc(j.playlistError)}` : '') +
        (j.collageError ? ` · collage error: ${esc(j.collageError)}` : '')
      );

      if (j.collageGenerated && playlistName) {
        await forceReloadCoverUntilItLoads({
          name: playlistName,
          note: `Collage generated for “${playlistName}”.`,
          tries: 10,
        });
      }
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    } finally {
      disableUI(false);
      sendBusy = false;
    }
  }

  // ---- Event wiring ----
function wireEvents() {
  // Primary actions
  vibeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doVibeBuild();
  });

  sendBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doSendToMoode();
  });

  // Vibe cancel button becomes "Cancel" while building, then becomes "Send vibe list to moOde"
  vibeCancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();

    if (cancelMode === 'cancel') {
      // cancel the build
      vibeCancelled = true;
      vibeAbortController?.abort?.(); // safe if you added AbortController; no-op otherwise
      vibeCancelBtn.disabled = true;
      return;
    }

    if (cancelMode === 'send') {
      // reuse as a quick-send button after the list is ready
      doSendToMoode();
    }
  });

  // Mode/crop
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncCropUi();
      renderFiltersSummary();
    });
  });

  cropEl?.addEventListener('change', () => {
    renderFiltersSummary();
  });

  // Playlist controls should NOT rebuild the list
  savePlaylistEl?.addEventListener('change', () => updatePlaylistUi());

  playlistNameEl?.addEventListener('input', () => {
    updatePlaylistUi();
    if (generateCollageEl?.checked) maybeGenerateCollagePreview('playlist-name-input');
  });

  generateCollageEl?.addEventListener('change', () => {
    updatePlaylistUi();
    if (generateCollageEl?.checked) maybeGenerateCollagePreview('collage-toggle');
  });

  // Filters auto-preview ONLY if we are not currently showing a vibe list
  const maybePreview = () => {
    syncCropUi();
    renderFiltersSummary();
    if (currentListSource === 'vibe') return;
    schedulePreview(300);
  };

  ['genres', 'artists', 'excludeGenres', 'minRating', 'maxTracks', 'shuffle', 'apiBase', 'key'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', maybePreview);
    if (el.tagName === 'INPUT') el.addEventListener('input', maybePreview);
  });
}

// ---- Init ----
try {
  if ($('apiBase') && !$('apiBase').value.trim()) $('apiBase').value = defaultApiBase();

  clearResults();
  setCount('No list yet.');
  setStatus('');
  showPlaylistHint('');

  if (coverCardEl) coverCardEl.style.display = 'none';

  syncCropUi();
  updatePlaylistUi();
  renderFiltersSummary();

  // Ensure the button starts hidden/disabled until a vibe build begins
  setCancelButtonMode('none');

  wireEvents();
  loadOptions();
} catch (e) {
  setStatus(`JS init error: ${esc(e?.message || e)}`);
  console.error(e);
}
})();