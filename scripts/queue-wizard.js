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

  const radioSectionEl = $('radioSection');
  const radioGenresEl = $('radioGenres');
  const radioFavoritesPresetEl = $('radioFavoritesPreset');
  const radioBuildBtn = $('radioBuild');
  const sendRadioBtn = $('sendRadioToMoode');
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
  const filterQuickSearchEl = $('filterQuickSearch');
  const filterQuickSearchResultsEl = $('filterQuickSearchResults');

  const savePlaylistBtn = $('savePlaylistBtn');
  const playlistNameEl = $('playlistName');
  const existingPlaylistsEl = $('existingPlaylists');
  const existingPlaylistThumbEl = $('existingPlaylistThumb');
  const existingPlaylistPickerEl = $('existingPlaylistPicker');
  const existingPlaylistToggleEl = $('existingPlaylistToggle');
  const existingPlaylistLabelEl = $('existingPlaylistLabel');
  const existingPlaylistMenuEl = $('existingPlaylistMenu');
  const existingPlaylistCarouselEl = $('existingPlaylistCarousel');
  const loadExistingPlaylistBtn = $('loadExistingPlaylistBtn');
  const sendExistingBtn = $('sendExistingToMoode');
  const savePlaylistNowBtn = $('savePlaylistNowBtn');
  const refreshCollagePreviewBtn = $('refreshCollagePreviewBtn');

  const cropVibeEl = $('cropVibe');
  const cropPodcastEl = $('cropPodcast');

  const playlistHintEl = $('playlistHint');
  const queuePlaybackAreaEl = $('queuePlaybackArea');
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
  let savePlaylistEnabled = true;
  let ratingsEnabled = true;
  let podcastsEnabled = true;
  let vibeEnabled = true;
  let activeBuilder = '';
  let podcastShowByRss = new Map();

  // Persist the current list (vibe OR filters)
  let currentListSource = 'none'; // 'none' | 'filters' | 'vibe' | 'radio' | 'podcast' | 'queue'
  let currentTracks = [];         // array of {artist,title,album,genre,file,...}
  let currentFiles = [];          // array of file paths

  // Prevent repeated collage preview for the same inputs
  let lastCollageSig = '';
  let collageInputTimer = null;
  let collageSuppressedUntil = 0;
  let lastPreviewDataBase64 = '';
  let lastPreviewMimeType = 'image/jpeg';
  let lastPreviewSig = '';
  let dragTrackIdx = -1;
  let dragOverTrackIdx = -1;
  let dragInsertAfter = false;
  let podcastBuildTimer = null;
  let listOrderShuffled = false;
  let queuePlayPauseMode = 'play';
  let filterQuickIndex = [];
  let selectedExistingPlaylists = new Set();
  let existingCarouselSavedScrollLeft = 0;
  let existingEditLockName = '';

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
  // Keep cards mounted/visible to avoid large layout reflows causing scroll jumps.
  const showFilter = true;
  const showVibe = vibeEnabled;
  const showRadio = true;
  const showPodcast = podcastsEnabled;
  if (filterSectionEl) filterSectionEl.classList.toggle('hidden', !showFilter);
  if (vibeSectionEl) vibeSectionEl.classList.toggle('hidden', !showVibe);
  if (radioSectionEl) radioSectionEl.classList.toggle('hidden', !showRadio);
  if (podcastSectionEl) podcastSectionEl.classList.toggle('hidden', !showPodcast);
  const showVibeDisabledNote = !vibeEnabled;
  if (vibeDisabledNoteEl) vibeDisabledNoteEl.classList.toggle('hidden', !showVibeDisabledNote);
}

function activateBuilder(name) {
  const v = String(name || '').trim();
  if (!v || activeBuilder === v) return;
  activeBuilder = v;
  applyBuilderVisibility();
}

