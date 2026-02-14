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
  const sendFilteredBtn = $('sendFilteredToMoode');
  const sendVibeBtn = $('sendVibeToMoode');
  const vibeSectionEl = $('vibeSection');
  const vibeDisabledNoteEl = $('vibeDisabledNote');

  const cropEl = $('crop');

  const savePlaylistBtn = $('savePlaylistBtn');
  const playlistNameEl = $('playlistName');
  const savePlaylistNowBtn = $('savePlaylistNowBtn');

  const cropVibeEl = $('cropVibe');

  const playlistHintEl = $('playlistHint');
  const sendConfirmEl = $('sendConfirm');
  const coverCardEl = $('coverCard');
  const coverImgEl = $('coverPreview');
  const coverStatusEl = $('coverStatus');
  // ---- Config ----
  const COLLAGE_PREVIEW_PATH = '/config/queue-wizard/collage-preview'; // change if your route differs
  const MAX_RENDER_ROWS = 1000;

  let moodeHost = '10.0.0.254';
  let previewTimer = null;
  let runtimeLoaded = false;

  let busy = false;        // general guard
  let sendBusy = false;    // prevent double saves/sends
  let collageBusy = false; // prevent repeated preview calls
  let savePlaylistEnabled = false;

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
let vibeJobId = '';
let vibeSince = 0;
let vibePollTimer = null;
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

function describeVibePick(track = {}) {
  const artist = String(track.artist || '').trim();
  const title = String(track.title || '').trim();
  const method = String(track.method || '').trim();
  const core = `${artist}${artist && title ? ' — ' : ''}${title}`.trim();
  return core ? `${core}${method ? ` (${method})` : ''}` : '';
}

function stopVibePolling() {
  if (vibePollTimer) clearTimeout(vibePollTimer);
  vibePollTimer = null;
}

