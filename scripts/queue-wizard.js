/* scripts/queue-wizard.js */

(() => {
  const $ = (id) => document.getElementById(id);

  // debug log removed for production

  // ---- Elements (match your HTML IDs) ----
  const statusEl = $('status');
  const resultsEl = $('results');
  const countEl = $('count');
  const summaryEl = $('filtersSummary');

  const vibeBtn = $('vibeBuild');
  const sendFilteredBtn = $('sendFilteredToMoode');
  const themeToggleEl = $('themeToggle');
  const sendVibeBtn = $('sendVibeToMoode');
  const existingSectionEl = $('existingSection');
  const filterSectionEl = $('filterSection');
  const vibeSectionEl = $('vibeSection');
  const vibeDisabledNoteEl = $('vibeDisabledNote');

  const podcastSectionEl = $('podcastSection');
  const podcastShowsEl = $('podcastShows');
  const podcastBuildBtn = $('podcastBuild');
  const sendPodcastBtn = $('sendPodcastToMoode');
  const podcastPreset24hBtn = $('podcastPreset24h');
  const podcastPreset48hBtn = $('podcastPreset48h');
  const podcastPreset7dBtn = $('podcastPreset7d');

  const cropEl = $('crop');
  const cropExistingEl = $('cropExisting');
  const shuffleExistingEl = $('shuffleExisting');

  const savePlaylistBtn = $('savePlaylistBtn');
  const playlistNameEl = $('playlistName');
  const existingPlaylistsEl = $('existingPlaylists');
  const existingPlaylistThumbEl = $('existingPlaylistThumb');
  const existingPlaylistPickerEl = $('existingPlaylistPicker');
  const existingPlaylistToggleEl = $('existingPlaylistToggle');
  const existingPlaylistLabelEl = $('existingPlaylistLabel');
  const existingPlaylistMenuEl = $('existingPlaylistMenu');
  const loadExistingPlaylistBtn = $('loadExistingPlaylistBtn');
  const sendExistingBtn = $('sendExistingToMoode');
  const savePlaylistNowBtn = $('savePlaylistNowBtn');

  const cropVibeEl = $('cropVibe');
  const cropPodcastEl = $('cropPodcast');

  const playlistHintEl = $('playlistHint');
  const playlistSuggestionEl = $('playlistSuggestion');
  const sendConfirmEl = $('sendConfirm');
  const coverCardEl = $('coverCard');
  const coverImgEl = $('coverPreview');
  const coverStatusEl = $('coverStatus');
  const playlistThumbStripEl = $('playlistThumbStrip');

  // Keep hidden initially; show when preview/cover is generated.
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
  let ratingsEnabled = true;
  let podcastsEnabled = true;
  let vibeEnabled = true;
  let activeBuilder = '';
  let podcastShowByRss = new Map();

  // Persist the current list (vibe OR filters)
  let currentListSource = 'none'; // 'none' | 'filters' | 'vibe' | 'podcast' | 'queue'
  let currentTracks = [];         // array of {artist,title,album,genre,file,...}
  let currentFiles = [];          // array of file paths

  // Prevent repeated collage preview for the same inputs
  let lastCollageSig = '';
  let dragTrackIdx = -1;
  let dragOverTrackIdx = -1;
  let dragInsertAfter = false;
  let podcastBuildTimer = null;
  let listOrderShuffled = false;

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

function applyBuilderVisibility() {
  const showFilter = !activeBuilder || activeBuilder === 'filters';
  const showVibe = (!activeBuilder || activeBuilder === 'vibe') && vibeEnabled;
  const showPodcast = (!activeBuilder || activeBuilder === 'podcast') && podcastsEnabled;
  if (filterSectionEl) filterSectionEl.classList.toggle('hidden', !showFilter);
  if (vibeSectionEl) vibeSectionEl.classList.toggle('hidden', !showVibe);
  if (podcastSectionEl) podcastSectionEl.classList.toggle('hidden', !showPodcast);
  const showVibeDisabledNote = !vibeEnabled && !activeBuilder;
  if (vibeDisabledNoteEl) vibeDisabledNoteEl.classList.toggle('hidden', !showVibeDisabledNote);
}

function activateBuilder(name) {
  const v = String(name || '').trim();
  if (!v || activeBuilder === v) return;
  activeBuilder = v;
  applyBuilderVisibility();
}

function syncPodcastSectionVisibility() {
  applyBuilderVisibility();
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

  vibeEnabled = enabled;
  applyBuilderVisibility();
  if (!enabled) {
    hideVibeProgress();
    setCancelButtonMode('none');
  }
}

  // ---- Helpers ----
  

  
  function moodeDefaultCoverUrl() {
    return `http://${moodeHost}/images/default-cover.jpg`;
  }

  function applyTheme(theme = 'dark') {
    const t = String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', t === 'light');
    document.documentElement.classList.toggle('theme-light', t === 'light');
    if (t === 'light') {
      document.documentElement.style.background = 'linear-gradient(180deg, #dbeafe 0%, #93c5fd 100%)';
    } else {
      document.documentElement.style.background = '#0c1526';
    }
    if (themeToggleEl) themeToggleEl.textContent = t === 'light' ? '☀️' : '🌙';
    try { localStorage.setItem('np-theme', t); } catch {}
  }

  function initTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('np-theme') || 'dark'; } catch {}
    applyTheme(saved);
  }

  function updateExistingPlaylistThumb(name = '') {
    if (!existingPlaylistThumbEl) return;
    const n = String(name || '').trim();
    if (!n) {
      existingPlaylistThumbEl.style.display = 'none';
      existingPlaylistThumbEl.removeAttribute('src');
      return;
    }
    existingPlaylistThumbEl.style.display = '';
    existingPlaylistThumbEl.src = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(n)}.jpg?t=${Date.now()}`;
    existingPlaylistThumbEl.onerror = () => {
      existingPlaylistThumbEl.onerror = null;
      existingPlaylistThumbEl.src = moodeDefaultCoverUrl();
    };
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
    const moodeHintEl = $('moodeHint');

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
      ratingsEnabled = Boolean(cfg?.features?.ratings ?? true);
      podcastsEnabled = Boolean(cfg?.features?.podcasts ?? true);
      syncRatingsUi();
      syncPodcastSectionVisibility();
      if (alexaHintEl) alexaHintEl.textContent = !axEnabled ? 'disabled' : (axDomain || 'missing domain');
      const moodeHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || cfg?.mpdHost || '').trim();
      if (moodeHintEl) moodeHintEl.textContent = moodeHost ? `confirmed (${moodeHost})` : 'not verified';
      setPillState('apiPill','ok');
      setPillState('webPill','ok');
      setPillState('alexaPill', !axEnabled ? 'off' : (axDomain ? 'ok' : 'warn'));
      setPillState('moodePill', moodeHost ? 'ok' : 'warn');

      runtimeLoaded = true;
    } catch (e) {
      if ($('apiBase') && !$('apiBase').value) $('apiBase').value = apiBaseGuess;
      if (activeApiBaseEl) activeApiBaseEl.textContent = $('apiBase')?.value || apiBaseGuess;
      if (activeTrackKeyEl) activeTrackKeyEl.textContent = 'unavailable';
      const host = location.hostname || '10.0.0.233';
      if (apiHintEl) apiHintEl.textContent = `${host}:3101`;
      if (webHintEl) webHintEl.textContent = `${host}:8101`;
      if (alexaHintEl) alexaHintEl.textContent = 'unknown';
      if (moodeHintEl) moodeHintEl.textContent = 'not verified';
      ratingsEnabled = true;
      podcastsEnabled = true;
      syncRatingsUi();
      syncPodcastSectionVisibility();
      setPillState('apiPill','bad');
      setPillState('webPill','warn');
      setPillState('alexaPill','warn');
      setPillState('moodePill','warn');
    }
  }

  const MAX_TRACKS_STORAGE = 'nowplaying.queuewizard.maxTracks';
  function getMaxTracks() {
    const n = Number($('maxTracks')?.value || 25);
    return Number.isFinite(n) ? n : 25;
  }

  function getMinRating() {
    return ratingsEnabled ? Number($('minRating')?.value || 0) : 0;
  }

  function getMinRatingVibe() {
    return ratingsEnabled ? Number($('minRatingVibe')?.value || 0) : 0;
  }

  function hasExistingPlaylistSelected() {
    return !!String(existingPlaylistsEl?.value || '').trim();
  }

  function syncRatingsUi(){
    const min1 = $('minRating');
    const min2 = $('minRatingVibe');
    const l1 = min1 ? min1.closest('label') : null;
    const l2 = min2 ? min2.closest('label') : null;
    if (l1) l1.style.display = ratingsEnabled ? '' : 'none';
    if (l2) l2.style.display = ratingsEnabled ? '' : 'none';
  }

  function getMode() {
    return document.querySelector('input[name="mode"]:checked')?.value || 'replace';
  }

  function getModeVibe() {
    return document.querySelector('input[name="modeVibe"]:checked')?.value || 'replace';
  }

  function getModePodcast() {
    return document.querySelector('input[name="modePodcast"]:checked')?.value || 'replace';
  }

  function getModeExisting() {
    return document.querySelector('input[name="modeExisting"]:checked')?.value || 'replace';
  }

  function getShuffle() {
    return !!$('shuffle')?.checked;
  }

  function getShuffleExisting() {
    return !!shuffleExistingEl?.checked;
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

  function getKeepNowPlayingPodcast() {
    return getModePodcast() === 'replace' && !!cropPodcastEl?.checked;
  }

  function getKeepNowPlayingExisting() {
    return getModeExisting() === 'replace' && !!cropExistingEl?.checked;
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

  function syncCropPodcastUi() {
    const mode = getModePodcast();
    if (!cropPodcastEl) return;
    cropPodcastEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropPodcastEl.checked = false;
  }

  function syncCropExistingUi() {
    const mode = getModeExisting();
    if (!cropExistingEl) return;
    cropExistingEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropExistingEl.checked = false;
  }

  function disableUI(disabled) {
    const disable = !!disabled;

    if (vibeBtn) vibeBtn.disabled = disable;
    if (sendFilteredBtn) sendFilteredBtn.disabled = disable;
    if (sendVibeBtn) sendVibeBtn.disabled = disable || currentListSource !== 'vibe' || currentFiles.length === 0;
    if (podcastBuildBtn) podcastBuildBtn.disabled = disable;
    if (sendPodcastBtn) sendPodcastBtn.disabled = disable || currentListSource !== 'podcast' || currentFiles.length === 0;
    if (sendExistingBtn) sendExistingBtn.disabled = disable || currentListSource !== 'existing' || currentFiles.length === 0;

    [
      'apiBase', 'key', 'maxTracks', 'minRating',
      'genres', 'artists', 'albums', 'excludeGenres',
      'shuffle', 'crop', 'cropVibe', 'cropPodcast', 'minRatingVibe',
      'podcastShows', 'podcastDateFrom', 'podcastDateTo', 'podcastMaxPerShow', 'podcastDownloadedOnly', 'podcastNewestFirst',
      'playlistName',
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = disable;
    });

    document.querySelectorAll('input[name="mode"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modeVibe"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modePodcast"]').forEach((el) => { el.disabled = disable; });
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

  function sanitizePlaylistName(raw = '') {
    return String(raw || '')
      .replace(/[\/\\\0<>:"|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function suggestedPlaylistName() {
    const topFrom = (arr) => {
      const m = new Map();
      for (const v0 of arr || []) {
        const v = String(v0 || '').trim();
        if (!v) continue;
        m.set(v, Number(m.get(v) || 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
    };

    const shortArtist = (name) => {
      const s = String(name || '').trim();
      if (!s) return '';
      const parts = s.split(/\s+/).filter(Boolean);
      return parts.length > 1 ? parts[parts.length - 1] : s;
    };

    const selectedArtists = selectedValues($('artists')).map(shortArtist).filter(Boolean);
    const selectedAlbums = selectedValues($('albums')).map((x) => String(x || '').trim()).filter(Boolean);
    const selectedGenres = selectedValues($('genres')).map((x) => String(x || '').trim()).filter(Boolean);

    const trackArtists = currentTracks.map((t) => String(t?.artist || '').trim()).filter(Boolean);
    const trackGenres = currentTracks
      .map((t) => String(t?.genre || '').split(/[;,|/]/).map((x) => String(x || '').trim()).filter(Boolean))
      .flat();

    const topArtist = topFrom(trackArtists);
    const topGenre = topFrom(trackGenres);

    if (currentListSource === 'vibe') {
      return sanitizePlaylistName(`Vibe Mix${topArtist ? ` — ${topArtist}` : ''}`);
    }

    if (currentListSource === 'podcast') {
      const show = topArtist || String((currentTracks[0] || {}).artist || '').trim();
      return sanitizePlaylistName(show ? `${show} Picks` : 'Podcast Picks');
    }

    if (currentListSource === 'existing') {
      const n = String(existingPlaylistsEl?.value || '').trim() || 'Playlist';
      return sanitizePlaylistName(`${n} Rebuild`);
    }

    // Filters/general naming policy:
    // 1) If artists filter used: up to three artists, hyphen-joined (e.g., Mayer-Sting-Clapton)
    // 2) Else if albums filter used: first album (+ "and more" when multiple)
    // 3) Else if genre filter used: genre + "Mix"
    // 4) Else fallback to dominant track metadata.
    if (selectedArtists.length) {
      const names = selectedArtists.slice(0, 3);
      const base = names.join('-');
      if (selectedGenres.length || selectedAlbums.length) return sanitizePlaylistName(`${base} Mix`);
      return sanitizePlaylistName(base);
    }

    if (selectedAlbums.length) {
      const first = selectedAlbums[0];
      const tail = selectedAlbums.length > 1 ? ' and more' : '';
      return sanitizePlaylistName(`${first}${tail}`);
    }

    if (selectedGenres.length) {
      return sanitizePlaylistName(`${selectedGenres[0]} Mix`);
    }

    if (topGenre && topArtist) return sanitizePlaylistName(`${topArtist} ${topGenre} Mix`);
    if (topArtist) return sanitizePlaylistName(`${topArtist} Mix`);
    if (topGenre) return sanitizePlaylistName(`${topGenre} Mix`);

    return sanitizePlaylistName('Queue Wizard Mix');
  }

  function renderPlaylistSuggestion() {
    if (!playlistSuggestionEl) return;
    const canSuggest = Array.isArray(currentTracks) && currentTracks.length > 0;
    if (!canSuggest) {
      playlistSuggestionEl.style.display = 'none';
      playlistSuggestionEl.textContent = '';
      return;
    }
    const suggested = suggestedPlaylistName();
    playlistSuggestionEl.style.display = '';
    playlistSuggestionEl.innerHTML = `Suggested playlist: <b>${esc(suggested)}</b>`;
  }

  // ---- Results table ----
  function clearResults() {
    if (resultsEl) resultsEl.innerHTML = '';
  }

  function ensureResultsTable() {
    if (!resultsEl) return null;
    resultsEl.innerHTML =
      `<table style="font-size:16px;line-height:1.35;">
        <thead>
          <tr><th>Action</th><th>Art</th><th>Artist</th><th>Title</th><th>Date</th><th>Album</th><th>Genre</th><th>Order</th></tr>
        </thead>
        <tbody id="resultsBody"></tbody>
      </table>`;
    return $('resultsBody');
  }

  function appendRow(t, idx, tbody) {
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.setAttribute('data-track-idx', String(idx));
    tr.setAttribute('draggable', 'true');

    const file = String(t.file || '').trim();
    const art = file ? `${getApiBase()}/art/track_640.jpg?file=${encodeURIComponent(file)}` : '';
    const shortDate = isPodcastLike(t) ? formatShortDate(t?.date) : '';
    tr.innerHTML =
      `<td><button type="button" data-remove-track="${idx}" title="Remove track from built list" style="padding:4px 8px;">Remove</button></td>` +
      `<td>${art ? `<img src="${art}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #334;background:#0a1222;" />` : ''}</td>` +
      `<td>${esc(t.artist || '')}</td>` +
      `<td>${esc(t.title || '')}</td>` +
      `<td>${esc(shortDate)}</td>` +
      `<td>${esc(t.album || '')}</td>` +
      `<td>${esc(t.genre || '')}</td>` +
      `<td style="white-space:nowrap;"><span title="Drag row to reorder" style="cursor:grab;opacity:.8;font-size:16px;letter-spacing:1px;">☰</span></td>`;
    tbody.appendChild(tr);
  }

  function renderTracksToTable(tracks) {
    clearResults();
    const tbody = ensureResultsTable();
    (tracks || []).slice(0, MAX_RENDER_ROWS).forEach((t, idx) => appendRow(t, idx, tbody));
  }

  function isPodcastLike(item = {}) {
    const genre = String(item?.genre || '').toLowerCase();
    const album = String(item?.album || '').toLowerCase();
    const file = String(item?.file || '').toLowerCase();
    return genre.includes('podcast') || album.includes('podcast') || file.includes('/podcast');
  }

  function formatShortDate(value) {
    const ts = parseIsoDateSafe(value);
    if (ts == null) return '';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  }

  function starsHtml(file, rating) {
    if (!ratingsEnabled) return '';
    const f = encodeURIComponent(String(file || ''));
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '<div style="display:flex;gap:2px;align-items:center;">';
    for (let i = 1; i <= 5; i += 1) {
      const on = i <= r;
      out += `<button type="button" data-queue-rate-file="${f}" data-queue-rate-val="${i}" title="Rate ${i} star${i>1?'s':''}" style="padding:0 2px;border:0;background:transparent;font-size:15px;line-height:1;color:${on?'#fbbf24':'#5b6780'};cursor:pointer;">★</button>`;
    }
    out += '</div>';
    return out;
  }

  function renderQueueCard(items, randomOn = null) {
    if (!resultsEl) return;
    const apiBase = getApiBase();
    const list = Array.isArray(items) ? items.slice(0, 120) : [];
    const shuffleLabel = typeof randomOn === 'boolean' ? `Shuffle: ${randomOn ? 'On' : 'Off'}` : 'Shuffle';
    const shuffleStyle = typeof randomOn === 'boolean' && randomOn ? 'border-color:#22c55e;' : '';
    const controlsHtml = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 10px 0;padding-top:6px;"><button type="button" data-queue-playback="play">Play</button><button type="button" data-queue-playback="pause">Pause</button><button type="button" data-queue-playback="prev">Prev</button><button type="button" data-queue-playback="next">Next</button><button type="button" data-queue-playback="shuffle" style="${shuffleStyle}">${shuffleLabel}</button><button type="button" data-queue-playback="reload">Reload queue</button></div>`;
    if (!list.length) {
      resultsEl.innerHTML = `${controlsHtml}<div class="muted">Queue is empty.</div>`;
      return;
    }
    resultsEl.innerHTML = controlsHtml + list.map((x) => {
      const thumbSrc = x.thumbUrl ? (String(x.thumbUrl).startsWith('http') ? String(x.thumbUrl) : `${apiBase}${x.thumbUrl}`) : '';
      const thumb = thumbSrc
        ? `<img src="${thumbSrc}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #2a3a58;background:#111;" />`
        : '<div style="width:36px;height:36px"></div>';
      const head = !!x.isHead;
      const pos = Number(x.position || 0);
      const file = String(x.file || '');
      const stars = isPodcastLike(x) ? '' : starsHtml(file, Number(x.rating || 0));
      const starsRow = stars ? `<div style="margin-top:2px;">${stars}</div>` : '';
      return `<div style="display:flex;gap:8px;align-items:center;padding:6px 6px;border-bottom:1px dashed #233650;${head?'background:rgba(34,197,94,.15);border-radius:8px;':''}">${thumb}<div style="min-width:0;flex:1 1 auto;"><div><b>${String(pos||0)}</b>. ${head?'▶️ ':''}${esc(String(x.artist||''))}</div><div class="muted">${esc(String(x.title||''))} ${x.album?`• ${esc(String(x.album||''))}`:''}</div>${starsRow}</div><button type="button" data-queue-remove-pos="${pos}" style="margin-left:auto;">Remove</button></div>`;
    }).join('');
  }

  function renderPlaylistThumbStrip() {
    // Intentionally disabled: user requested no per-track thumbnail strip in cover preview.
    if (!playlistThumbStripEl) return;
    playlistThumbStripEl.innerHTML = '';
    playlistThumbStripEl.style.display = 'none';
  }

  function refreshCurrentListMetaAndUi() {
    currentFiles = currentTracks.map((t) => String(t.file || '').trim()).filter(Boolean);

    const label = currentListSource === 'vibe'
      ? 'Vibe list'
      : (currentListSource === 'filters' ? 'Filter list'
      : (currentListSource === 'existing' ? 'Existing playlist'
      : (currentListSource === 'podcast' ? 'Podcast list' : 'List')));

    setCount(`${label} ready: ${currentTracks.length.toLocaleString()} track(s).`);
    if (sendVibeBtn) sendVibeBtn.disabled = !(currentListSource === 'vibe' && currentFiles.length > 0);
    if (sendPodcastBtn) sendPodcastBtn.disabled = !(currentListSource === 'podcast' && currentFiles.length > 0);
    if (sendExistingBtn) sendExistingBtn.disabled = !(currentListSource === 'existing' && currentFiles.length > 0);

    renderFiltersSummary();
    renderPlaylistSuggestion();
  }

  function removeTrackAt(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentTracks.length) return;
    currentTracks.splice(idx, 1);
    renderTracksToTable(currentTracks);
    renderPlaylistThumbStrip(currentTracks);
    refreshCurrentListMetaAndUi();
    if (!currentTracks.length) setStatus('No tracks left in current list.');
  }

  function moveTrack(fromIdx, toIdx) {
    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= currentTracks.length || toIdx >= currentTracks.length) return;
    if (fromIdx === toIdx) return;
    const [moved] = currentTracks.splice(fromIdx, 1);
    currentTracks.splice(toIdx, 0, moved);
    renderTracksToTable(currentTracks);
    renderPlaylistThumbStrip(currentTracks);
    refreshCurrentListMetaAndUi();
  }

  function shuffleCurrentTracksInPlace() {
    if (!Array.isArray(currentTracks) || currentTracks.length < 2) return;
    for (let i = currentTracks.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentTracks[i], currentTracks[j]] = [currentTracks[j], currentTracks[i]];
    }
    listOrderShuffled = true;
    renderTracksToTable(currentTracks);
    renderPlaylistThumbStrip(currentTracks);
    refreshCurrentListMetaAndUi();
  }

  function setCurrentList(source, tracks) {
    currentListSource = source || 'none';
    if (currentListSource === 'filters' || currentListSource === 'vibe' || currentListSource === 'podcast') {
      activateBuilder(currentListSource);
    }
    currentTracks = Array.isArray(tracks) ? tracks.slice() : [];
    listOrderShuffled = false;

    renderTracksToTable(currentTracks);
    renderPlaylistThumbStrip(currentTracks);
    if (coverCardEl) coverCardEl.style.display = (currentListSource === 'podcast') ? 'none' : '';

    lastCollageSig = '';
    refreshCurrentListMetaAndUi();
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
      if (!coverImgEl.src) coverImgEl.src = moodeDefaultCoverUrl();
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
    const albums = selectedValues($('albums'));
    const excludes = selectedValues($('excludeGenres'));
    const stars = getMinRating();
    const maxTracks = getMaxTracks();

    const mode = getMode();
    const keep = getKeepNowPlaying();
    const doShuffle = getShuffle();

    const savePlaylist = savePlaylistEnabled;
    const playlistName = savePlaylist ? getPlaylistNameRaw() : '';
    const wantsCollage = !!savePlaylist;

    const starsTxt = !ratingsEnabled ? 'Disabled' : (stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'Any');
    const fmt = (arr) => arr.length ? arr.map(esc).join(', ') : 'Any';

    const src = currentListSource === 'vibe' ? 'vibe'
      : (currentListSource === 'filters' ? 'filters'
      : (currentListSource === 'existing' ? 'existing'
      : (currentListSource === 'podcast' ? 'podcast'
      : (currentListSource === 'queue' ? 'queue' : 'none'))));

    summaryEl.innerHTML =
      `List source: <b>${esc(src)}</b> · ` +
      `Genres: ${fmt(genres)} · Artists: ${fmt(artists)} · Albums: ${fmt(albums)} · Excluding: ${fmt(excludes)} · ` +
      `Min rating: ${esc(starsTxt)} · Max: ${Number(maxTracks).toLocaleString()} · ` +
      `Mode: ${esc(mode)}${mode === 'replace' ? (keep ? ' (crop)' : ' (clear)') : ''} · ` +
      `Shuffle: ${doShuffle ? 'Yes' : 'No'} · ` +
      `Save playlist: ${savePlaylist ? `Yes (${esc(playlistName || 'unnamed')})` : 'No'}` +
      (wantsCollage ? ' · Cover: collage' : '');
  }

  // ---- Load options ----
  function setOptions(el, arr) {
    if (!el) return;
    el.innerHTML = (arr || []).map((v) => {
      if (v && typeof v === 'object') {
        const value = esc(String(v.value ?? ''));
        const label = esc(String(v.label ?? v.value ?? ''));
        return `<option value="${value}">${label}</option>`;
      }
      const s = esc(String(v ?? ''));
      return `<option value="${s}">${s}</option>`;
    }).join('');
  }

  function renderExistingPlaylistMenu(names = []) {
    if (!existingPlaylistMenuEl || !existingPlaylistLabelEl) return;
    const selected = String(existingPlaylistsEl?.value || '').trim();
    existingPlaylistLabelEl.textContent = selected || '(select existing playlist)';

    const rows = [`<button type="button" data-existing-playlist="" style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 10px;border:0;background:transparent;color:#e7eefc;text-align:left;border-radius:10px;font-size:15px;line-height:1.25;">(select existing playlist)</button>`];
    for (const n0 of names || []) {
      const n = String(n0 || '').trim();
      if (!n) continue;
      const src = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(n)}.jpg`;
      rows.push(
        `<button type="button" data-existing-playlist="${esc(n)}" style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 10px;border:0;background:${selected===n?'rgba(127,211,167,.18)':'transparent'};color:#e7eefc;text-align:left;border-radius:10px;font-size:15px;line-height:1.25;">` +
        `<img src="${src}" onerror="this.onerror=null;this.src='${moodeDefaultCoverUrl()}'" style="width:40px;height:40px;object-fit:cover;border-radius:10px;border:1px solid #334;background:#0a1222;flex:0 0 auto;" />` +
        `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n)}</span>` +
        `</button>`
      );
    }
    existingPlaylistMenuEl.innerHTML = rows.join('');
  }

  function setExistingPlaylistOptions(names = [], selected = '') {
    if (!existingPlaylistsEl) return;
    const selectedName = String(selected || '').trim();
    const opts = [{ value: '', label: '(select existing playlist)' }, ...(names || []).map((n) => ({ value: String(n || ''), label: String(n || '') }))];
    existingPlaylistsEl.innerHTML = opts.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');
    if (selectedName && (names || []).includes(selectedName)) existingPlaylistsEl.value = selectedName;
    updateExistingPlaylistThumb(existingPlaylistsEl.value || '');
    renderExistingPlaylistMenu(names);
  }

  async function loadExistingPlaylists() {
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase || !existingPlaylistsEl) return;
    try {
      setExistingPlaylistOptions(['loading…']);
      existingPlaylistsEl.disabled = true;
      const r = await fetch(`${apiBase}/config/queue-wizard/playlists`, { headers: { 'x-track-key': key }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const names = Array.isArray(j?.playlists) ? j.playlists.map((x) => String(x || '').trim()).filter(Boolean) : [];
      setExistingPlaylistOptions(names, getPlaylistNameRaw());
      existingPlaylistsEl.disabled = false;
      updatePlaylistUi();
    } catch (_) {
      setExistingPlaylistOptions([]);
      existingPlaylistsEl.disabled = false;
      updatePlaylistUi();
    }
  }

  async function previewExistingPlaylistSelection() {
    const apiBase = getApiBase();
    const key = getKey();
    const name = String(existingPlaylistsEl?.value || '').trim();
    if (!apiBase || !name) return;

    try {
      activateBuilder('existing');
      if (coverCardEl) coverCardEl.style.display = '';
      if (coverStatusEl) coverStatusEl.textContent = `Playlist cover: “${name}”.`;
      if (coverImgEl) {
        coverImgEl.src = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(name)}.jpg?t=${Date.now()}`;
        coverImgEl.onerror = () => {
          coverImgEl.onerror = null;
          coverImgEl.src = moodeDefaultCoverUrl();
        };
      }

      setStatus('<span class="spin"></span>Loading playlist preview…');
      const r = await fetch(`${apiBase}/config/queue-wizard/playlist-preview?playlist=${encodeURIComponent(name)}`, {
        headers: { 'x-track-key': key },
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const tracks = Array.isArray(j?.tracks) ? j.tracks : [];
      setCurrentList('existing', tracks);
      setStatus(`Loaded playlist preview: ${esc(name)} (${tracks.length.toLocaleString()} track(s)).`);
    } catch (e) {
      setStatus(`Playlist preview failed: ${esc(e?.message || e)}`);
    }
  }

  async function loadPlaylistToQueueNow() {
    const apiBase = getApiBase();
    const key = getKey();
    const name = String(existingPlaylistsEl?.value || '').trim();
    if (!apiBase) return;
    if (!name) {
      setStatus('Pick an existing playlist first.');
      return;
    }
    try {
      if (loadExistingPlaylistBtn) loadExistingPlaylistBtn.disabled = true;
      setStatus('<span class="spin"></span>Loading playlist into queue…');
      const r = await fetch(`${apiBase}/config/queue-wizard/load-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({ playlist: name, mode: 'replace', play: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatus(`Loaded playlist: ${esc(name)} (${Number(j.added || 0)} track(s)).`);
      showSendConfirmation(`✅ Loaded “${name}” and started playback.`);
      await loadCurrentQueueCard().catch(() => {});
    } catch (e) {
      setStatus(`Load playlist failed: ${esc(e?.message || e)}`);
    } finally {
      if (loadExistingPlaylistBtn) loadExistingPlaylistBtn.disabled = false;
    }
  }

  async function sendDiagnosticsAction(action, payload = {}) {
    const apiBase = getApiBase();
    const key = getKey();
    const r = await fetch(`${apiBase}/config/diagnostics/playback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadCurrentQueueCard() {
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase) return;
    const r = await fetch(`${apiBase}/config/diagnostics/queue`, { headers: { 'x-track-key': key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    if (typeof j?.ratingsEnabled === 'boolean') {
      ratingsEnabled = j.ratingsEnabled;
      syncRatingsUi();
    }
    const items = Array.isArray(j.items) ? j.items : [];
    const randomOn = typeof j.randomOn === 'boolean' ? j.randomOn : null;
    renderQueueCard(items, randomOn);

    const tracks = items.map((x) => ({
      artist: String(x.artist || ''),
      title: String(x.title || ''),
      album: String(x.album || ''),
      file: String(x.file || ''),
      genre: '',
    }));
    currentListSource = 'queue';
    currentTracks = tracks;
    currentFiles = tracks.map((t) => String(t.file || '')).filter(Boolean);
    setCount(`Current queue: ${items.length.toLocaleString()} track(s).`);
    // For current queue mode, no need to display full thumb strip in cover card.
    renderPlaylistThumbStrip([]);
    renderFiltersSummary();

    // On page load/current-queue refresh, generate a collage preview from live queue.
    if (currentFiles.length) {
      maybeGenerateCollagePreview('queue-load').catch(() => {});
    }
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
      setOptions($('albums'), j.albums || []);

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
      if (podcastsEnabled) await loadPodcastShows().catch(() => {});
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    }
  }

  async function loadPodcastShows() {
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase || !podcastShowsEl) return;
    try {
      const r = await fetch(`${apiBase}/podcasts`, { headers: { 'x-track-key': key } });
      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j?.items) ? j.items : [];
      podcastShowByRss = new Map(items.map((it) => [String(it?.rss || ''), String(it?.title || it?.rss || '')]));
      const opts = items
        .map((it) => ({ value: String(it?.rss || ''), label: String(it?.title || it?.rss || '') }))
        .filter((x) => x.value)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      setOptions(podcastShowsEl, [{ value: '__ALL__', label: 'All Shows' }, ...opts]);
    } catch (_) {
      // non-fatal
    }
  }

  function parseIsoDateSafe(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }

  function clearDragIndicators() {
    if (!resultsEl) return;
    resultsEl.querySelectorAll('tr.drop-before, tr.drop-after').forEach((row) => {
      row.classList.remove('drop-before', 'drop-after');
    });
  }

  function schedulePodcastBuild(delayMs = 350) {
    if (!podcastsEnabled) return;
    if (podcastBuildTimer) clearTimeout(podcastBuildTimer);
    podcastBuildTimer = setTimeout(() => {
      doPodcastBuild().catch(() => {});
    }, delayMs);
  }

  async function waitUntilNotBusy(maxMs = 8000) {
    const started = Date.now();
    while (busy) {
      if ((Date.now() - started) > maxMs) break;
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  function toDateInputValue(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function applyPodcastPresetDays(daysBack = 2) {
    const toEl = $('podcastDateTo');
    const fromEl = $('podcastDateFrom');
    const now = new Date();
    const from = new Date(now.getTime() - (Math.max(1, Number(daysBack) || 1) * 24 * 60 * 60 * 1000));
    if (toEl) toEl.value = toDateInputValue(now);
    if (fromEl) fromEl.value = toDateInputValue(from);
  }

  function hideCoverForPodcastBuilder() {
    if (coverCardEl) coverCardEl.style.display = 'none';
  }

  async function doPodcastBuild() {
    if (!podcastsEnabled) {
      setStatus('Podcasts feature is disabled in Config.');
      return;
    }
    if (busy) return;
    busy = true;

    const apiBase = getApiBase();
    const key = getKey();
    const selectedRaw = selectedValues(podcastShowsEl);
    const selectedRss = selectedRaw.includes('__ALL__')
      ? Array.from(podcastShowByRss.keys())
      : selectedRaw.filter((v) => v && v !== '__ALL__');
    const fromTs = parseIsoDateSafe($('podcastDateFrom')?.value);
    const toTsRaw = parseIsoDateSafe($('podcastDateTo')?.value);
    const toTs = toTsRaw == null ? null : (toTsRaw + 86400000 - 1);
    const downloadedOnly = !!$('podcastDownloadedOnly')?.checked;
    const newestFirst = !!$('podcastNewestFirst')?.checked;
    const maxPerShow = Math.max(1, Math.min(100, Number($('podcastMaxPerShow')?.value || 10)));

    if (!selectedRss.length) {
      setStatus('Select at least one podcast show.');
      busy = false;
      return;
    }

    setStatus('<span class="spin"></span>Building podcast list…');
    setCount('Building podcast list…');

    try {
      const perShowLimit = Math.max(maxPerShow * 4, 40);
      const all = [];

      for (const rss of selectedRss) {
        const rr = await fetch(`${apiBase}/podcasts/episodes/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-track-key': key },
          body: JSON.stringify({ rss, limit: perShowLimit }),
        });
        const jj = await rr.json().catch(() => ({}));
        if (!rr.ok || !jj?.ok) continue;
        let eps = Array.isArray(jj?.episodes) ? jj.episodes.slice() : [];

        eps = eps
          .map((ep) => {
            const dateRaw = String(ep?.date || '').trim();
            const ts = parseIsoDateSafe(dateRaw);
            const mpdPath = String(ep?.mpdPath || '').trim();
            return {
              rss,
              show: podcastShowByRss.get(rss) || rss,
              artist: podcastShowByRss.get(rss) || rss,
              title: String(ep?.title || ep?.id || 'Episode'),
              album: podcastShowByRss.get(rss) || 'Podcast',
              genre: 'Podcast',
              date: dateRaw,
              ts,
              downloaded: !!ep?.downloaded,
              file: mpdPath,
            };
          })
          .filter((x) => x.file)
          .filter((x) => (downloadedOnly ? x.downloaded : true))
          .filter((x) => {
            if (fromTs == null && toTs == null) return true;
            if (x.ts == null) return false;
            if (fromTs != null && x.ts < fromTs) return false;
            if (toTs != null && x.ts > toTs) return false;
            return true;
          })
          .sort((a, b) => (newestFirst ? (Number(b.ts || 0) - Number(a.ts || 0)) : (Number(a.ts || 0) - Number(b.ts || 0))) )
          .slice(0, maxPerShow);

        all.push(...eps);
      }

      if (newestFirst) all.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
      else all.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));

      const maxTracks = getMaxTracks();
      const tracks = all.slice(0, maxTracks);
      setCurrentList('podcast', tracks);
      setStatus(tracks.length ? 'Podcast list built. Ready to send.' : 'No podcast episodes matched your filters.');
      if (coverCardEl) coverCardEl.style.display = 'none';
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    } finally {
      busy = false;
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
        albums: selectedValues($('albums')),
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
    const seedArtist = String(startJson.seedArtist || '').trim();
    const seedTitle = String(startJson.seedTitle || '').trim();
    if (vibeProgressDetail) vibeProgressDetail.textContent = `Seed: ${seedArtist}${seedArtist && seedTitle ? ' — ' : ''}${seedTitle}`;

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

  function collagePreviewFiles() {
    const byArtist = new Map();
    for (const t of currentTracks || []) {
      const f = String(t?.file || '').trim();
      if (!f) continue;
      const a = String(t?.artist || '').trim().toLowerCase();
      const key = a || `__noartist__:${f}`;
      if (!byArtist.has(key)) byArtist.set(key, f);
    }
    const distinct = Array.from(byArtist.values()).filter(Boolean);
    if (distinct.length >= 4) return distinct.slice(0, 4);
    return currentFiles.slice();
  }

  function computeCollageSig() {
    const name = getPlaylistNameRaw();
    const files = collagePreviewFiles();
    const head = files.slice(0, 50).join('|');
    return `${name}::${files.length}::${head}`;
  }

async function maybeGenerateCollagePreview(reason = '') {
  if (!coverCardEl || !coverImgEl || !coverStatusEl) return;

  // If user selected an existing playlist, keep that playlist's cover preview.
  if (hasExistingPlaylistSelected()) return;

  const apiBase = getApiBase();
  const key = getKey();

  // VIBE PREVIEW: always allowed, does NOT require Save Playlist
  const isVibe = (reason === 'vibe-build') || (currentListSource === 'vibe');

  if (isVibe) {
    if (!apiBase) { setStatus('Cover preview error: API base is empty.'); return; }
    if (!key) { setStatus('Cover preview error: track key is empty.'); return; }
    if (!currentFiles.length) { setStatus('Cover preview error: no tracks to preview.'); return; }

    // Prevent repeated calls for identical list
    const vibePreviewFiles = collagePreviewFiles();
    const sig = `vibe::${vibePreviewFiles.length}::${vibePreviewFiles.slice(0, 50).join('|')}`;
    if (sig === lastCollageSig) return;
    lastCollageSig = sig;

    if (collageBusy) return;
    collageBusy = true;

    try {
      coverCardEl.style.display = '';
      coverStatusEl.textContent = 'Generating vibe collage preview…';
      coverImgEl.src = moodeDefaultCoverUrl();

      const r = await fetch(`${apiBase}${COLLAGE_PREVIEW_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({
          // playlistName omitted on purpose for vibe preview
          tracks: vibePreviewFiles,
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
  const previewFiles = collagePreviewFiles();
  const sig = `${playlistName || '(preview)'}::${previewFiles.length}::${previewFiles.slice(0, 50).join('|')}`;
  if (sig && sig === lastCollageSig) return;

  if (collageBusy) return;
  collageBusy = true;

  try {
    showPlaylistHint('');
    setStatus('<span class="spin"></span>Generating collage preview…');
    coverCardEl.style.display = '';
    coverStatusEl.textContent = 'Generating collage preview…';
    coverImgEl.src = moodeDefaultCoverUrl();

    const payload = {
      tracks: previewFiles,
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

  function syncBuilderCardVisibility() {
    const existingSelected = hasExistingPlaylistSelected();
    if (existingSectionEl) existingSectionEl.classList.remove('hidden');

    if (existingSelected) {
      if (filterSectionEl) filterSectionEl.classList.add('hidden');
      if (vibeSectionEl) vibeSectionEl.classList.add('hidden');
      if (podcastSectionEl) podcastSectionEl.classList.add('hidden');
      if (vibeDisabledNoteEl) vibeDisabledNoteEl.classList.add('hidden');
      return;
    }

    applyBuilderVisibility();
  }

  function updatePlaylistUi() {
    const existingSelected = hasExistingPlaylistSelected();
    if (existingSelected && savePlaylistEnabled) savePlaylistEnabled = false;

    const savePlaylist = savePlaylistEnabled;
    const opts = $('playlistOptions');

    if (savePlaylistBtn) savePlaylistBtn.classList.toggle('hidden', existingSelected);
    if (opts) opts.classList.toggle('hidden', !savePlaylist || existingSelected);
    // collage is implicit when Save Playlist is enabled

    if (savePlaylist) {
      const p = playlistNameProblems(getPlaylistNameRaw());
      showPlaylistHint(p.ok ? '' : p.msg);
    } else {
      showPlaylistHint('');
    }

    syncBuilderCardVisibility();
    renderFiltersSummary();
    refreshCoverPreview('');
  }

  function showSendConfirmation(msg) {
    if (!sendConfirmEl) return;
    sendConfirmEl.textContent = msg || '';
    if (showSendConfirmation._t) clearTimeout(showSendConfirmation._t);
    showSendConfirmation._t = setTimeout(() => {
      if (sendConfirmEl.textContent === msg) sendConfirmEl.textContent = '';
    }, 5000);

    try {
      if (!msg) return;
      if (!('Notification' in window)) return;
      const fire = () => new Notification('Queue Wizard', { body: msg });
      if (Notification.permission === 'granted') fire();
      else if (Notification.permission === 'default') Notification.requestPermission().then((p) => { if (p === 'granted') fire(); }).catch(() => {});
    } catch {}
  }

  function syncSavePlaylistButton() {
    if (!savePlaylistBtn) return;
    savePlaylistBtn.textContent = 'Save Queue to Playlist';
    savePlaylistBtn.style.opacity = savePlaylistEnabled ? '1' : '0.92';
    savePlaylistBtn.style.outline = savePlaylistEnabled ? '2px solid #7fd3a7' : '';
    savePlaylistBtn.setAttribute('aria-pressed', savePlaylistEnabled ? 'true' : 'false');
  }

  // ---- Send current list to moOde ----
  async function doSendToMoode(source = 'any') {
    if (sendBusy) return;
    sendBusy = true;

    if (source === 'filters' && currentListSource !== 'existing') {
      await doPreview();
    }

    if (source === 'vibe' && currentListSource !== 'vibe') {
      setStatus('Build a vibe list first, then send it.');
      sendBusy = false;
      return;
    }
    if (source === 'podcast') {
      await waitUntilNotBusy();
      await doPodcastBuild();
      if (currentListSource !== 'podcast' || !currentFiles.length) {
        setStatus('Podcast list is empty (or still building). Adjust filters and try again.');
        sendBusy = false;
        return;
      }
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
    const isPodcastSend = source === 'podcast';
    const isExistingSend = source === 'existing';
    const mode = isVibeSend
      ? getModeVibe()
      : (isPodcastSend ? getModePodcast() : (isExistingSend ? getModeExisting() : getMode()));
    const keepNowPlaying = isVibeSend
      ? getKeepNowPlayingVibe()
      : (isPodcastSend ? getKeepNowPlayingPodcast() : (isExistingSend ? getKeepNowPlayingExisting() : getKeepNowPlaying()));
    const doShuffleFlag = false; // UI shuffle reorders list directly; do not enable MPD random mode.
    const forceRandomOff = listOrderShuffled || (isExistingSend ? getShuffleExisting() : getShuffle());

    const savePlaylist = (source === 'podcast') ? false : savePlaylistEnabled;
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
          forceRandomOff,
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

      if (mode === 'append') {
        await loadCurrentQueueCard().catch(() => {});
      }

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
  themeToggleEl?.addEventListener('click', (e) => {
    e.preventDefault();
    const isLight = document.body.classList.contains('theme-light');
    applyTheme(isLight ? 'dark' : 'light');
  });

  vibeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('vibe');
    doVibeBuild();
  });

  sendFilteredBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('filters');
    const src = (currentListSource === 'existing') ? 'existing' : 'filters';
    doSendToMoode(src);
  });

  sendExistingBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('existing');
    doSendToMoode('existing');
  });

  sendVibeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('vibe');
    doSendToMoode('vibe');
  });

  podcastBuildBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('podcast');
    hideCoverForPodcastBuilder();
    doPodcastBuild();
  });

  sendPodcastBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('podcast');
    hideCoverForPodcastBuilder();
    doSendToMoode('podcast');
  });

  podcastPreset24hBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('podcast');
    applyPodcastPresetDays(1);
    hideCoverForPodcastBuilder();
    schedulePodcastBuild(120);
  });
  podcastPreset48hBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('podcast');
    applyPodcastPresetDays(2);
    hideCoverForPodcastBuilder();
    schedulePodcastBuild(120);
  });
  podcastPreset7dBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    activateBuilder('podcast');
    applyPodcastPresetDays(7);
    hideCoverForPodcastBuilder();
    schedulePodcastBuild(120);
  });

  ['podcastShows','podcastDateFrom','podcastDateTo','podcastMaxPerShow','podcastDownloadedOnly','podcastNewestFirst'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      activateBuilder('podcast');
      hideCoverForPodcastBuilder();
      schedulePodcastBuild(250);
    });
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.addEventListener('input', () => {
        activateBuilder('podcast');
        hideCoverForPodcastBuilder();
        schedulePodcastBuild(450);
      });
    }
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
      activateBuilder('filters');
      syncCropUi();
      renderFiltersSummary();
    });
  });

  document.querySelectorAll('input[name="modeVibe"]').forEach((el) => {
    el.addEventListener('change', () => {
      activateBuilder('vibe');
      syncCropVibeUi();
    });
  });

  document.querySelectorAll('input[name="modePodcast"]').forEach((el) => {
    el.addEventListener('change', () => {
      activateBuilder('podcast');
      syncCropPodcastUi();
    });
  });

  document.querySelectorAll('input[name="modeExisting"]').forEach((el) => {
    el.addEventListener('change', () => {
      activateBuilder('existing');
      syncCropExistingUi();
    });
  });

  cropEl?.addEventListener('change', () => {
    activateBuilder('filters');
    renderFiltersSummary();
  });
  const shuffleEl = $('shuffle');
  shuffleEl?.addEventListener('change', () => {
    if (!shuffleEl.checked) return;
    if (!['filters', 'existing', 'vibe', 'podcast'].includes(currentListSource)) return;
    shuffleCurrentTracksInPlace();
    setStatus('List shuffled.');
  });
  cropVibeEl?.addEventListener('change', () => { activateBuilder('vibe'); });
  cropPodcastEl?.addEventListener('change', () => { activateBuilder('podcast'); });
  cropExistingEl?.addEventListener('change', () => { activateBuilder('existing'); });
  shuffleExistingEl?.addEventListener('change', () => {
    if (!shuffleExistingEl.checked) return;
    if (currentListSource !== 'existing') return;
    shuffleCurrentTracksInPlace();
    setStatus('Existing playlist shuffled.');
  });

  // Playlist controls should NOT rebuild the list
  savePlaylistBtn?.addEventListener('click', () => {
    savePlaylistEnabled = true;
    const suggested = suggestedPlaylistName();
    if (playlistNameEl) playlistNameEl.value = suggested;
    syncSavePlaylistButton();
    updatePlaylistUi();
  });

  playlistNameEl?.addEventListener('input', () => {
    updatePlaylistUi();
    if (existingPlaylistsEl) existingPlaylistsEl.value = '';
    if (savePlaylistEnabled) maybeGenerateCollagePreview('playlist-name-input');
  });

  existingPlaylistsEl?.addEventListener('change', () => {
    updateExistingPlaylistThumb(existingPlaylistsEl?.value || '');
    renderExistingPlaylistMenu(Array.from(existingPlaylistsEl.options).map((o) => String(o.value || '')).filter(Boolean));
    updatePlaylistUi();
    previewExistingPlaylistSelection();
  });

  existingPlaylistToggleEl?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!existingPlaylistMenuEl) return;
    const open = existingPlaylistMenuEl.style.display !== 'none';
    existingPlaylistMenuEl.style.display = open ? 'none' : '';
  });

  existingPlaylistMenuEl?.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button[data-existing-playlist]') : null;
    if (!el || !existingPlaylistsEl) return;
    const val = String(el.getAttribute('data-existing-playlist') || '');
    existingPlaylistsEl.value = val;
    existingPlaylistMenuEl.style.display = 'none';
    existingPlaylistsEl.dispatchEvent(new Event('change'));
  });

  document.addEventListener('click', (e) => {
    if (!existingPlaylistPickerEl || !existingPlaylistMenuEl) return;
    const t = e.target;
    if (t instanceof Node && existingPlaylistPickerEl.contains(t)) return;
    existingPlaylistMenuEl.style.display = 'none';
  });

  loadExistingPlaylistBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    loadPlaylistToQueueNow();
  });

  savePlaylistNowBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const src = currentListSource === 'vibe' ? 'vibe' : (currentListSource === 'podcast' ? 'podcast' : 'filters');
    doSendToMoode(src);
  });

  resultsEl?.addEventListener('click', (ev) => {
    const el = ev.target instanceof Element ? ev.target : null;
    if (!el) return;

    const removeTrackBtn = el.closest('button[data-remove-track]');
    if (removeTrackBtn) {
      ev.preventDefault();
      const idx = Number(removeTrackBtn.getAttribute('data-remove-track') || -1);
      if (!Number.isInteger(idx) || idx < 0) return;
      removeTrackAt(idx);
      return;
    }

    const playbackBtn = el.closest('button[data-queue-playback]');
    if (playbackBtn) {
      ev.preventDefault();
      const action = String(playbackBtn.getAttribute('data-queue-playback') || '').trim().toLowerCase();
      playbackBtn.disabled = true;
      const op = action === 'reload'
        ? loadCurrentQueueCard()
        : sendDiagnosticsAction(action).then(() => loadCurrentQueueCard());
      op
        .then(() => setStatus(action === 'reload' ? 'Queue reloaded.' : `Playback: ${action}`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`))
        .finally(() => { playbackBtn.disabled = false; });
      return;
    }

    const rateBtn = el.closest('button[data-queue-rate-file][data-queue-rate-val]');
    if (rateBtn) {
      if (!ratingsEnabled) return;
      ev.preventDefault();
      const file = decodeURIComponent(String(rateBtn.getAttribute('data-queue-rate-file') || ''));
      const rating = Number(rateBtn.getAttribute('data-queue-rate-val') || 0);
      if (!file || !Number.isFinite(rating) || rating < 0 || rating > 5) return;
      const row = rateBtn.closest('div');
      if (row) {
        row.querySelectorAll('button[data-queue-rate-file][data-queue-rate-val]').forEach((s) => {
          const v = Number(s.getAttribute('data-queue-rate-val') || 0);
          s.style.color = v <= rating ? '#fbbf24' : '#5b6780';
        });
      }
      sendDiagnosticsAction('rate', { file, rating })
        .then(() => setStatus(`Rated: ${rating} star${rating===1?'':'s'}`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`));
      return;
    }

    const removeBtn = el.closest('button[data-queue-remove-pos]');
    if (removeBtn) {
      ev.preventDefault();
      const position = Number(removeBtn.getAttribute('data-queue-remove-pos') || 0);
      if (!Number.isFinite(position) || position <= 0) return;
      removeBtn.disabled = true;
      sendDiagnosticsAction('remove', { position })
        .then(() => loadCurrentQueueCard())
        .then(() => setStatus(`Removed track at position ${position}.`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`))
        .finally(() => { removeBtn.disabled = false; });
    }
  });

  // remove-by-checkbox removed; using explicit Remove button for consistency.

  resultsEl?.addEventListener('dragstart', (ev) => {
    const row = ev.target instanceof Element ? ev.target.closest('tr[data-track-idx]') : null;
    if (!row) return;
    dragTrackIdx = Number(row.getAttribute('data-track-idx') || -1);
    dragOverTrackIdx = -1;
    dragInsertAfter = false;
    row.classList.add('dragging');

    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(dragTrackIdx));
      // Keep drag ghost stable/full-size instead of tiny default thumbnail.
      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.top = '-1000px';
      ghost.style.left = '-1000px';
      ghost.style.width = `${Math.max(320, Math.round(rect.width))}px`;
      ghost.style.background = '#0f1a2e';
      ghost.style.border = '1px solid #22d3ee';
      ghost.style.opacity = '1';
      document.body.appendChild(ghost);
      ev.dataTransfer.setDragImage(ghost, 16, 16);
      setTimeout(() => ghost.remove(), 0);
    }
  });

  resultsEl?.addEventListener('dragover', (ev) => {
    const row = ev.target instanceof Element ? ev.target.closest('tr[data-track-idx]') : null;
    if (!row) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';

    clearDragIndicators();
    const toIdx = Number(row.getAttribute('data-track-idx') || -1);
    if (!Number.isInteger(toIdx)) return;

    const rect = row.getBoundingClientRect();
    const mid = rect.top + (rect.height / 2);
    const after = (ev.clientY > mid);
    dragOverTrackIdx = toIdx;
    dragInsertAfter = after;
    row.classList.add(after ? 'drop-after' : 'drop-before');
  });

  resultsEl?.addEventListener('dragend', () => {
    clearDragIndicators();
    resultsEl?.querySelectorAll('tr.dragging').forEach((r) => r.classList.remove('dragging'));
  });

  resultsEl?.addEventListener('drop', (ev) => {
    const row = ev.target instanceof Element ? ev.target.closest('tr[data-track-idx]') : null;
    if (!row) return;
    ev.preventDefault();
    const baseIdx = Number(row.getAttribute('data-track-idx') || -1);
    const fromIdx = dragTrackIdx;
    const toIdx = Number.isInteger(dragOverTrackIdx) && dragOverTrackIdx >= 0 ? dragOverTrackIdx : baseIdx;
    const after = !!dragInsertAfter;

    dragTrackIdx = -1;
    dragOverTrackIdx = -1;
    dragInsertAfter = false;
    clearDragIndicators();
    resultsEl?.querySelectorAll('tr.dragging').forEach((r) => r.classList.remove('dragging'));

    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;
    let insertIdx = toIdx + (after ? 1 : 0);
    if (fromIdx < insertIdx) insertIdx -= 1;
    moveTrack(fromIdx, Math.max(0, Math.min(currentTracks.length - 1, insertIdx)));
  });

  // shared playlist controls are global (below cover preview)

  // Filters auto-preview ONLY if we are not currently showing a vibe list
  const maybePreview = () => {
    syncCropUi();
    renderFiltersSummary();
    if (currentListSource === 'vibe' || currentListSource === 'existing') return;
    schedulePreview(300);
  };

  ['genres', 'artists', 'albums', 'excludeGenres', 'minRating', 'maxTracks', 'shuffle', 'apiBase', 'key'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (id === 'apiBase') {
        syncVibeAvailability();
        loadExistingPlaylists();
      }
      if (id === 'key') loadExistingPlaylists();
      if (id === 'maxTracks') localStorage.setItem(MAX_TRACKS_STORAGE, String(getMaxTracks()));
      if (!['apiBase','key'].includes(id)) activateBuilder('filters');
      if (id === 'shuffle') { renderFiltersSummary(); return; }
      maybePreview();
    });
    if (el.tagName === 'INPUT') {
      el.addEventListener('input', () => {
        if (id === 'apiBase') {
          syncVibeAvailability();
          loadExistingPlaylists();
        }
        if (id === 'key') loadExistingPlaylists();
        if (id === 'maxTracks') localStorage.setItem(MAX_TRACKS_STORAGE, String(getMaxTracks()));
        if (!['apiBase','key'].includes(id)) activateBuilder('filters');
        maybePreview();
      });
    }
  });
}