function suppressCollageForUi(ms = 1200) {
  collageSuppressedUntil = Date.now() + Number(ms || 1200);
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

  function playlistCoverSafeName(name = '') {
    return String(name || '').trim().replace(/[^A-Za-z0-9 _.\-]/g, '').trim().replace(/\s+/g, '_');
  }

  function playlistCoverUrl(name = '', useSafe = false) {
    const raw = String(name || '').trim();
    const n = useSafe ? playlistCoverSafeName(raw) : raw;
    return `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(n)}.jpg`;
  }

  function setImgPlaylistCoverFallback(imgEl, name = '', bust = false) {
    const baseExact = playlistCoverUrl(name, false);
    const baseSafe = playlistCoverUrl(name, true);
    const q = bust ? `?t=${Date.now()}` : '';
    imgEl.dataset.altSrc = `${baseSafe}${q}`;
    imgEl.dataset.altTried = '0';
    imgEl.src = `${baseExact}${q}`;
    imgEl.onerror = () => {
      if (imgEl.dataset.altTried !== '1' && imgEl.dataset.altSrc) {
        imgEl.dataset.altTried = '1';
        imgEl.src = imgEl.dataset.altSrc;
        return;
      }
      imgEl.onerror = null;
      imgEl.src = moodeDefaultCoverUrl();
    };
  }

  function applyTheme(theme = 'dark') {
    const t = String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', t === 'light');
    document.documentElement.classList.toggle('theme-light', t === 'light');
    if (t === 'light') {
      document.documentElement.style.background = '#8e79b6';
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
    setImgPlaylistCoverFallback(existingPlaylistThumbEl, n, true);
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
      if (alexaHintEl) alexaHintEl.textContent = !axEnabled ? 'disabled' : (axDomain ? 'moode.••••••••.com' : 'missing domain');
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
  const VIBE_MAX_TRACKS_STORAGE = 'nowplaying.queuewizard.vibeMaxTracks';
  function getMaxTracks() {
    const n = Number($('maxTracks')?.value || 25);
    return Number.isFinite(n) ? n : 25;
  }
  function getVibeMaxTracks() {
    const n = Number($('vibeMaxTracks')?.value || getMaxTracks());
    return Number.isFinite(n) ? n : getMaxTracks();
  }

  function getMinRating() {
    return ratingsEnabled ? Number($('minRating')?.value || 0) : 0;
  }

  function getMinRatingVibe() {
    return ratingsEnabled ? Number($('minRatingVibe')?.value || 0) : 0;
  }

  function hasExistingPlaylistSelected() {
    return selectedExistingListNames().length > 0;
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

  function getModeRadio() {
    return document.querySelector('input[name="modeRadio"]:checked')?.value || 'replace';
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

  function syncCropRadioUi() {
    const mode = getModeRadio();
    const cropRadioEl = $('cropRadio');
    if (!cropRadioEl) return;
    cropRadioEl.disabled = mode !== 'replace';
    if (mode !== 'replace') cropRadioEl.checked = false;
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
    if (radioBuildBtn) radioBuildBtn.disabled = disable;
    if (sendRadioBtn) sendRadioBtn.disabled = disable || currentListSource !== 'radio' || currentFiles.length === 0;
    if (podcastBuildBtn) podcastBuildBtn.disabled = disable;
    if (sendPodcastBtn) sendPodcastBtn.disabled = disable || currentListSource !== 'podcast' || currentFiles.length === 0;
    if (sendExistingBtn) sendExistingBtn.disabled = disable || currentListSource !== 'existing' || currentFiles.length === 0;

    [
      'apiBase', 'key', 'maxTracks', 'minRating',
      'genres', 'artists', 'albums', 'excludeGenres',
      'shuffle', 'crop', 'cropVibe', 'cropPodcast', 'minRatingVibe',
      'radioGenres', 'radioFavoritesPreset', 'radioFavoritesOnly', 'radioHqOnly', 'radioMaxStations', 'cropRadio',
      'podcastShows', 'podcastDateFrom', 'podcastDateTo', 'podcastMaxPerShow', 'podcastDownloadedOnly', 'podcastNewestFirst',
      'playlistName', 'refreshCollagePreviewBtn',
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = disable;
    });

    document.querySelectorAll('input[name="mode"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modeVibe"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modePodcast"]').forEach((el) => { el.disabled = disable; });
    document.querySelectorAll('input[name="modeRadio"]').forEach((el) => { el.disabled = disable; });
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
    if (queuePlaybackAreaEl) queuePlaybackAreaEl.innerHTML = '';
    if (!resultsEl) return;
    resultsEl.style.display = '';
    const list = Array.isArray(tracks) ? tracks.slice(0, MAX_RENDER_ROWS) : [];
    if (!list.length) {
      resultsEl.innerHTML = '<div class="muted">Queue is empty.</div>';
      return;
    }

    const apiBase = getApiBase();
    resultsEl.innerHTML = list.map((x, idx) => {
      const file = String(x.file || '');
      const thumbSrc = x.thumbUrl
        ? (String(x.thumbUrl).startsWith('http') ? String(x.thumbUrl) : `${apiBase}${x.thumbUrl}`)
        : (file ? `${apiBase}/art/track_640.jpg?file=${encodeURIComponent(file)}` : '');
      const thumb = thumbSrc
        ? `<img src="${thumbSrc}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #2a3a58;background:#111;" />`
        : '<div style="width:36px;height:36px"></div>';
      const stars = isPodcastLike(x) ? '' : starsHtml(file, Number(x.rating || 0));
      const starsRow = stars ? `<div style="margin-top:2px;">${stars}</div>` : '';
      const isStream = String(file || '').includes('://');
      const favBtn = isStream
        ? `<button type="button" data-queue-fav-file="${encodeURIComponent(file)}" data-queue-fav-state="${x.isFavoriteStation ? '1' : '0'}" title="${x.isFavoriteStation ? 'Unfavorite station' : 'Favorite station'}" style="margin-left:6px;border:0;background:transparent;cursor:pointer;font-size:15px;line-height:1;color:${x.isFavoriteStation ? '#ef4444' : '#7f8fae'}">♥</button>`
        : '';
      const rowClass = `queueRow ${idx % 2 === 0 ? 'queueRowEven' : 'queueRowOdd'}`;
      return `<div class="${rowClass}" data-track-idx="${idx}">${thumb}<div style="min-width:0;flex:1 1 auto;"><div><b>${idx + 1}</b>. ${esc(String(x.artist || ''))}${favBtn}</div><div class="muted">${esc(String(x.title || ''))} ${x.album ? `• ${esc(String(x.album || ''))}` : ''}</div>${starsRow}</div><button type="button" data-remove-track="${idx}" style="margin-left:auto;">Remove</button></div>`;
    }).join('');
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
    const raw = String(file || '');
    if (raw.includes('://')) return '';
    const f = encodeURIComponent(raw);
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '<div style="display:flex;gap:2px;align-items:center;">';
    for (let i = 1; i <= 5; i += 1) {
      const on = i <= r;
      out += `<button type="button" class="queueRateStar ${on?'on':'off'}" data-queue-rate-file="${f}" data-queue-rate-val="${i}" title="Rate ${i} star${i>1?'s':''}" style="padding:0 2px;border:0;background:transparent;font-size:15px;line-height:1;cursor:pointer;">★</button>`;
    }
    out += '</div>';
    return out;
  }

  function queueControlIcon(name = '') {
    const n = String(name || '').toLowerCase();
    if (n === 'play') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    if (n === 'pause') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
    if (n === 'prev') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3 6 9-6v12z"/></svg>';
    if (n === 'next') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM7 18V6l9 6z"/></svg>';
    if (n === 'repeat') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H6a3 3 0 0 0-3 3v3h2V8a1 1 0 0 1 1-1zm10 10H7v-3l-4 4 4 4v-3h11a3 3 0 0 0 3-3v-3h-2v2a1 1 0 0 1-1 1z"/></svg>';
    if (n === 'shuffle') return '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M24.414,16.586L30.828,23l-6.414,6.414l-2.828-2.828L23.172,25H22c-3.924,0-6.334-2.289-8.173-4.747c0.987-1.097,1.799-2.285,2.516-3.36C18.109,19.46,19.521,21,22,21h1.172l-1.586-1.586L24.414,16.586z M22,11h1.172l-1.586,1.586l2.828,2.828L30.828,9l-6.414-6.414l-2.828,2.828L23.172,7H22c-5.07,0-7.617,3.82-9.664,6.891C10.224,17.059,8.788,19,6,19H2v4h4c5.07,0,7.617-3.82,9.664-6.891C17.776,12.941,19.212,11,22,11z M10.212,15.191c0.399-0.539,1.957-2.848,2.322-3.365C10.917,10.216,8.86,9,6,9H2v4h4C7.779,13,9.007,13.797,10.212,15.191z"/></svg>';
    // reload icon intentionally removed from queue controls.
    return '';
  }

  function renderQueueCard(items, randomOn = null, repeatOn = null) {
    if (!resultsEl) return;
    resultsEl.style.display = '';
    const apiBase = getApiBase();
    const list = Array.isArray(items) ? items.slice(0, 120) : [];
    // Controls + mini now-playing are now rendered in hero transport.
    if (queuePlaybackAreaEl) queuePlaybackAreaEl.innerHTML = '';
    if (!list.length) {
      resultsEl.innerHTML = `<div class="muted">Queue is empty.</div>`;
      return;
    }
    resultsEl.innerHTML = list.map((x, idx) => {
      const thumbSrc = x.thumbUrl ? (String(x.thumbUrl).startsWith('http') ? String(x.thumbUrl) : `${apiBase}${x.thumbUrl}`) : '';
      const thumb = thumbSrc
        ? `<img src="${thumbSrc}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #2a3a58;background:#111;" />`
        : '<div style="width:36px;height:36px"></div>';
      const head = !!x.isHead;
      const isStream = !!x.isStream || String(x.file || '').includes('://');
      const pos = Number(x.position || 0);
      const file = String(x.file || '');
      const stars = isPodcastLike(x) ? '' : starsHtml(file, Number(x.rating || 0));
      const starsRow = stars ? `<div style="margin-top:2px;">${stars}</div>` : '';
      const favBtn = isStream
        ? `<button type="button" data-queue-fav-file="${encodeURIComponent(file)}" data-queue-fav-state="${x.isFavoriteStation ? '1' : '0'}" title="${x.isFavoriteStation ? 'Unfavorite station' : 'Favorite station'}" style="margin-left:6px;border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;color:${x.isFavoriteStation ? '#ef4444' : '#7f8fae'}">♥</button>`
        : '';
      const rowClass = `queueRow ${idx % 2 === 0 ? 'queueRowEven' : 'queueRowOdd'} ${head ? 'queueRowHead' : ''}`;

      const stationName = String(x.stationName || x.album || '').trim() || 'Radio Stream';
      const stationGenre = String(x.stationGenre || '').trim();
      const displayArtist = isStream
        ? stationName
        : String(x.artist || '');
      const displayTitle = isStream
        ? String(x.title || '').trim()
        : String(x.title || '');
      const detailLine = isStream
        ? ((head && displayTitle)
            ? `${esc(displayTitle)}${stationGenre ? ` • ${esc(stationGenre)}` : ''}`
            : (stationGenre ? esc(stationGenre) : ''))
        : (displayTitle ? `${esc(displayTitle)} ${x.album ? `• ${esc(String(x.album || ''))}` : ''}` : '');

      const moveBtns = `<div style="display:flex;gap:4px;margin-left:auto;"><button type="button" data-queue-move-pos="${pos}" data-queue-move-dir="up" title="Move up">↑</button><button type="button" data-queue-move-pos="${pos}" data-queue-move-dir="down" title="Move down">↓</button><button type="button" data-queue-remove-pos="${pos}" title="Remove from queue">Remove</button></div>`;
      return `<div class="${rowClass}" data-queue-play-pos="${pos}" style="cursor:pointer;">${thumb}<div style="min-width:0;flex:1 1 auto;"><div><b>${String(pos||0)}</b>. ${head?'▶️ ':''}${esc(displayArtist)}${favBtn}</div><div class="muted">${detailLine}</div>${starsRow}</div>${moveBtns}</div>`;
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
      : (currentListSource === 'podcast' ? 'Podcast list'
      : (currentListSource === 'radio' ? 'Radio list' : 'List'))));

    setCount(`${label} ready: ${currentTracks.length.toLocaleString()} track(s).`);
    if (sendVibeBtn) sendVibeBtn.disabled = !(currentListSource === 'vibe' && currentFiles.length > 0);
    if (sendRadioBtn) sendRadioBtn.disabled = !(currentListSource === 'radio' && currentFiles.length > 0);
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
    if (currentListSource === 'filters' || currentListSource === 'vibe' || currentListSource === 'podcast' || currentListSource === 'radio') {
      activateBuilder(currentListSource);
    }
    currentTracks = Array.isArray(tracks) ? tracks.slice() : [];
    listOrderShuffled = false;

    renderTracksToTable(currentTracks);
    renderPlaylistThumbStrip(currentTracks);
    if (queuePlaybackAreaEl) queuePlaybackAreaEl.style.display = currentTracks.length ? '' : 'none';
    if (coverCardEl) coverCardEl.style.display = (currentListSource === 'podcast' || currentListSource === 'radio') ? 'none' : '';

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
    coverStatusEl.textContent = note || 'Cover preview ready.';
  }

async function forceReloadCoverUntilItLoads({ name, note = '', tries = 10 }) {
  if (!coverCardEl || !coverImgEl || !coverStatusEl) return false;

  const rawName = String(name || '').trim();
  const safeName = rawName.replace(/[^A-Za-z0-9 _.\-]/g, '').trim().replace(/\s+/g, '_');
  const baseUrls = Array.from(new Set([
    `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(rawName)}.jpg`,
    `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(safeName)}.jpg`,
  ])).filter(Boolean);

  coverCardEl.style.display = '';
  coverStatusEl.textContent = note || `Loading cover for “${rawName}”…`;

  const delays = [150, 250, 400, 650, 900, 1200, 1500, 1700, 2000, 2200, 2600, 3000];

  for (let i = 0; i < tries; i++) {
    for (const baseUrl of baseUrls) {
      const url = `${baseUrl}?t=${Date.now()}&try=${i + 1}`;

      const loaded = await new Promise((resolve) => {
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
        coverImgEl.src = url;
        coverStatusEl.textContent = note || `Cover loaded for “${rawName}”.`;
        return true;
      }
    }

    coverStatusEl.textContent = `Cover not visible yet… retry ${i + 1}/${tries}`;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, delays[Math.min(i, delays.length - 1)]));
  }

  coverStatusEl.textContent = `Cover still not showing for “${rawName}”.`;
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

  function rebuildFilterQuickIndex() {
    const pack = (id, type) => Array.from($(id)?.options || []).map((o) => ({
      type,
      value: String(o.value || ''),
      label: String(o.textContent || o.label || o.value || '').trim(),
      lower: String(o.textContent || o.label || o.value || '').trim().toLowerCase(),
    })).filter((x) => x.value && x.label);

    filterQuickIndex = [
      ...pack('genres', 'Genre'),
      ...pack('artists', 'Artist'),
      ...pack('albums', 'Album'),
      ...pack('excludeGenres', 'Exclude genre'),
      ...pack('existingPlaylists', 'Playlist').filter((x) => !/^\(select existing playlist\)$/i.test(String(x.label || '').trim())),
    ];
  }

  function renderFilterQuickResults(qRaw = '') {
    if (!filterQuickSearchResultsEl) return;
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) {
      filterQuickSearchResultsEl.style.display = 'none';
      filterQuickSearchResultsEl.innerHTML = '';
      return;
    }

    const scored = filterQuickIndex
      .map((x) => {
        const i = x.lower.indexOf(q);
        if (i < 0) return null;
        const score = (i === 0 ? 0 : 10) + i;
        return { ...x, score };
      })
      .filter(Boolean)
      .slice(0, 120);

    if (!scored.length) {
      filterQuickSearchResultsEl.style.display = 'block';
      filterQuickSearchResultsEl.innerHTML = '<div class="muted" style="padding:6px 8px;">No matches.</div>';
      return;
    }

    const typeOrder = ['Genre', 'Artist', 'Album', 'Playlist', 'Exclude genre'];
    const typeColor = {
      'Genre': 'rgba(56,189,248,.20)',
      'Artist': 'rgba(34,197,94,.20)',
      'Album': 'rgba(168,85,247,.22)',
      'Playlist': 'rgba(244,114,182,.22)',
      'Exclude genre': 'rgba(245,158,11,.20)',
    };

    const byType = new Map();
    for (const t of typeOrder) byType.set(t, []);
    for (const row of scored) {
      if (!byType.has(row.type)) byType.set(row.type, []);
      byType.get(row.type).push(row);
    }

    const chunks = [];
    for (const t of typeOrder) {
      const rows = (byType.get(t) || []).sort((a, b) => a.score - b.score).slice(0, 12);
      if (!rows.length) continue;
      const pillBg = typeColor[t] || 'rgba(148,163,184,.2)';
      chunks.push(`<div style="padding:4px 6px 6px;"><div style="font-size:12px;font-weight:700;color:#c7d8ff;margin:2px 0 6px;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${pillBg};border:1px solid #2a3a58;">${esc(t)}</span></div>`
        + rows.map((x) => {
          const canMultiAdd = x.type !== 'Playlist';
          const selected = isQuickValueSelected(x.type, x.value);
          return `<div style="display:flex;align-items:center;gap:6px;">`
            + `<button type="button" data-quick-type="${esc(x.type)}" data-quick-value="${esc(x.value)}" style="flex:1 1 auto;min-width:0;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:0;background:${selected ? 'rgba(34,197,94,.10)' : 'transparent'};color:#e7eefc;text-align:left;border-radius:8px;cursor:pointer;">`
            + `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(x.label)}</span>`
            + `<span style="font-size:11px;white-space:nowrap;opacity:.88;padding:1px 6px;border-radius:999px;background:${pillBg};">${esc(x.type)}</span>`
            + `</button>`
            + (canMultiAdd ? `<button type="button" data-quick-add="1" data-quick-type="${esc(x.type)}" data-quick-value="${esc(x.value)}" title="Add and keep searching" style="flex:0 0 auto;width:30px;height:30px;border-radius:8px;border:1px solid ${selected ? 'rgba(34,197,94,.7)' : '#2a3a58'};background:${selected ? 'rgba(34,197,94,.22)' : pillBg};color:${selected ? '#22c55e' : '#e7eefc'};cursor:pointer;font-weight:700;line-height:1;">${selected ? '✓' : '+'}</button>` : '')
            + `</div>`;
        }).join('')
        + `</div>`);
    }

    filterQuickSearchResultsEl.innerHTML = chunks.join('');
    filterQuickSearchResultsEl.style.display = 'block';
  }

  function isQuickValueSelected(type, value) {
    const t = String(type || '');
    const v = String(value || '');
    const map = {
      'Genre': 'genres',
      'Artist': 'artists',
      'Album': 'albums',
      'Exclude genre': 'excludeGenres',
      'Playlist': 'existingPlaylists',
    };
    const id = map[t];
    const sel = id ? $(id) : null;
    if (!sel) return false;
    if (t === 'Playlist') return String(sel.value || '') === v;
    return Array.from(sel.selectedOptions || []).some((o) => String(o.value || '') === v);
  }

  function applyQuickPick(type, value) {
    const t = String(type || '');

    if (t === 'Playlist') {
      const sel = $('existingPlaylists');
      if (!sel) return;
      sel.value = String(value || '');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      try { activateBuilder('existing'); } catch {}
      try { previewExistingPlaylistSelection(); } catch {}
      return;
    }

    const map = {
      'Genre': 'genres',
      'Artist': 'artists',
      'Album': 'albums',
      'Exclude genre': 'excludeGenres',
    };
    const id = map[t];
    const sel = id ? $(id) : null;
    if (!sel) return;
    let matched = false;
    Array.from(sel.options || []).forEach((o) => {
      if (String(o.value || '') === String(value || '')) {
        o.selected = true;
        try { o.scrollIntoView({ block: 'nearest' }); } catch {}
        matched = true;
      }
    });
    if (matched) {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
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

  function selectedExistingListNames() {
    const fromSet = Array.from(selectedExistingPlaylists || []).map((x) => String(x || '').trim()).filter(Boolean);
    if (fromSet.length) return fromSet;
    const single = String(existingPlaylistsEl?.value || '').trim();
    return single ? [single] : [];
  }

  function renderExistingPlaylistMenu(names = []) {
    if (!existingPlaylistMenuEl || !existingPlaylistLabelEl) return;
    const selected = String(existingPlaylistsEl?.value || '').trim();
    const multi = selectedExistingListNames();
    existingPlaylistLabelEl.textContent = multi.length > 1 ? `${multi.length} selected` : (selected || '(select existing playlist)');

    const rows = [`<button type="button" data-existing-playlist="" style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 10px;border:0;background:transparent;color:#e7eefc;text-align:left;border-radius:10px;font-size:15px;line-height:1.25;">(select existing playlist)</button>`];
    for (const n0 of names || []) {
      const n = String(n0 || '').trim();
      if (!n) continue;
      const src = playlistCoverUrl(n, false);
      const srcSafe = playlistCoverUrl(n, true);
      rows.push(
        `<button type="button" data-existing-playlist="${esc(n)}" style="width:100%;display:flex;align-items:center;gap:12px;padding:10px 10px;border:0;background:${selected===n?'rgba(127,211,167,.18)':'transparent'};color:#e7eefc;text-align:left;border-radius:10px;font-size:15px;line-height:1.25;">` +
        `<img src="${src}" data-alt-src="${srcSafe}" data-alt-tried="0" onerror="if(this.dataset.altTried!=='1' && this.dataset.altSrc){this.dataset.altTried='1';this.src=this.dataset.altSrc;return;} this.onerror=null;this.src='${moodeDefaultCoverUrl()}'" style="width:40px;height:40px;object-fit:cover;border-radius:10px;border:1px solid #334;background:#0a1222;flex:0 0 auto;" />` +
        `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n)}</span>` +
        `</button>`
      );
    }
    existingPlaylistMenuEl.innerHTML = rows.join('');
  }

  function renderExistingPlaylistCarousel(names = []) {
    if (!existingPlaylistCarouselEl) return;
    const prevScrollLeft = Number(existingPlaylistCarouselEl.scrollLeft || 0);
    const keepScrollLeft = Math.max(prevScrollLeft, Number(existingCarouselSavedScrollLeft || 0));
    const selected = new Set(selectedExistingListNames());
    const rows = [];
    for (const n0 of names || []) {
      const n = String(n0 || '').trim();
      if (!n) continue;
      const src = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(n)}.jpg`;
      const srcAlt = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(String(n).replace(/\s+/g, '_'))}.jpg`;
      const on = selected.has(n);
      const lockedOut = !!existingEditLockName && existingEditLockName !== n;
      rows.push(
        `<div role="button" tabindex="0" data-existing-carousel="${esc(n)}" title="${esc(n)}" style="position:relative;width:132px;max-width:100%;justify-self:start;border:1px solid ${on ? 'rgba(34,197,94,.8)' : '#334'};background:${on ? 'rgba(34,197,94,.14)' : '#0a1222'};border-radius:14px;padding:8px;cursor:${lockedOut ? 'not-allowed' : 'pointer'};opacity:${lockedOut ? '.42' : '1'};pointer-events:${lockedOut ? 'none' : 'auto'};">`
        + `${on ? '<span style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:999px;background:rgba(34,197,94,.95);color:#052e16;font-weight:900;font-size:14px;line-height:22px;text-align:center;">✓</span>' : ''}`
        + `<img src="${src}" data-alt-src="${srcAlt}" data-alt-tried="0" onerror="if(this.dataset.altTried!=='1' && this.dataset.altSrc){this.dataset.altTried='1';this.src=this.dataset.altSrc;return;} this.onerror=null;this.src='${moodeDefaultCoverUrl()}'" style="width:116px;height:116px;object-fit:cover;border-radius:10px;border:1px solid #334;background:#071021;display:block;margin:0 auto 8px;" />`
        + `<div style="font-size:12px;line-height:1.25;max-width:116px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 auto 6px;color:#dbe7ff;text-align:center;">${esc(n)}</div>`
        + `<div style="display:flex;gap:6px;justify-content:center;">`
        + `<button type="button" data-existing-action="edit" data-existing-name="${esc(n)}" title="Edit playlist" style="padding:3px 7px;border-radius:7px;border:1px solid #3a4a66;background:#0c1830;color:#cde3ff;font-size:11px;">Edit</button>`
        + `<button type="button" data-existing-action="delete" data-existing-name="${esc(n)}" title="Delete playlist" style="padding:3px 7px;border-radius:7px;border:1px solid #5a3140;background:#1b0f18;color:#ffc9d5;font-size:11px;">Delete</button>`
        + `</div>`
        + `</div>`
      );
    }
    existingPlaylistCarouselEl.innerHTML = rows.join('');
    try {
      requestAnimationFrame(() => {
        existingPlaylistCarouselEl.scrollLeft = keepScrollLeft;
        existingCarouselSavedScrollLeft = keepScrollLeft;
        setTimeout(() => { try { existingPlaylistCarouselEl.scrollLeft = keepScrollLeft; } catch {} }, 60);
        setTimeout(() => { try { existingPlaylistCarouselEl.scrollLeft = keepScrollLeft; } catch {} }, 180);
      });
    } catch {}
  }

  function setExistingPlaylistOptions(names = [], selected = '') {
    if (!existingPlaylistsEl) return;
    const selectedName = String(selected || '').trim();
    const nameSet = new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean));
    selectedExistingPlaylists = new Set(Array.from(selectedExistingPlaylists || []).filter((n) => nameSet.has(n)));

    const opts = [{ value: '', label: '(select existing playlist)' }, ...(names || []).map((n) => ({ value: String(n || ''), label: String(n || '') }))];
    existingPlaylistsEl.innerHTML = opts.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');

    if (selectedName && (names || []).includes(selectedName)) {
      existingPlaylistsEl.value = selectedName;
      if (!selectedExistingPlaylists.size) selectedExistingPlaylists.add(selectedName);
    } else if (selectedExistingPlaylists.size) {
      const first = Array.from(selectedExistingPlaylists)[0] || '';
      existingPlaylistsEl.value = first;
    }

    updateExistingPlaylistThumb(existingPlaylistsEl.value || '');
    renderExistingPlaylistMenu(names);
    renderExistingPlaylistCarousel(names);
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
      rebuildFilterQuickIndex();
      existingPlaylistsEl.disabled = false;
      updatePlaylistUi();
    } catch (_) {
      setExistingPlaylistOptions([]);
      rebuildFilterQuickIndex();
      existingPlaylistsEl.disabled = false;
      updatePlaylistUi();
    }
  }

  async function fetchExistingSelectedTracks() {
    const apiBase = getApiBase();
    const key = getKey();
    const names = selectedExistingListNames();
    if (!apiBase || !names.length) return { names: [], tracks: [] };

    const all = [];
    for (const name of names) {
      const r = await fetch(`${apiBase}/config/queue-wizard/playlist-preview?playlist=${encodeURIComponent(name)}`, {
        headers: { 'x-track-key': key },
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(`${name}: ${j?.error || `HTTP ${r.status}`}`);
      const tracks = Array.isArray(j?.tracks) ? j.tracks : [];
      all.push(...tracks);
    }
    return { names, tracks: all };
  }

  async function previewExistingPlaylistSelection() {
    const apiBase = getApiBase();
    const key = getKey();
    const names = selectedExistingListNames();
    if (!apiBase || !names.length) return;

    try {
      activateBuilder('existing');
      if (coverCardEl) coverCardEl.style.display = '';
      const firstName = names[0];
      if (coverStatusEl) coverStatusEl.textContent = names.length > 1
        ? `Playlist covers: ${names.length} selected (showing first).`
        : `Playlist cover: “${firstName}”.`;
      if (coverImgEl) {
        setImgPlaylistCoverFallback(coverImgEl, firstName, true);
      }

      setStatus(`<span class="spin"></span>Loading playlist preview${names.length > 1 ? 's' : ''}…`);
      const out = await fetchExistingSelectedTracks();
      const all = Array.isArray(out?.tracks) ? out.tracks : [];
      setCurrentList('existing', all);
      setStatus(`Loaded ${names.length} playlist(s): ${all.length.toLocaleString()} track(s).`);
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

  async function deleteExistingPlaylist(name) {
    const apiBase = getApiBase();
    const key = getKey();
    const n = String(name || '').trim();
    if (!apiBase || !n) return;
    const ok = confirm(`Delete playlist “${n}”? This cannot be undone.`);
    if (!ok) return;
    try {
      setStatus('<span class="spin"></span>Deleting playlist…');
      const r = await fetch(`${apiBase}/config/queue-wizard/delete-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({ playlist: n }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      selectedExistingPlaylists.delete(n);
      if (String(existingPlaylistsEl?.value || '') === n) existingPlaylistsEl.value = '';
      await loadExistingPlaylists();
      setStatus(`Deleted playlist: ${esc(n)}.`);
    } catch (e) {
      setStatus(`Delete failed: ${esc(e?.message || e)}`);
    }
  }

  async function editExistingPlaylist(name) {
    const n = String(name || '').trim();
    if (!n || !existingPlaylistsEl) return;
    selectedExistingPlaylists = new Set([n]);
    existingPlaylistsEl.value = n;
    await previewExistingPlaylistSelection();

    // Lock carousel to this playlist while editing.
    existingEditLockName = n;

    // Switch into editable queue state and prefill save target to overwrite.
    selectedExistingPlaylists.clear();
    existingPlaylistsEl.value = '';
    savePlaylistEnabled = true;
    if (playlistNameEl) playlistNameEl.value = n;

    const names = Array.from(existingPlaylistsEl.options).map((o) => String(o.value || '')).filter(Boolean);
    renderExistingPlaylistMenu(names);
    renderExistingPlaylistCarousel(names);

    // Make Filter Builder visible so user can add/adjust before saving.
    activateBuilder('filters');
    updatePlaylistUi();
    setStatus(`Editing playlist: ${esc(n)}. Filter Builder is now active. Add tracks, then save to overwrite.`);
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
    // Queue Wizard no longer renders live queue content in this card.
    // Keep only lightweight runtime sync (ratings flag) for queue row controls.
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
    if (queuePlaybackAreaEl) {
      queuePlaybackAreaEl.innerHTML = '';
      queuePlaybackAreaEl.style.display = 'none';
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
      rebuildFilterQuickIndex();

      setStatus('');
      renderFiltersSummary();
      if (podcastsEnabled) await loadPodcastShows().catch(() => {});
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    }
  }

  async function loadRadioOptions() {
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase || !radioGenresEl) return;
    try {
      const r = await fetch(`${apiBase}/config/queue-wizard/radio-options`, { headers: { 'x-track-key': key } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const genres = Array.isArray(j.genres) ? j.genres : [];
      setOptions(radioGenresEl, genres.map((g) => ({ value: String(g), label: String(g) })));
    } catch (e) {
      const fallbackGenres = [
        'Jazz','Rock','Classical','Blues','Country','Pop','Alternative','Ambient','Talk','News','Eclectic'
      ];
      setOptions(radioGenresEl, fallbackGenres.map((g) => ({ value: g, label: g })));
      setStatus(`Radio options load fallback in use (${esc(e?.message || e)}).`);
    }
  }

  async function loadRadioFavorites() {
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase || !radioFavoritesPresetEl) return;
    try {
      const r = await fetch(`${apiBase}/config/queue-wizard/radio-favorites`, { headers: { 'x-track-key': key } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const favs = Array.isArray(j.favorites) ? j.favorites : [];
      const opts = [{ value: '', label: 'All favorites (none selected)' }].concat(
        favs.map((x) => ({ value: String(x.file || ''), label: String(x.stationName || x.file || '') }))
      );
      setOptions(radioFavoritesPresetEl, opts);
      radioFavoritesPresetEl.value = '';
    } catch {
      setOptions(radioFavoritesPresetEl, [{ value: '', label: 'All favorites (none selected)' }]);
    }
  }

  async function buildRadioList() {
    currentListSource = 'radio';
    const apiBase = getApiBase();
    const key = getKey();
    if (!apiBase) return;
    const genres = selectedValues(radioGenresEl || $('radioGenres'));
    const favoritesOnly = !!$('radioFavoritesOnly')?.checked;
    const hqOnly = !!$('radioHqOnly')?.checked;
    const favoriteStations = selectedValues(radioFavoritesPresetEl || $('radioFavoritesPreset'));
    const maxStations = Math.max(1, Math.min(200, Number($('radioMaxStations')?.value || 25)));

    setStatus('<span class="spin"></span>Building radio list…');
    setCount('Building radio list…');
    disableUI(true);
    try {
      const r = await fetch(`${apiBase}/config/queue-wizard/radio-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({ genres, favoritesOnly, hqOnly, favoriteStations, maxStations }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const tracks = Array.isArray(j.tracks) ? j.tracks : [];
      setCurrentList('radio', tracks);
      setStatus(tracks.length ? 'Radio list built. Ready to send.' : 'No radio stations matched your filters.');
      setCount(`Radio list: ${tracks.length.toLocaleString()} station(s).`);
    } catch (e) {
      setStatus(`Radio build failed: ${esc(e?.message || e)}`);
      setCount('Error building radio list.');
    } finally {
      disableUI(false);
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
    currentListSource = 'podcast';

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
    currentListSource = 'filters';

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
  currentListSource = 'vibe';

  const apiBase = getApiBase();
  const key = getKey();
  const targetQueue = getVibeMaxTracks();
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

  function collageCandidateFiles() {
    const seen = new Set();
    const out = [];
    for (const f0 of currentFiles || []) {
      const f = String(f0 || '').trim();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      out.push(f);
      if (out.length >= 240) break;
    }
    return out;
  }

  function computeCollageSig(name = getPlaylistNameRaw(), files = collageCandidateFiles()) {
    const head = (files || []).slice(0, 50).join('|');
    return `${String(name || '')}::${(files || []).length}::${head}`;
  }

  function shouldForceSingleCover(tracks = currentTracks) {
    const arr = Array.isArray(tracks) ? tracks : [];
    const albumKeys = new Set();
    for (const t of arr) {
      const album = String(t?.album || '').trim().toLowerCase();
      const artist = String(t?.artist || '').trim().toLowerCase();
      const key = `${artist}::${album}`;
      if (album || artist) albumKeys.add(key);
      if (albumKeys.size > 1) return false;
    }
    return albumKeys.size <= 1;
  }

async function maybeGenerateCollagePreview(reason = '', opts = {}) {
  if (!coverCardEl || !coverImgEl || !coverStatusEl) return;
  if (sendBusy && !opts.force) return;
  if (!opts.force && Date.now() < collageSuppressedUntil) return;
  if (reason === 'playlist-name-input' || reason === 'playlist-name-focus' || reason === 'playlist-name-blur') return;

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
    const vibePreviewFiles = collageCandidateFiles();
    const sig = `vibe::${vibePreviewFiles.length}::${vibePreviewFiles.slice(0, 80).join('|')}`;
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
          forceSingle: shouldForceSingleCover(currentTracks),
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
      lastPreviewDataBase64 = String(j.dataBase64 || '');
      lastPreviewMimeType = String(j.mimeType || 'image/jpeg');
      lastPreviewSig = sig;

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
  const previewFiles = collageCandidateFiles();
  const sig = `${playlistName || '(preview)'}::${previewFiles.length}::${previewFiles.slice(0, 80).join('|')}`;
  if (!opts.force && sig && sig === lastCollageSig) return;

  if (collageBusy) return;
  collageBusy = true;

  try {
    showPlaylistHint('');
    // Keep progress messaging in the cover card only (avoid duplicate top status line).
    setStatus('');
    coverCardEl.style.display = '';
    coverStatusEl.textContent = 'Generating collage preview…';
    coverImgEl.src = moodeDefaultCoverUrl();

    const payload = {
      tracks: previewFiles,
      forceSingle: shouldForceSingleCover(currentTracks),
      randomize: reason === 'manual-refresh',
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
      lastPreviewDataBase64 = String(j.dataBase64 || '');
      lastPreviewMimeType = String(j.mimeType || 'image/jpeg');
      lastPreviewSig = sig;
    } else if (savePlaylistEnabled && playlistName) {
      await forceReloadCoverUntilItLoads({
        name: playlistName,
        note: `Collage preview generated for “${playlistName}”.`,
        tries: 10,
      });
    }

    // Status handled in-card via coverStatus; avoid duplicate banner text.
  } catch (e) {
    const msg = e?.message || String(e);
    setStatus(`Cover preview error: ${esc(msg)}`);
    refreshCoverPreview(`Cover preview error: ${msg}`);
  } finally {
    collageBusy = false;
  }
}

  function syncBuilderCardVisibility() {
    if (existingSectionEl) existingSectionEl.classList.remove('hidden');
    applyBuilderVisibility();
  }

  function updatePlaylistUi() {
    const existingSelected = hasExistingPlaylistSelected();

    const savePlaylist = savePlaylistEnabled;
    const opts = $('playlistOptions');

    if (savePlaylistBtn) {
      const showBtn = !existingSelected;
      savePlaylistBtn.style.visibility = showBtn ? 'visible' : 'hidden';
      savePlaylistBtn.style.pointerEvents = showBtn ? 'auto' : 'none';
    }
    if (opts) {
      const showOpts = !existingSelected;
      opts.classList.remove('hidden');
      opts.style.display = 'flex';
      opts.style.visibility = showOpts ? 'visible' : 'hidden';
      opts.style.pointerEvents = showOpts ? 'auto' : 'none';
      opts.style.minHeight = '52px';
    }
    if (playlistNameEl) playlistNameEl.disabled = existingSelected;
    if (savePlaylistNowBtn) savePlaylistNowBtn.disabled = existingSelected;
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

  function notifyParentQueueBusy(on, label = '') {
    try {
      window.parent?.postMessage({
        type: 'np-queue-busy',
        busy: !!on,
        label: String(label || ''),
        source: 'queue-wizard',
      }, '*');
    } catch {}
  }

  function syncSavePlaylistButton() {
    if (!savePlaylistBtn) return;
    savePlaylistBtn.textContent = 'Name playlist';
    savePlaylistBtn.style.opacity = savePlaylistEnabled ? '1' : '0.92';
    savePlaylistBtn.style.outline = savePlaylistEnabled ? '2px solid #7fd3a7' : '';
    savePlaylistBtn.setAttribute('aria-pressed', savePlaylistEnabled ? 'true' : 'false');
  }

  // ---- Send current list to moOde ----
  async function doSavePlaylistOnly() {
    if (sendBusy) return;
    sendBusy = true;

    const apiBase = getApiBase();
    const key = getKey();
    const playlistName = getPlaylistNameRaw();
    const filesSnapshot = currentFiles.slice();
    const previewFilesSnapshot = collageCandidateFiles();
    const previewSigSnapshot = computeCollageSig(playlistName, previewFilesSnapshot);
    const previewCoverBase64 = (lastPreviewDataBase64 && lastPreviewSig === previewSigSnapshot)
      ? lastPreviewDataBase64
      : '';

    const p = playlistNameProblems(playlistName);
    if (!p.ok) {
      setStatus(p.msg);
      showPlaylistHint(p.msg);
      sendBusy = false;
      return;
    }
    if (!filesSnapshot.length) {
      setStatus('Build or load a list first.');
      sendBusy = false;
      return;
    }

    let coverToSave = previewCoverBase64;
    if (!coverToSave) {
      const visibleDataUrl = String(coverImgEl?.src || '');
      if (visibleDataUrl.startsWith('data:image/') && lastPreviewDataBase64) {
        coverToSave = lastPreviewDataBase64;
      }
    }
    if (!coverToSave) {
      setStatus('No cover preview data is available yet. Click “Refresh cover preview”, then save.');
      sendBusy = false;
      return;
    }

    const existingNames = Array.from(existingPlaylistsEl?.options || []).map((o) => String(o.value || '').trim()).filter(Boolean);
    const existsAlready = existingNames.some((n) => n.toLowerCase() === String(playlistName || '').trim().toLowerCase());
    if (existsAlready) {
      const okOverwrite = confirm(`Overwrite ${playlistName}?`);
      if (!okOverwrite) { sendBusy = false; return; }
    }

    const prevSaveNowDisplay = savePlaylistNowBtn ? String(savePlaylistNowBtn.style.display || '') : '';
    const prevSaveNowHtml = savePlaylistNowBtn ? String(savePlaylistNowBtn.innerHTML || '') : '';
    const prevNameDisabled = !!playlistNameEl?.disabled;
    if (savePlaylistNowBtn) {
      savePlaylistNowBtn.style.display = '';
      savePlaylistNowBtn.disabled = true;
      savePlaylistNowBtn.innerHTML = '<span class="spin"></span> Saving…';
    }
    if (playlistNameEl) playlistNameEl.disabled = true;

    disableUI(true);
    try {
      setStatus('<span class="spin"></span>Saving playlist + cover to moOde…');
      const r = await fetch(`${apiBase}/config/queue-wizard/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({
          mode: 'append',
          keepNowPlaying: true,
          tracks: filesSnapshot,
          shuffle: false,
          forceRandomOff: false,
          playlistName,
          generateCollage: true,
          previewCoverBase64: coverToSave || undefined,
          previewCoverMimeType: coverToSave ? (lastPreviewMimeType || 'image/jpeg') : undefined,
          saveOnly: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      setStatus(`Saved playlist only: ${esc(playlistName)} (${filesSnapshot.length.toLocaleString()} track(s))${j.collageGenerated ? ' · cover saved' : ''}${j.collageError ? ` · cover error: ${esc(j.collageError)}` : ''}`);
      showSendConfirmation(`✅ Saved playlist “${playlistName}” (no queue playback changes).`);
      existingEditLockName = '';
      await loadExistingPlaylists();

      // Keep just-saved playlist selected and preloaded so Send works immediately.
      selectedExistingPlaylists = new Set([playlistName]);
      if (existingPlaylistsEl) existingPlaylistsEl.value = playlistName;
      const names = Array.from(existingPlaylistsEl?.options || []).map((o) => String(o.value || '')).filter(Boolean);
      renderExistingPlaylistMenu(names);
      renderExistingPlaylistCarousel(names);
      updateExistingPlaylistThumb(playlistName);
      activateBuilder('existing');
      await previewExistingPlaylistSelection();

      if (j.collageGenerated && playlistName) {
        // Do not block post-save actions (like Send) on cover polling.
        forceReloadCoverUntilItLoads({ name: playlistName, note: `Collage generated for “${playlistName}”.`, tries: 10 }).catch(() => {});
      }
    } catch (e) {
      setStatus(`Save failed: ${esc(e?.message || e)}`);
    } finally {
      disableUI(false);
      if (savePlaylistNowBtn) {
        savePlaylistNowBtn.disabled = false;
        savePlaylistNowBtn.innerHTML = prevSaveNowHtml || 'Save Playlist + Cover to moOde';
        savePlaylistNowBtn.style.display = prevSaveNowDisplay;
      }
      if (playlistNameEl) playlistNameEl.disabled = prevNameDisabled;
      sendBusy = false;
    }
  }

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

    if (source === 'radio' && currentListSource !== 'radio') {
      await buildRadioList();
      if (currentListSource !== 'radio' || !currentFiles.length) {
        setStatus('Radio list is empty. Adjust filters and try again.');
        sendBusy = false;
        return;
      }
    }

    if (source === 'existing') {
      try {
        const out = await fetchExistingSelectedTracks();
        const tracks = Array.isArray(out?.tracks) ? out.tracks : [];
        if (tracks.length) setCurrentList('existing', tracks);
      } catch (e) {
        setStatus(`Playlist preview failed: ${esc(e?.message || e)}`);
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
    const isRadioSend = source === 'radio';
    const isExistingSend = source === 'existing';
    const mode = isVibeSend
      ? getModeVibe()
      : (isPodcastSend ? getModePodcast() : (isRadioSend ? getModeRadio() : (isExistingSend ? getModeExisting() : getMode())));
    const keepNowPlaying = isVibeSend
      ? getKeepNowPlayingVibe()
      : (isPodcastSend ? getKeepNowPlayingPodcast() : (isRadioSend ? (!!$('cropRadio')?.checked) : (isExistingSend ? getKeepNowPlayingExisting() : getKeepNowPlaying())));
    const doShuffleFlag = false; // UI shuffle reorders list directly; do not enable MPD random mode.
    const forceRandomOff = listOrderShuffled || (isExistingSend ? getShuffleExisting() : getShuffle());

    const savePlaylist = false; // Sending to moOde should never do playlist-save side effects.
    const playlistName = '';
    const wantsCollage = false;
    const filesSnapshot = currentFiles.slice();
    const previewFilesSnapshot = collageCandidateFiles();
    const previewSigSnapshot = computeCollageSig(playlistName, previewFilesSnapshot);
    const previewCoverBase64 = (wantsCollage && lastPreviewDataBase64 && lastPreviewSig === previewSigSnapshot)
      ? lastPreviewDataBase64
      : '';

    if (savePlaylist) {
      const p = playlistNameProblems(playlistName);
      if (!p.ok) {
        setStatus(p.msg);
        showPlaylistHint(p.msg);
        sendBusy = false;
        return;
      }

      const existingNames = Array.from(existingPlaylistsEl?.options || [])
        .map((o) => String(o.value || '').trim())
        .filter(Boolean);
      const existsAlready = existingNames.some((n) => n.toLowerCase() === String(playlistName || '').trim().toLowerCase());
      if (existsAlready) {
        const okOverwrite = confirm(`Overwrite ${playlistName}?`);
        if (!okOverwrite) {
          sendBusy = false;
          return;
        }
      }
    }

    if (mode === 'replace' && !keepNowPlaying) {
      const ok = confirm('Replace queue by CLEARING everything and loading this list?');
      if (!ok) { sendBusy = false; return; }
    }

    if (wantsCollage && playlistName && filesSnapshot.length) {
      setStatus('<span class="spin"></span>Locking collage for save…');
      try {
        await maybeGenerateCollagePreview('save-lock', { force: true });
      } catch (e) {
        setStatus(`Collage lock warning: ${esc(e?.message || e)} · continuing save…`);
      }
    }

    const prevSaveNowDisplay = savePlaylistNowBtn ? String(savePlaylistNowBtn.style.display || '') : '';
    if (savePlaylistNowBtn) savePlaylistNowBtn.style.display = 'none';
    if (queuePlaybackAreaEl) queuePlaybackAreaEl.style.display = 'none';

    disableUI(true);
    notifyParentQueueBusy(true, 'Updating queue…');
    try {
      setStatus('<span class="spin"></span>Sending list to moOde…');

      const r = await fetch(`${apiBase}/config/queue-wizard/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({
          mode,
          keepNowPlaying,
          tracks: filesSnapshot,
          trackMeta: (source === 'radio')
            ? currentTracks.map((t) => ({
              file: String(t?.file || ''),
              stationName: String(t?.stationName || t?.artist || ''),
              genre: String(t?.genre || t?.stationGenre || ''),
            }))
            : undefined,
          shuffle: doShuffleFlag,
          forceRandomOff,
          playlistName,
          generateCollage: wantsCollage,
          previewCoverBase64: previewCoverBase64 || undefined,
          previewCoverMimeType: previewCoverBase64 ? (lastPreviewMimeType || 'image/jpeg') : undefined,
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

      // After sending from Existing Playlists, clear highlighted selection state.
      if (isExistingSend) {
        selectedExistingPlaylists.clear();
        if (existingPlaylistsEl) existingPlaylistsEl.value = '';
        const names = Array.from(existingPlaylistsEl?.options || []).map((o) => String(o.value || '')).filter(Boolean);
        renderExistingPlaylistCarousel(names);
        updateExistingPlaylistThumb('');
      }

      if (j.collageGenerated && playlistName) {
        await forceReloadCoverUntilItLoads({
          name: playlistName,
          note: `Collage generated for “${playlistName}”.`,
          tries: 10,
        });
      }

      // Keep current builder list visible after send.
    } catch (e) {
      setStatus(`Error: ${esc(e?.message || e)}`);
    } finally {
      disableUI(false);
      notifyParentQueueBusy(false);
      if (savePlaylistNowBtn) savePlaylistNowBtn.style.display = prevSaveNowDisplay;
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

  sendExistingBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    activateBuilder('existing');
    try {
      if (selectedExistingListNames().length) {
        await previewExistingPlaylistSelection();
      }
    } catch {}
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

  // Radio builder controls moved to radio.html.

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
      suppressCollageForUi();
      activateBuilder('filters');
      syncCropUi();
      renderFiltersSummary();
    });
  });

  document.querySelectorAll('input[name="modeVibe"]').forEach((el) => {
    el.addEventListener('change', () => {
      suppressCollageForUi();
      activateBuilder('vibe');
      syncCropVibeUi();
    });
  });

  document.querySelectorAll('input[name="modePodcast"]').forEach((el) => {
    el.addEventListener('change', () => {
      suppressCollageForUi();
      activateBuilder('podcast');
      syncCropPodcastUi();
    });
  });

  // Radio mode controls moved to radio.html.

  document.querySelectorAll('input[name="modeExisting"]').forEach((el) => {
    el.addEventListener('change', () => {
      suppressCollageForUi();
      activateBuilder('existing');
      syncCropExistingUi();
    });
  });

  cropEl?.addEventListener('change', () => {
    suppressCollageForUi();
    activateBuilder('filters');
    renderFiltersSummary();
  });
  const shuffleEl = $('shuffle');
  shuffleEl?.addEventListener('change', () => {
    suppressCollageForUi();
    if (!shuffleEl.checked) return;
    if (!['filters', 'existing', 'vibe', 'podcast'].includes(currentListSource)) return;
    shuffleCurrentTracksInPlace();
    setStatus('List shuffled.');
  });
  cropVibeEl?.addEventListener('change', () => { suppressCollageForUi(); activateBuilder('vibe'); });
  cropPodcastEl?.addEventListener('change', () => { suppressCollageForUi(); activateBuilder('podcast'); });
  // Radio crop control moved to radio.html.
  cropExistingEl?.addEventListener('change', () => { suppressCollageForUi(); activateBuilder('existing'); });
  shuffleExistingEl?.addEventListener('change', () => {
    suppressCollageForUi();
    if (!shuffleExistingEl.checked) return;
    if (currentListSource !== 'existing') return;
    shuffleCurrentTracksInPlace();
    setStatus('Existing playlist shuffled.');
  });

  // Playlist controls should NOT rebuild the list
  savePlaylistBtn?.addEventListener('click', () => {
    savePlaylistEnabled = true;
    const suggested = suggestedPlaylistName();
    if (playlistNameEl && !String(playlistNameEl.value || '').trim()) playlistNameEl.value = suggested;
    syncSavePlaylistButton();
    updatePlaylistUi();
  });

  playlistNameEl?.addEventListener('input', () => {
    updatePlaylistUi();
    if (existingPlaylistsEl) existingPlaylistsEl.value = '';
    // Intentionally do NOT auto-trigger collage on name edits/focus churn.
    if (collageInputTimer) clearTimeout(collageInputTimer);
  });

  existingPlaylistsEl?.addEventListener('change', () => {
    const v = String(existingPlaylistsEl?.value || '').trim();
    selectedExistingPlaylists = new Set(v ? [v] : []);
    updateExistingPlaylistThumb(existingPlaylistsEl?.value || '');
    const names = Array.from(existingPlaylistsEl.options).map((o) => String(o.value || '')).filter(Boolean);
    renderExistingPlaylistMenu(names);
    renderExistingPlaylistCarousel(names);
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

  let existingCarouselPointerDown = null;
  let existingCarouselMoved = false;
  let existingCarouselLastScrollTs = 0;

  existingPlaylistCarouselEl?.addEventListener('scroll', () => {
    existingCarouselLastScrollTs = Date.now();
    existingCarouselSavedScrollLeft = Number(existingPlaylistCarouselEl?.scrollLeft || 0);
  }, { passive: true });

  existingPlaylistCarouselEl?.addEventListener('pointerdown', (e) => {
    existingCarouselPointerDown = { x: Number(e.clientX || 0), y: Number(e.clientY || 0) };
    existingCarouselMoved = false;
  }, { passive: true });

  existingPlaylistCarouselEl?.addEventListener('pointermove', (e) => {
    if (!existingCarouselPointerDown) return;
    const dx = Math.abs(Number(e.clientX || 0) - existingCarouselPointerDown.x);
    const dy = Math.abs(Number(e.clientY || 0) - existingCarouselPointerDown.y);
    if (dx > 8 || dy > 8) existingCarouselMoved = true;
  }, { passive: true });

  existingPlaylistCarouselEl?.addEventListener('pointercancel', () => {
    existingCarouselMoved = true;
    existingCarouselPointerDown = null;
  }, { passive: true });

  existingPlaylistCarouselEl?.addEventListener('pointerup', () => {
    setTimeout(() => { existingCarouselPointerDown = null; }, 0);
  }, { passive: true });

  existingPlaylistCarouselEl?.addEventListener('click', async (e) => {
    const actionBtn = e.target instanceof Element ? e.target.closest('button[data-existing-action][data-existing-name]') : null;
    if (actionBtn) {
      e.preventDefault();
      e.stopPropagation();
      const action = String(actionBtn.getAttribute('data-existing-action') || '');
      const name = String(actionBtn.getAttribute('data-existing-name') || '');
      if (action === 'delete') { await deleteExistingPlaylist(name); return; }
      if (action === 'edit') { await editExistingPlaylist(name); return; }
    }

    if (existingCarouselMoved) return;
    if ((Date.now() - existingCarouselLastScrollTs) < 300) return;
    const el = e.target instanceof Element ? e.target.closest('[data-existing-carousel]') : null;
    if (!el || !existingPlaylistsEl) return;
    const val = String(el.getAttribute('data-existing-carousel') || '').trim();
    if (!val) return;

    if (selectedExistingPlaylists.has(val)) selectedExistingPlaylists.delete(val);
    else selectedExistingPlaylists.add(val);

    // Keep select synced to first selected for compatibility with legacy flows.
    const first = Array.from(selectedExistingPlaylists)[0] || '';
    existingPlaylistsEl.value = first;

    const names = Array.from(existingPlaylistsEl.options).map((o) => String(o.value || '')).filter(Boolean);
    renderExistingPlaylistMenu(names);
    renderExistingPlaylistCarousel(names);
    updateExistingPlaylistThumb(first);
    updatePlaylistUi();

    if (selectedExistingPlaylists.size) previewExistingPlaylistSelection();
    else {
      setCurrentList('existing', []);
      setCount('No list yet.');
      setStatus('Select one or more playlist covers.');
    }
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

  refreshCollagePreviewBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (refreshCollagePreviewBtn.disabled) return;
    refreshCollagePreviewBtn.disabled = true;
    refreshCollagePreviewBtn.classList.add('iconSpin');
    try {
      setStatus('<span class="spin"></span>Refreshing cover preview…');
      await maybeGenerateCollagePreview('manual-refresh', { force: true });
      setStatus('Cover preview refreshed.');
    } catch (err) {
      setStatus(`Cover preview refresh failed: ${esc(err?.message || err)}`);
    } finally {
      refreshCollagePreviewBtn.disabled = false;
      refreshCollagePreviewBtn.classList.remove('iconSpin');
    }
  });

  savePlaylistNowBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doSavePlaylistOnly();
  });

  const handleQueueAreaClick = (ev) => {
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
      playbackBtn.classList.add('clicked');
      setTimeout(() => playbackBtn.classList.remove('clicked'), 140);
      const actionRaw = String(playbackBtn.getAttribute('data-queue-playback') || '').trim().toLowerCase();
      const action = actionRaw === 'togglepp'
        ? (queuePlayPauseMode === 'play' ? 'play' : 'pause')
        : (actionRaw === 'prev' ? 'previous' : actionRaw);
      playbackBtn.disabled = true;
      const op = action === 'reload'
        ? loadCurrentQueueCard()
        : sendDiagnosticsAction(action).then(() => {
            if (actionRaw === 'togglepp') queuePlayPauseMode = (action === 'play') ? 'pause' : 'play';
            return loadCurrentQueueCard();
          });
      op
        .then(() => setStatus(action === 'reload' ? 'Queue reloaded.' : `Playback: ${action}`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`))
        .finally(() => { playbackBtn.disabled = false; });
      return;
    }

    const favBtn = el.closest('button[data-queue-fav-file]');
    if (favBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const file = decodeURIComponent(String(favBtn.getAttribute('data-queue-fav-file') || ''));
      const curr = String(favBtn.getAttribute('data-queue-fav-state') || '0') === '1';
      const nextFav = !curr;
      const apiBase = getApiBase();
      const key = getKey();
      if (!file || !apiBase) return;
      favBtn.disabled = true;
      fetch(`${apiBase}/config/queue-wizard/radio-favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({ station: file, favorite: nextFav }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok || !j?.ok) throw new Error(j?.error || 'favorite update failed');
          setStatus(nextFav ? 'Station favorited.' : 'Station unfavorited.');
          return Promise.all([loadCurrentQueueCard().catch(() => {}), loadRadioFavorites().catch(() => {})]);
        })
        .catch((e) => setStatus(`Favorite update failed: ${esc(e?.message || e)}`))
        .finally(() => { favBtn.disabled = false; });
      return;
    }

    const rowPlayEl = el.closest('[data-queue-play-pos]');
    if (rowPlayEl && !el.closest('button')) {
      ev.preventDefault();
      const pos = Number(rowPlayEl.getAttribute('data-queue-play-pos') || 0);
      if (Number.isFinite(pos) && pos > 0) {
        sendDiagnosticsAction('playpos', { position: pos })
          .then(() => loadCurrentQueueCard())
          .then(() => setStatus(`Playing queue position ${pos}.`))
          .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`));
      }
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
          s.classList.toggle('on', v <= rating);
          s.classList.toggle('off', v > rating);
        });
      }
      sendDiagnosticsAction('rate', { file, rating })
        .then(() => setStatus(`Rated: ${rating} star${rating===1?'':'s'}`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`));
      return;
    }

    const moveBtn = el.closest('button[data-queue-move-pos][data-queue-move-dir]');
    if (moveBtn) {
      ev.preventDefault();
      const fromPosition = Number(moveBtn.getAttribute('data-queue-move-pos') || 0);
      const dir = String(moveBtn.getAttribute('data-queue-move-dir') || '');
      if (!Number.isFinite(fromPosition) || fromPosition <= 0) return;
      const toPosition = dir === 'up' ? (fromPosition - 1) : (fromPosition + 1);
      if (toPosition <= 0) return;
      moveBtn.disabled = true;
      sendDiagnosticsAction('move', { fromPosition, toPosition })
        .then(() => loadCurrentQueueCard())
        .then(() => setStatus(`Moved queue item ${fromPosition} ${dir}.`))
        .catch((e) => setStatus(`Error: ${esc(e?.message || e)}`))
        .finally(() => { moveBtn.disabled = false; });
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
  };

  resultsEl?.addEventListener('click', handleQueueAreaClick);
  queuePlaybackAreaEl?.addEventListener('click', handleQueueAreaClick);

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

  ['genres', 'artists', 'albums', 'excludeGenres', 'minRating', 'maxTracks', 'vibeMaxTracks', 'shuffle', 'apiBase', 'key'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (id === 'apiBase') {
        syncVibeAvailability();
        loadExistingPlaylists();
      }
      if (id === 'key') {
        loadExistingPlaylists();
      }
      if (id === 'maxTracks') localStorage.setItem(MAX_TRACKS_STORAGE, String(getMaxTracks()));
      if (id === 'vibeMaxTracks') localStorage.setItem(VIBE_MAX_TRACKS_STORAGE, String(getVibeMaxTracks()));
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
        if (id === 'key') {
          loadExistingPlaylists();
        }
        if (id === 'maxTracks') localStorage.setItem(MAX_TRACKS_STORAGE, String(getMaxTracks()));
        if (id === 'vibeMaxTracks') localStorage.setItem(VIBE_MAX_TRACKS_STORAGE, String(getVibeMaxTracks()));
        if (!['apiBase','key'].includes(id)) activateBuilder('filters');
        if (id === 'shuffle') { renderFiltersSummary(); return; }
        maybePreview();
      });
    }
  });

  filterQuickSearchEl?.addEventListener('input', () => {
    renderFilterQuickResults(filterQuickSearchEl.value || '');
  });

  filterQuickSearchEl?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      filterQuickSearchEl.value = '';
      renderFilterQuickResults('');
    }
  });

  filterQuickSearchResultsEl?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const b = ev.target instanceof Element ? ev.target.closest('button[data-quick-type][data-quick-value]') : null;
    if (!b) return;
    const keepOpen = b.hasAttribute('data-quick-add');
    const type = String(b.getAttribute('data-quick-type') || '');
    const value = String(b.getAttribute('data-quick-value') || '');
    applyQuickPick(type, value);
    if (keepOpen) {
      renderFilterQuickResults(filterQuickSearchEl?.value || '');
      return;
    }
    if (filterQuickSearchEl) filterQuickSearchEl.value = '';
    renderFilterQuickResults('');
  });

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#filterQuickSearch') || t.closest('#filterQuickSearchResults')) return;
    renderFilterQuickResults('');
  });
}

// ---- Init ----
try {
  if ($('apiBase') && !$('apiBase').value.trim()) $('apiBase').value = defaultApiBase();
  const savedMax = Number(localStorage.getItem(MAX_TRACKS_STORAGE) || '');
  if ($('maxTracks') && Number.isFinite(savedMax) && savedMax > 0) $('maxTracks').value = String(savedMax);
  const savedVibeMax = Number(localStorage.getItem(VIBE_MAX_TRACKS_STORAGE) || '');
  if ($('vibeMaxTracks') && Number.isFinite(savedVibeMax) && savedVibeMax > 0) $('vibeMaxTracks').value = String(savedVibeMax);

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
  syncCropRadioUi();
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

  window.addEventListener('heroTransport:update', () => {
    if (document.hidden) return;
    if (!(currentListSource === 'queue' || currentListSource === 'none')) return;
    loadCurrentQueueCard().catch(() => {});
  });

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