async function syncVibeAvailability() {
  const apiBase = getApiBase();
  if (!apiBase) return;

  let enabled = false;
  try {
    const r = await fetch(`${apiBase}/config/runtime`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    enabled = !!j?.ok && !!j?.config?.lastfm?.configured;
  } catch {
    enabled = false;
  }

  if (vibeSectionEl) vibeSectionEl.classList.toggle('hidden', !enabled);
  if (vibeDisabledNoteEl) vibeDisabledNoteEl.classList.toggle('hidden', enabled);
  if (!enabled) {
    hideVibeProgress();
    setCancelButtonMode('none');
  }
}

  // ---- Helpers ----
  

  
  function moodeDefaultCoverUrl() {
    return `http://${moodeHost}/images/default-cover.jpg`;
  }

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

  function setPillState(pillId, state){
    const map = {
      ok: { c:'#22c55e', b:'rgba(34,197,94,.55)' },
      warn: { c:'#f59e0b', b:'rgba(245,158,11,.55)' },
      bad: { c:'#ef4444', b:'rgba(239,68,68,.55)' },
      off: { c:'#64748b', b:'rgba(100,116,139,.45)' },
    };
    const s = map[state] || map.off;
    const pill = $(pillId);
    if (!pill) return;
    const dot = pill.querySelector('.dot');
    if (dot) { dot.style.background = s.c; dot.style.boxShadow = `0 0 0 6px ${s.b.replace('.55','.20')}`; }
    pill.style.borderColor = s.b;
  }

  async function loadRuntimeMeta() {
    const apiBaseGuess = defaultApiBase();
    const rtUrl = `${apiBaseGuess}/config/runtime`;
    const activeApiBaseEl = $('activeApiBase');
    const activeApiPortEl = $('activeApiPort');
    const activeUiPortEl = $('activeUiPort');
    const activeTrackKeyEl = $('activeTrackKey');
    const apiHintEl = $('apiHint');
    const webHintEl = $('webHint');
    const alexaHintEl = $('alexaHint');

    try {
      const r = await fetch(rtUrl, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const cfg = j.config || {};
      const ports = cfg.ports || {};
      const apiPort = Number(ports.api || 3101);
      const uiPort = Number(ports.ui || 8101);
      const host = location.hostname;
      const proto = location.protocol || 'http:';
      const resolvedApi = `${proto}//${host}:${apiPort}`;
      const key = String(cfg.trackKey || '').trim();

      if ($('apiBase')) $('apiBase').value = resolvedApi;
      if ($('key')) $('key').value = key;

      if (activeApiBaseEl) activeApiBaseEl.textContent = resolvedApi;
      if (activeApiPortEl) activeApiPortEl.textContent = `api: ${apiPort}`;
      if (activeUiPortEl) activeUiPortEl.textContent = `ui: ${uiPort}`;
      if (activeTrackKeyEl) activeTrackKeyEl.textContent = key ? `••••${key.slice(-4)}` : '(missing)';
      if (apiHintEl) apiHintEl.textContent = `${host}:${apiPort}`;
      if (webHintEl) webHintEl.textContent = `${host}:${uiPort}`;
      const axEnabled = !!cfg?.alexa?.enabled;
      const axDomain = String(cfg?.alexa?.publicDomain || '').trim();
      if (alexaHintEl) alexaHintEl.textContent = !axEnabled ? 'disabled' : (axDomain || 'missing domain');
      setPillState('apiPill','ok');
      setPillState('webPill','ok');
      setPillState('alexaPill', !axEnabled ? 'off' : (axDomain ? 'ok' : 'warn'));

      runtimeLoaded = true;
    } catch (e) {
      if ($('apiBase') && !$('apiBase').value) $('apiBase').value = apiBaseGuess;
      if (activeApiBaseEl) activeApiBaseEl.textContent = $('apiBase')?.value || apiBaseGuess;
      if (activeTrackKeyEl) activeTrackKeyEl.textContent = 'unavailable';
      const host = location.hostname || '10.0.0.233';
      if (apiHintEl) apiHintEl.textContent = `${host}:3101`;
      if (webHintEl) webHintEl.textContent = `${host}:8101`;
      if (alexaHintEl) alexaHintEl.textContent = 'unknown';
      setPillState('apiPill','bad');
      setPillState('webPill','warn');
      setPillState('alexaPill','warn');
    }
  }

  function getMaxTracks() {
    const n = Number($('maxTracks')?.value || 25);
    return Number.isFinite(n) ? n : 25;
  }

  function getMinRating() {
    return Number($('minRating')?.value || 0);
  }

  function getMinRatingVibe() {
    return Number($('minRatingVibe')?.value || 0);
  }

  function getMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || 'replace';
  }

  function getModeVibe() {
    return document.querySelector('input[name="modeVibe"]:checked')?.value || 'replace';
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

  function getKeepNowPlayingVibe() {
    return getModeVibe() === 'replace' && !!cropVibeEl?.checked;
  }

  function syncCropUi() {
    const mode = getMode();
    if (!cropEl) return;
    cropEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropEl.checked = false;
  }

  function syncCropVibeUi() {
    const mode = getModeVibe();
    if (!cropVibeEl) return;
    cropVibeEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropVibeEl.checked = false;
  }

  function disableUI(disabled) {
    const disable = !!disabled;

    if (vibeBtn) vibeBtn.disabled = disable;
    if (sendFilteredBtn) sendFilteredBtn.disabled = disable;
    if (sendVibeBtn) sendVibeBtn.disabled = disable || currentListSource !== 'vibe' || currentFiles.length === 0;

    [
      'apiBase', 'key', 'maxTracks', 'minRating',
      'genres', 'artists', 'excludeGenres',
      'shuffle', 'crop', 'cropVibe', 'minRatingVibe',
      'playlistName',
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = disable;
    });

    document.querySelectorAll('input[name="mode"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modeVibe"]').forEach((el) => { el.disabled = disable; });
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
    if (sendVibeBtn) sendVibeBtn.disabled = !(currentListSource === 'vibe' && currentFiles.length > 0);

    lastCollageSig = '';
    renderFiltersSummary();
  }

  // ---- Cover preview display ----
  function refreshCoverPreview(note = '') {
    if (!coverCardEl || !coverImgEl || !coverStatusEl) return;

    const savePlaylist = savePlaylistEnabled;
    const wants = !!savePlaylist;
    const nameRaw = getPlaylistNameRaw();

    if (!wants || !nameRaw) {
      coverCardEl.style.display = '';
      coverStatusEl.textContent = 'Playlist cover preview';
      // Keep existing preview image instead of clearing it.
      return;
    }

    const p = playlistNameProblems(nameRaw);
    if (!p.ok) {
      coverCardEl.style.display = '';
      coverStatusEl.textContent = p.msg;
      coverImgEl.src = moodeDefaultCoverUrl();
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

    const savePlaylist = savePlaylistEnabled;
    const playlistName = savePlaylist ? getPlaylistNameRaw() : '';
    const wantsCollage = !!savePlaylist;

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
      if (sendVibeBtn) sendVibeBtn.disabled = true;
    } finally {
      busy = false;
    }
  }

// ---- VIBE build (list only; persistent) ----
async function doVibeBuild() {
  if (vibeSectionEl?.classList?.contains('hidden')) {
    setStatus('Vibe is disabled. Add a Last.fm API key in Config to enable it.');
    return;
  }

  if (busy) return;
  busy = true;

  const apiBase = getApiBase();
  const key = getKey();
  const targetQueue = getMaxTracks();
  const minRatingVibe = getMinRatingVibe();

  vibeCancelled = false;
  vibeAbortController = null;
  vibeJobId = '';
  vibeSince = 0;
  stopVibePolling();

  disableUI(true);
  showVibeProgress();
  // live feed removed; showing latest pick in progress detail
  setCancelButtonMode('cancel');
  setVibeProgress({ current: 0, total: Math.max(1, targetQueue), label: 'Starting vibe build…', detail: '' });

  try {
    if (!apiBase) throw new Error('API base is empty.');
    if (!key) throw new Error('Track key is empty.');

    const startResp = await fetch(`${apiBase}/config/queue-wizard/vibe-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify({ targetQueue, minRating: minRatingVibe }),
    });
    const startJson = await startResp.json().catch(() => ({}));
    if (!startResp.ok || !startJson?.ok || !startJson?.jobId) {
      throw new Error(startJson?.error || `HTTP ${startResp.status}`);
    }

    vibeJobId = String(startJson.jobId);

    const poll = async () => {
      const r = await fetch(`${apiBase}/config/queue-wizard/vibe-status/${encodeURIComponent(vibeJobId)}?since=${encodeURIComponent(vibeSince)}`, {
        headers: { 'x-track-key': key },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const built = Number(j.builtCount || 0);
      const total = Number(j.targetQueue || targetQueue || 1);
      const phase = String(j.phase || (j.done ? 'complete' : 'building'));

      setVibeProgress({
        current: Math.min(built, total),
        total: Math.max(1, total),
        label: j.done ? 'Vibe list ready.' : `Building vibe list… (${built}/${total})`,
        detail: phase,
      });

      const added = Array.isArray(j.added) ? j.added : [];
      if (added.length && vibeProgressDetail) {
        const latest = describeVibePick(added[added.length - 1]);
        vibeProgressDetail.textContent = latest ? `${phase} • Latest: ${latest}` : phase;
      }
      vibeSince = Number(j.nextSince || vibeSince);

      if (j.done) {
        const tracks = Array.isArray(j.tracks) ? j.tracks.slice() : [];
        setCurrentList('vibe', tracks);

        if (tracks.length === 0) {
          const seedArtist = String(j.seedArtist || '').trim();
          const seedTitle = String(j.seedTitle || '').trim();
          setStatus(`Vibe returned 0 tracks for now playing: ${seedArtist}${seedArtist && seedTitle ? ' — ' : ''}${seedTitle}. Try the next/previous track as seed.`);
          setVibeProgress({ current: 0, total: Math.max(1, Number(j.targetQueue || targetQueue || 1)), label: 'No vibe matches found.', detail: 'Try a different currently playing seed track.' });
          setCancelButtonMode('none');
        } else {
          setStatus(`Vibe list built: ${tracks.length.toLocaleString()} track(s).`);
          await maybeGenerateCollagePreview('vibe-build');
          setCancelButtonMode('send');
        }

        disableUI(false);
        busy = false;
        return;
      }

      if (j.error) throw new Error(j.error);

      vibePollTimer = setTimeout(() => { poll().catch(handleErr); }, 600);
    };

    const handleErr = (e) => {
      const msg = e?.message || String(e);
      setStatus(`Error: ${esc(msg)}`);
      setCount('Error building vibe list.');
      setVibeProgress({ current: 0, total: 1, label: 'Error.', detail: msg });
      setCancelButtonMode('none');
      hideVibeProgress();
      disableUI(false);
      busy = false;
      stopVibePolling();
    };

    await poll().catch(handleErr);

  } catch (e) {
    const msg = e?.message || String(e);
    setStatus(`Error: ${esc(msg)}`);
    setCount('Error building vibe list.');
    setVibeProgress({ current: 0, total: 1, label: 'Error.', detail: msg });
    setCancelButtonMode('none');
    hideVibeProgress();
    disableUI(false);
    busy = false;
  }
}
  // ---- Collage preview generation (server-side) ----
  function collageEnabledAndValid() {
    const savePlaylist = savePlaylistEnabled;
    const wants = !!savePlaylist;
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
      coverImgEl.src = moodeDefaultCoverUrl();
    } finally {
      collageBusy = false;
    }

    return;
  }

  // ---- NON-VIBE behavior (always preview from current tracks) ----
  if (!apiBase) { setStatus('Cover preview error: API base is empty.'); return; }
  if (!key) { setStatus('Cover preview error: track key is empty.'); return; }
  if (!currentFiles.length) {
    refreshCoverPreview('Playlist cover preview');
    return;
  }

  const playlistName = getPlaylistNameRaw();
  const sig = `${playlistName || '(preview)'}::${currentFiles.length}::${currentFiles.slice(0, 50).join('|')}`;
  if (sig && sig === lastCollageSig) return;

  if (collageBusy) return;
  collageBusy = true;

  try {
    showPlaylistHint('');
    setStatus('<span class="spin"></span>Generating collage preview…');

    const payload = {
      tracks: currentFiles.slice(),
      forceSingle: false,
    };
    if (savePlaylistEnabled && playlistName) payload.playlistName = playlistName;

    const r = await fetch(`${apiBase}${COLLAGE_PREVIEW_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      const detail = j?.message || j?.error || j?.reason || `HTTP ${r.status}`;
      throw new Error(detail);
    }

    lastCollageSig = sig;

    if (j?.dataBase64) {
      showInlineCoverPreview({
        mimeType: j.mimeType || 'image/jpeg',
        dataBase64: j.dataBase64,
        note: 'Collage preview ready.',
      });
    } else if (savePlaylistEnabled && playlistName) {
      await forceReloadCoverUntilItLoads({
        name: playlistName,
        note: `Collage preview generated for “${playlistName}”.`,
        tries: 10,
      });
    }

    setStatus('Collage preview ready.');
  } catch (e) {
    const msg = e?.message || String(e);
    setStatus(`Cover preview error: ${esc(msg)}`);
    refreshCoverPreview(`Cover preview error: ${msg}`);
  } finally {
    collageBusy = false;
  }
}

  function updatePlaylistUi() {
    const savePlaylist = savePlaylistEnabled;
    const opts = $('playlistOptions');

    if (opts) opts.classList.toggle('hidden', !savePlaylist);
    // collage is implicit when Save Playlist is enabled

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

  function showSendConfirmation(msg) {
    if (!sendConfirmEl) return;
    sendConfirmEl.textContent = msg || '';
    if (showSendConfirmation._t) clearTimeout(showSendConfirmation._t);
    showSendConfirmation._t = setTimeout(() => {
      if (sendConfirmEl.textContent === msg) sendConfirmEl.textContent = '';
    }, 5000);
  }

  function syncSavePlaylistButton() {
    if (!savePlaylistBtn) return;
    savePlaylistBtn.textContent = 'Save as moOde Playlist';
    savePlaylistBtn.style.opacity = savePlaylistEnabled ? '1' : '0.85';
    savePlaylistBtn.style.outline = savePlaylistEnabled ? '2px solid #7fd3a7' : '';
    savePlaylistBtn.setAttribute('aria-pressed', savePlaylistEnabled ? 'true' : 'false');
  }

  // ---- Send current list to moOde ----
  async function doSendToMoode(source = 'any') {
    if (sendBusy) return;
    sendBusy = true;

    if (source === 'filters') {
      await doPreview();
    }

    if (source === 'vibe' && currentListSource !== 'vibe') {
      setStatus('Build a vibe list first, then send it.');
      sendBusy = false;
      return;
    }

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

    const isVibeSend = source === 'vibe';
    const mode = isVibeSend ? getModeVibe() : getMode();
    const keepNowPlaying = isVibeSend ? getKeepNowPlayingVibe() : getKeepNowPlaying();
    const doShuffleFlag = isVibeSend ? false : getShuffle();

    const savePlaylist = savePlaylistEnabled;
    const playlistName = savePlaylist ? getPlaylistNameRaw() : '';
    const wantsCollage = !!savePlaylist;

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

      const statusMsg =
        `Added to moOde queue: ${j.added}/${j.requested}` +
        (mode === 'replace' ? ` · ${replaceModeMsg}` : ' · appended') +
        (j.randomTurnedOff ? ' · random off' : '') +
        (j.playStarted ? ' · playing' : '') +
        (j.playlistSaved ? ' · playlist saved' : '') +
        (j.collageGenerated ? ' · collage generated' : '') +
        (failedN ? ` · failed: ${failedN}` : '') +
        (j.playlistError ? ` · playlist error: ${esc(j.playlistError)}` : '') +
        (j.collageError ? ` · collage error: ${esc(j.collageError)}` : '');

      setStatus(statusMsg);
      showSendConfirmation(`✅ Sent ${j.added}/${j.requested} track(s) to moOde.`);

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

  sendFilteredBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doSendToMoode('filters');
  });

  sendVibeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doSendToMoode('vibe');
  });

  // Vibe cancel button becomes "Cancel" while building, then becomes "Send vibe list to moOde"
  vibeCancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();

    if (cancelMode === 'cancel') {
      // cancel the build
      vibeCancelled = true;
      vibeCancelBtn.disabled = true;
      const apiBase = getApiBase();
      const key = getKey();
      if (vibeJobId) {
        fetch(`${apiBase}/config/queue-wizard/vibe-cancel/${encodeURIComponent(vibeJobId)}`, {
          method: 'POST',
          headers: { 'x-track-key': key },
        }).catch(() => {});
      }
      stopVibePolling();
      setStatus('Vibe build cancelled.');
      setVibeProgress({ current: 0, total: 1, label: 'Cancelled.', detail: '' });
      setCancelButtonMode('none');
      hideVibeProgress();
      disableUI(false);
      busy = false;
      return;
    }

    if (cancelMode === 'send') {
      // reuse as a quick-send button after the list is ready
      doSendToMoode('vibe');
    }
  });

  // Mode/crop
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncCropUi();
      renderFiltersSummary();
    });
  });

  document.querySelectorAll('input[name="modeVibe"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncCropVibeUi();
    });
  });

  cropEl?.addEventListener('change', () => {
    renderFiltersSummary();
  });
  cropVibeEl?.addEventListener('change', () => {});

  // Playlist controls should NOT rebuild the list
  savePlaylistBtn?.addEventListener('click', () => {
    savePlaylistEnabled = !savePlaylistEnabled;
    syncSavePlaylistButton();
    updatePlaylistUi();
  });

  playlistNameEl?.addEventListener('input', () => {
    updatePlaylistUi();
    if (savePlaylistEnabled) maybeGenerateCollagePreview('playlist-name-input');
  });

  savePlaylistNowBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const src = currentListSource === 'vibe' ? 'vibe' : 'filters';
    doSendToMoode(src);
  });

  // shared playlist controls are global (below cover preview)

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
    el.addEventListener('change', () => {
      if (id === 'apiBase') syncVibeAvailability();
      maybePreview();
    });
    if (el.tagName === 'INPUT') {
      el.addEventListener('input', () => {
        if (id === 'apiBase') syncVibeAvailability();
        maybePreview();
      });
    }
  });
}

// ---- Init ----
try {
  if ($('apiBase') && !$('apiBase').value.trim()) $('apiBase').value = defaultApiBase();

  clearResults();
  setCount('No list yet.');
  setStatus('');
  showPlaylistHint('');

  if (coverCardEl) coverCardEl.style.display = '';
  if (coverImgEl && !coverImgEl.src) {
    coverImgEl.src = moodeDefaultCoverUrl();
    coverImgEl.onerror = () => {
      coverImgEl.onerror = null;
      coverImgEl.src = `http://${moodeHost}/images/default-album-cover.png`;
    };
  }

  syncCropUi();
  syncCropVibeUi();
  syncSavePlaylistButton();
  updatePlaylistUi();
  if (sendConfirmEl) sendConfirmEl.textContent = '';
  renderFiltersSummary();

  // Ensure the button starts hidden/disabled until a vibe build begins
  setCancelButtonMode('none');

  wireEvents();
  loadRuntimeMeta().finally(() => {
    loadOptions();
    syncVibeAvailability();
  });
} catch (e) {
  setStatus(`JS init error: ${esc(e?.message || e)}`);
  console.error(e);
}
})();