// ---- Init ----
try {
  if ($('apiBase') && !$('apiBase').value.trim()) $('apiBase').value = defaultApiBase();
  const savedMax = Number(localStorage.getItem(MAX_TRACKS_STORAGE) || '');
  if ($('maxTracks') && Number.isFinite(savedMax) && savedMax > 0) $('maxTracks').value = String(savedMax);

  clearResults();
  renderPlaylistThumbStrip([]);
  setCount('No list yet.');
  setStatus('');
  showPlaylistHint('');
  renderPlaylistSuggestion();
  if (coverImgEl && !coverImgEl.src) {
    coverImgEl.src = moodeDefaultCoverUrl();
    coverImgEl.onerror = () => {
      coverImgEl.onerror = null;
      coverImgEl.src = `http://${moodeHost}/images/default-album-cover.png`;
    };
  }

  // Keep cover/collage card hidden on initial page load.
  // It becomes visible when user invokes preview/build actions.
  if (coverCardEl) coverCardEl.style.display = 'none';

  syncCropUi();
  syncCropVibeUi();
  syncCropPodcastUi();
  syncCropExistingUi();
  syncRatingsUi();
  syncPodcastSectionVisibility();
  syncSavePlaylistButton();
  updatePlaylistUi();
  if (sendConfirmEl) sendConfirmEl.textContent = '';
  renderFiltersSummary();

  // Ensure the button starts hidden/disabled until a vibe build begins
  setCancelButtonMode('none');

  initTheme();
  wireEvents();
  loadRuntimeMeta().finally(() => {
    loadOptions();
    loadExistingPlaylists();
    syncVibeAvailability();
    loadCurrentQueueCard().catch((e) => {
      setStatus(`Error loading current queue: ${esc(e?.message || e)}`);
    });
  });
} catch (e) {
  setStatus(`JS init error: ${esc(e?.message || e)}`);
  console.error(e);
}
})();