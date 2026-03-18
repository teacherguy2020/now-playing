(() => {
  const $ = (id) => document.getElementById(id);
  let allStations = [];
  let selected = new Set();
  let activeStationFile = '';
  let activeStationName = '';
  let collapsedGenres = new Set();
  const FILTERS_KEY = 'radio:filters:v1';
  const RADIO_QUEUE_PRESETS_KEY = 'nowplaying.radioQueuePresets.v1';
  const RADIO_COLLAPSED_GENRES_KEY = 'radio:collapsedGenres:v1';

  function apiBaseDefault(){ return `${location.protocol}//${location.hostname || 'nowplaying.local'}:3101`; }
  function key(){ return String($('key')?.value || '').trim(); }
  function base(){ return String($('apiBase')?.value || apiBaseDefault()).replace(/\/$/, ''); }
  function mode(){ return $('modeReplace')?.checked ? 'replace' : 'append'; }
  function setStatus(s){ if ($('status')) $('status').textContent = s || ''; }
  let rbLoading = false;
  function setRbStatus(s, { loading = rbLoading } = {}) {
    const el = $('rbStatus');
    if (!el) return;
    const txt = String(s || '').trim();
    if (!txt) { el.textContent = ''; return; }
    el.innerHTML = `${loading ? '<span class="spin" aria-hidden="true"></span>' : ''}${esc(txt)}`;
  }
  function setPillState(pillId, state){
    const map = { ok:{c:'#22c55e',b:'rgba(34,197,94,.55)'}, warn:{c:'#f59e0b',b:'rgba(245,158,11,.55)'}, bad:{c:'#ef4444',b:'rgba(239,68,68,.55)'}, off:{c:'#64748b',b:'rgba(100,116,139,.45)'} };
    const s = map[state] || map.off;
    const pill = $(pillId); if (!pill) return;
    const dot = pill.querySelector('.dot');
    if (dot) { dot.style.background = s.c; dot.style.boxShadow = `0 0 0 6px ${s.b.replace('.55','.20')}`; }
    pill.style.borderColor = s.b;
  }

  function loadFilters(){
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveFilters(){
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        favoritesOnly: !!$('favoritesOnly')?.checked,
        hqOnly: !!$('hqOnly')?.checked,
      }));
    } catch {}
  }

  function applySavedFilters(){
    const f = loadFilters();
    if ($('favoritesOnly') && typeof f.favoritesOnly === 'boolean') $('favoritesOnly').checked = f.favoritesOnly;
    if ($('hqOnly') && typeof f.hqOnly === 'boolean') $('hqOnly').checked = f.hqOnly;
  }

  function genreCollapseKey(genre){
    return String(genre || '').trim().toLowerCase();
  }

  function loadCollapsedGenres(){
    try {
      const raw = localStorage.getItem(RADIO_COLLAPSED_GENRES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean) : []);
    } catch { return new Set(); }
  }

  function saveCollapsedGenres(){
    try { localStorage.setItem(RADIO_COLLAPSED_GENRES_KEY, JSON.stringify(Array.from(collapsedGenres))); } catch {}
  }

  async function loadRuntime(){
    try {
      const r = await fetch(`${apiBaseDefault()}/config/runtime`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      const cfg = j?.config || {};
      const host = location.hostname || 'nowplaying.local';
      const apiPort = Number(cfg?.ports?.api || 3101);
      const uiPort = Number(cfg?.ports?.ui || 8101);
      const moodeHost = String(cfg?.moode?.sshHost || cfg?.mpd?.host || '').trim();
      const axEnabled = !!cfg?.alexa?.enabled;
      const axDomain = String(cfg?.alexa?.publicDomain || '').trim();
      $('apiBase').value = `${location.protocol}//${host}:${apiPort}`;
      $('key').value = String(cfg?.trackKey || '');
      if ($('apiHint')) $('apiHint').textContent = `${host}:${apiPort}`;
      if ($('webHint')) $('webHint').textContent = `${host}:${uiPort}`;
      if ($('moodeHint')) $('moodeHint').textContent = moodeHost || 'unknown';
      if ($('alexaHint')) $('alexaHint').textContent = !axEnabled ? 'disabled' : (axDomain ? 'configured' : 'missing domain');
      setPillState('apiPill','ok');
      setPillState('webPill','ok');
      setPillState('moodePill', moodeHost ? 'ok' : 'warn');
      setPillState('alexaPill', !axEnabled ? 'off' : (axDomain ? 'ok' : 'warn'));
    } catch {
      $('apiBase').value = apiBaseDefault();
      if ($('apiHint')) $('apiHint').textContent = $('apiBase').value.replace(/^https?:\/\//,'');
      if ($('webHint')) $('webHint').textContent = `${location.hostname || 'nowplaying.local'}:8101`;
      if ($('moodeHint')) $('moodeHint').textContent = 'unknown';
      if ($('alexaHint')) $('alexaHint').textContent = 'unknown';
      setPillState('apiPill','warn');
      setPillState('webPill','warn');
      setPillState('moodePill','warn');
      setPillState('alexaPill','warn');
    }
  }

  async function loadGenres(){
    const r = await fetch(`${base()}/config/queue-wizard/radio-options`, { headers: { 'x-track-key': key() } });
    const j = await r.json().catch(() => ({}));
    const genres = Array.isArray(j?.genres) ? j.genres : [];
    const sel = $('genre');
    if (!sel) return;
    sel.innerHTML = `<option value="">All genres</option>` + genres.map((g) => `<option value="${String(g).replace(/"/g,'&quot;')}">${g}</option>`).join('');
  }

  async function loadFavoritePreset(){
    const r = await fetch(`${base()}/config/queue-wizard/radio-favorites`, { headers: { 'x-track-key': key() } });
    const j = await r.json().catch(() => ({}));
    const favs = Array.isArray(j?.favorites) ? j.favorites : [];
    const sel = $('favoritesPreset');
    if (!sel) return;
    sel.innerHTML = favs.map((f) => `<option value="${encodeURIComponent(String(f.file||''))}">${String(f.stationName || f.file || '')}</option>`).join('');
  }

  async function loadActiveStation(){
    try {
      const r = await fetch(`${base()}/now-playing`, { headers: { 'x-track-key': key() } });
      const j = await r.json().catch(() => ({}));
      activeStationFile = String(j?.file || '').trim();
      activeStationName = String(
        j?._stationName ||
        j?.stationName ||
        j?.radioStationName ||
        j?.album ||
        ''
      ).trim().toLowerCase();
    } catch {
      activeStationFile = '';
      activeStationName = '';
    }
  }

  async function loadRadioQueuePresets(){
    try {
      const r = await fetch(`${base()}/config/queue-wizard/radio-presets`, {
        headers: { 'x-track-key': key() },
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      const list = Array.isArray(j?.presets) ? j.presets : [];
      if (list.length) {
        try { localStorage.setItem(RADIO_QUEUE_PRESETS_KEY, JSON.stringify(list)); } catch {}
        return list;
      }
    } catch {}
    try {
      const v = JSON.parse(localStorage.getItem(RADIO_QUEUE_PRESETS_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }

  async function renderLoadPresetsDropdown(){
    const sel = $('loadPresets');
    if (!sel) return;
    const list = await loadRadioQueuePresets();
    const opts = [`<option value="">Select preset…</option>`]
      .concat(list.map((p) => {
        const id = String(p?.id || '');
        const n = String(p?.name || 'Preset').trim() || 'Preset';
        const c = Array.isArray(p?.stations) ? p.stations.length : 0;
        return `<option value="${id.replace(/"/g,'&quot;')}">${n} (${c})</option>`;
      }));
    sel.innerHTML = opts.join('');
  }

  async function applyLoadedPreset(presetId){
    const id = String(presetId || '').trim();
    if (!id) return;
    const list = await loadRadioQueuePresets();
    const p = list.find((x) => String(x?.id || '') === id);
    if (!p) { setStatus('Preset not found.'); return; }
    const tracks = Array.from(new Set((Array.isArray(p?.stations) ? p.stations : []).map((s) => String(s?.file || '').trim()).filter(Boolean)));
    if (!tracks.length) { setStatus('Preset is empty.'); return; }

    setStatus('Loading preset to moOde queue…');
    const r = await fetch(`${base()}/config/queue-wizard/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ mode: 'replace', keepNowPlaying: false, tracks, forceRandomOff: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    // Mirror selection in UI for easy resend/inspection.
    selected = new Set(tracks);
    renderRows();
    if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    setStatus(`Loaded preset “${String(p?.name || 'Preset')}” (${tracks.length} station${tracks.length===1?'':'s'}).`);
  }

  async function loadStations(){
    setStatus('Loading stations…');
    const genre = String($('genre')?.value || '').trim();
    const favoritesOnly = !!$('favoritesOnly')?.checked;
    const hqOnly = !!$('hqOnly')?.checked;
    const favoriteStations = Array.from(($('favoritesPreset')?.selectedOptions || [])).map((o) => decodeURIComponent(String(o.value || ''))).filter(Boolean);

    const r = await fetch(`${base()}/config/queue-wizard/radio-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ genres: genre ? [genre] : [], favoritesOnly, hqOnly, favoriteStations, maxStations: 500 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const search = String($('search')?.value || '').trim().toLowerCase();
    allStations = (Array.isArray(j.tracks) ? j.tracks : []).filter((s) => {
      if (!search) return true;
      const n = String(s.stationName || s.artist || '').toLowerCase();
      return n.includes(search);
    });
    await loadActiveStation();
    renderRows();
    if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    setStatus('');
  }

  function normalizeGenreToken(token){
    const raw = String(token || '').trim();
    if (!raw) return null;
    const t = raw.toLowerCase();

    // De-prioritize decade buckets; we want style-forward clustering.
    if (/\b\d{2}s\b/.test(t) || /\b\d{4}s\b/.test(t) || /\b(decade|70s|80s|90s|00s|10s|20s)\b/.test(t)) return null;

    if (t.includes('classical')) return 'Classical';
    if (t.includes('jazz')) return 'Jazz';
    if (t.includes('blues')) return 'Blues';
    if (t.includes('r&b') || t.includes('rnb') || t.includes('soul')) return 'R&B / Soul';
    if (t.includes('hip hop') || t.includes('hip-hop') || t.includes('rap')) return 'Hip-Hop / Rap';
    if (t.includes('electronic') || t.includes('edm') || t.includes('dance') || t.includes('house') || t.includes('techno')) return 'Electronic / Dance';
    if (t.includes('rock') || t.includes('alt')) return 'Rock / Alternative';
    if (t.includes('country') || t.includes('americana') || t.includes('folk') || t.includes('bluegrass')) return 'Country / Folk';
    if (t.includes('latin') || t.includes('reggaeton') || t.includes('salsa') || t.includes('bachata')) return 'Latin';
    if (t.includes('news') || t.includes('talk') || t.includes('public radio')) return 'News / Talk';
    if (t.includes('ambient') || t.includes('chill') || t.includes('lofi') || t.includes('lo-fi')) return 'Chill / Ambient';

    // Title-case fallback
    return raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  function renderRows(){
    const rows = $('rows');
    if (!rows) return;
    const b = base();
    const selectedGenreFilter = String($('genre')?.value || '').trim();

    const groups = new Map();
    allStations.forEach((s) => {
      let genres = [];
      if (selectedGenreFilter) {
        // When user filters by one genre, keep results under that genre bucket only.
        genres = [normalizeGenreToken(selectedGenreFilter) || selectedGenreFilter];
      } else {
        const rawGenre = String(s.genre || '').trim();
        const parts = rawGenre
          ? rawGenre.split(/\s*[\/;,|]\s*/g).map((x) => x.trim()).filter(Boolean)
          : [];

        const normalized = Array.from(new Set(parts.map(normalizeGenreToken).filter(Boolean)));
        const hasDecadeOnly = parts.length > 0 && normalized.length === 0;
        genres = normalized.length ? normalized : (hasDecadeOnly ? ['Throwback / Hits'] : ['Other']);
      }

      genres.forEach((g) => {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(s);
      });
    });

    const makeCard = (s, genreLabel = '') => {
      const file = String(s.file || '');
      const name = String(s.stationName || s.artist || 'Radio Station');
      const logo = `${b}/art/radio-logo.jpg?name=${encodeURIComponent(name)}`;
      const on = !!s.isFavoriteStation;
      const isSel = selected.has(file);
      const nameKey = String(name || '').trim().toLowerCase();
      const isActiveByFile = !!activeStationFile && file === activeStationFile;
      const isActiveByName = !!activeStationName && !!nameKey && nameKey === activeStationName;
      const isActive = isActiveByFile || isActiveByName;
      const formatStr = String(s?.format || '').toUpperCase();
      const brRaw = String(s?.bitrate || '').trim();
      const brMatch = brRaw.match(/(\d+(?:\.\d+)?)/);
      const bitrateNum = brMatch ? Number(brMatch[1]) : Number(s?.bitrate || 0);
      const isLossless = /(FLAC|ALAC|WAV|AIFF|PCM)/i.test(formatStr);
      const isOpus = /OPUS/i.test(formatStr);
      const isMp3Aac = /(MP3|AAC)/i.test(formatStr);
      const isHqByRate = isLossless || (isOpus ? bitrateNum >= 128 : (isMp3Aac ? bitrateNum >= 320 : bitrateNum >= 320));
      const isHq = isHqByRate || (!!s?.hq && bitrateNum >= 320);
      const qualityBadge = isLossless ? 'Lossless' : (isHq ? 'HQ' : '');
      return `<div class="stationCard ${isActive ? 'isActive' : ''}" data-card-file="${encodeURIComponent(file)}">
        <img class="logo" src="${logo}" onerror="this.style.opacity=.25;this.removeAttribute('src')" alt="">
        <div>
          <div class="stationName">${name}</div>
          <div class="stationMeta">${String(s.bitrate || '')}${s.bitrate && s.format ? ' • ' : ''}${String(s.format || '')}${qualityBadge ? ` <span class='chip hq'>${qualityBadge}</span>` : ''}<button class="heartBtn ${on ? 'on' : ''}" data-fav="${encodeURIComponent(file)}" data-state="${on ? '1':'0'}" title="Toggle favorite">♥</button>${genreLabel ? ` <span class='chip'>${genreLabel}</span>` : ''}</div>
        </div>
        <div class="stationControls">
          <button class="stationAction ${isSel ? 'isOn' : ''}" data-add="${encodeURIComponent(file)}" title="Add to send list">＋</button>
          <button class="stationAction" data-play="${encodeURIComponent(file)}" title="Play now">▶</button>
          <button class="stationAction" data-del="${encodeURIComponent(file)}" title="Remove from moOde">🗑</button>
        </div>
      </div>`;
    };

    const groupOrder = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    const grouped = groupOrder.map((genre) => {
      const list = groups.get(genre) || [];
      list.sort((a, b) => {
        const an = String(a?.stationName || a?.artist || '').toLowerCase();
        const bn = String(b?.stationName || b?.artist || '').toLowerCase();
        return an.localeCompare(bn);
      });
      return { genre, list };
    });

    const multi = grouped.filter((g) => g.list.length > 1);
    const singles = grouped.filter((g) => g.list.length === 1);

    const multiHtml = multi.map(({ genre, list }) => {
      const cards = list.map((s) => makeCard(s)).join('');
      const gKey = genreCollapseKey(genre);
      const isCollapsed = collapsedGenres.has(gKey);
      return `<section class="stationCluster ${isCollapsed ? 'isCollapsed' : ''}" data-genre-key="${encodeURIComponent(gKey)}">
        <div class="clusterHead">
          <div class="clusterTitle">${genre}</div>
          <div class="clusterCount">${list.length} stations</div>
          <button class="clusterToggle" data-collapse-genre="${encodeURIComponent(gKey)}" title="${isCollapsed ? 'Expand group' : 'Collapse group'}" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-label="${isCollapsed ? 'Expand group' : 'Collapse group'}"><span class="clusterChevron" aria-hidden="true"></span></button>
        </div>
        <div class="stationGrid">${cards}</div>
      </section>`;
    }).join('');

    const singlesHtml = singles.length
      ? `<div class="singletonClusterGrid">${singles.map(({ genre, list }) => {
          const gKey = genreCollapseKey(genre);
          const isCollapsed = collapsedGenres.has(gKey);
          return `
          <section class="stationCluster singleton ${isCollapsed ? 'isCollapsed' : ''}" data-genre-key="${encodeURIComponent(gKey)}">
            <div class="clusterHead">
              <div class="clusterTitle">${genre}</div>
              <div class="clusterCount">1 station</div>
              <button class="clusterToggle" data-collapse-genre="${encodeURIComponent(gKey)}" title="${isCollapsed ? 'Expand group' : 'Collapse group'}" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-label="${isCollapsed ? 'Expand group' : 'Collapse group'}"><span class="clusterChevron" aria-hidden="true"></span></button>
            </div>
            <div class="stationGrid">${makeCard(list[0])}</div>
          </section>`;
        }).join('')}</div>`
      : '';

    rows.innerHTML = `${multiHtml}${singlesHtml}`;
  }

  async function toggleFavorite(file, next){
    const r = await fetch(`${base()}/config/queue-wizard/radio-favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ station: file, favorite: next }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  }

  async function sendSelected(){
    const files = Array.from(selected);
    if (!files.length) { setStatus('Select stations first.'); return; }
    setStatus('Sending selected stations…');
    const r = await fetch(`${base()}/config/queue-wizard/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ mode: mode(), keepNowPlaying: !!$('crop')?.checked, tracks: files, forceRandomOff: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    setStatus(`Sent ${j.added}/${j.requested} station(s).`);

    // Clear selection highlights after successful send so user sees a fresh state.
    selected.clear();
    renderRows();
    if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
  }

  async function playNow(file){
    const f = String(file || '').trim();
    if (!f) return;
    setStatus('Starting station…');
    const r = await fetch(`${base()}/config/queue-wizard/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ mode: 'replace', keepNowPlaying: false, tracks: [f], forceRandomOff: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    // Optimistic active-station highlight immediately in station cards.
    activeStationFile = f;
    renderRows();

    await fetch(`${base()}/config/diagnostics/playback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ action: 'play' }),
    }).catch(() => {});

    // Re-sync from now-playing after playback switches.
    setTimeout(async () => {
      try {
        await loadActiveStation();
        renderRows();
      } catch {}
    }, 700);

    setStatus('Playing station now.');
  }

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function renderRbRows(stations){
    const host = $('rbRows');
    if (!host) return;
    const rows = Array.isArray(stations) ? stations : [];
    if (!rows.length) {
      host.innerHTML = '<div class="muted">No global stations found.</div>';
      return;
    }
    host.innerHTML = rows.map((s, i) => {
      const name = String(s?.name || 'Station');
      const url = String(s?.url || '');
      const meta = [String(s?.country || ''), String(s?.codec || ''), s?.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' • ');
      const art = String(s?.favicon || '').trim() || `${base()}/art/radio-logo.jpg?name=${encodeURIComponent(name)}`;
      return `<div class="stationCard" style="grid-template-columns:auto minmax(0,1fr) auto;">
        <img class="logo" src="${esc(art)}" alt="" onerror="this.onerror=null;this.src='${base()}/art/radio-logo.jpg?name=${encodeURIComponent(name)}';" />
        <div style="min-width:0;">
          <div class="stationName">${esc(name)}</div>
          <div class="stationMeta" title="${esc(url)}">${esc(meta || url)}</div>
          <div class="stationMeta" data-rb-row-status="${i}" style="min-height:14px;"></div>
        </div>
        <div class="stationControls">
          <button class="stationAction" data-rb-preview="${i}">▶</button>
          <button class="stationAction" data-rb-add="${i}">＋</button>
          <button class="stationAction" data-rb-addfav="${i}">♥</button>
        </div>
      </div>`;
    }).join('');

    host.querySelectorAll('[data-rb-preview]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-rb-preview') || -1);
        const s = rows[idx];
        if (!s?.url) return;
        setRbStatus(`Previewing ${s.name}…`);
        try {
          const r = await fetch(`${base()}/config/radio-browser/preview`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
            body: JSON.stringify({ url: s.url, name: s.name }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
          setRbStatus(`Previewing: ${s.name}`);
        } catch (e) { setRbStatus(`Preview failed: ${e?.message || e}`); }
      });
    });

    const bindAdd = (selector, favorite) => {
      host.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.getAttribute(selector === '[data-rb-add]' ? 'data-rb-add' : 'data-rb-addfav') || -1);
          const s = rows[idx];
          if (!s?.url || !s?.name) return;
          const rowStatus = host.querySelector(`[data-rb-row-status="${idx}"]`);
          const addBtn = host.querySelector(`[data-rb-add="${idx}"]`);
          if (rowStatus) rowStatus.textContent = 'Adding…';
          btn.disabled = true;
          if (addBtn) addBtn.disabled = true;
          try {
            const r = await fetch(`${base()}/config/radio-browser/add`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
              body: JSON.stringify({
                url: s.url,
                name: s.name,
                homepage: s.homepage,
                favicon: s.favicon,
                tags: s.tags,
                codec: s.codec,
                bitrate: s.bitrate,
                favorite,
              }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            const logoNote = j.logoSaved ? ' · logo saved' : '';
            if (rowStatus) rowStatus.textContent = `${j.added ? 'Added' : 'Already in library'}${favorite ? ' · favorited' : ''}${logoNote}`;
            if (addBtn) {
              addBtn.textContent = '✓';
              addBtn.classList.add('isOn');
              addBtn.disabled = true;
              addBtn.removeAttribute('data-rb-add');
            }
            setRbStatus(`${j.added ? 'Added' : 'Already exists'}: ${s.name}${favorite ? ' (favorite)' : ''}`);
            await loadGenres().catch(() => {});
            await loadStations().catch(() => {});
          } catch (e) {
            if (rowStatus) rowStatus.textContent = `Add failed: ${e?.message || e}`;
            setRbStatus(`Add failed: ${e?.message || e}`);
            btn.disabled = false;
            if (addBtn) addBtn.disabled = false;
          } finally {
            btn.disabled = false;
          }
        });
      });
    };
    bindAdd('[data-rb-add]', false);
    bindAdd('[data-rb-addfav]', true);
  }

  async function probeManualStation(){
    const url = String($('rbManualUrl')?.value || '').trim();
    const name = String($('rbManualName')?.value || '').trim();
    if (!url) throw new Error('Enter stream URL first');
    const r = await fetch(`${base()}/config/radio-browser/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ url, name }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const st = j.station || {};
    if ($('rbManualName')) {
      const current = String($('rbManualName').value || '').trim();
      const generic = !current || /^custom station$/i.test(current) || /^stream revma ihrhls$/i.test(current) || /^zc\d+$/i.test(current);
      if (generic && String(st.name || '').trim()) $('rbManualName').value = String(st.name || '').trim();
    }
    if (j?.adapted) {
      const from = String(j?.adaptedFrom || url || '').trim();
      const to = String(j?.adaptedTo || st?.url || '').trim();
      setRbStatus(`Adapted iHeart page URL → direct stream${to ? ` · ${to}` : ''}${from ? ` (from ${from})` : ''}`);
    }

    const logoEl = $('rbManualLogo');
    if (logoEl) {
      const direct = String(st.favicon || '').trim();
      const fallback = `${base()}/art/radio-logo.jpg?name=${encodeURIComponent(String(st.name || 'Station'))}`;
      logoEl.src = direct || fallback;
      logoEl.onerror = () => { logoEl.onerror = null; logoEl.src = fallback; };
    }

    return st;
  }

  async function addManualStation(favorite = false){
    const st = await probeManualStation();
    setRbStatus(`Adding ${st.name || 'station'}…`, { loading: true });
    const r = await fetch(`${base()}/config/radio-browser/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({
        url: st.url,
        name: st.name,
        genre: st.genre,
        homepage: st.homepage,
        favicon: st.favicon,
        favorite,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    setRbStatus(`${j.added ? 'Added' : 'Already in library'}: ${st.name}${favorite ? ' (favorite)' : ''}${j.logoSaved ? ' · logo saved' : ''}`);
    await loadGenres().catch(() => {});
    await loadFavoritePreset().catch(() => {});
    await loadStations().catch(() => {});
  }

  async function previewManualStation(){
    const st = await probeManualStation();
    setRbStatus(`Previewing ${st.name || 'station'}…`, { loading: true });
    const r = await fetch(`${base()}/config/radio-browser/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
      body: JSON.stringify({ url: st.url, name: st.name }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    setRbStatus(`Previewing: ${st.name || st.url}`);
  }

  async function searchRadioBrowser(){
    const q = String($('rbSearch')?.value || '').trim();
    const country = String($('rbCountry')?.value || '').trim();
    const tag = String($('rbTag')?.value || '').trim();
    const codec = String($('rbCodec')?.value || '').trim();
    const hqOnly = !!$('rbHqOnly')?.checked;
    const excludeExisting = !!$('rbExcludeExisting')?.checked;
    rbLoading = true;
    setRbStatus('Auto-searching global directory…', { loading: true });
    try {
      const u = new URL(`${base()}/config/radio-browser/search`);
      if (q) u.searchParams.set('q', q);
      if (country) u.searchParams.set('country', country);
      if (tag) u.searchParams.set('tag', tag);
      if (codec) u.searchParams.set('codec', codec);
      if (hqOnly) u.searchParams.set('hqOnly', '1');
      if (excludeExisting) u.searchParams.set('excludeExisting', '1');
      u.searchParams.set('limit', '30');

      const r = await fetch(u.toString(), { headers: { 'x-track-key': key() } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      renderRbRows(j.stations || []);
      rbLoading = false;
      setRbStatus(`${Number(j.count || 0)} station(s)`);
    } catch (e) {
      rbLoading = false;
      throw e;
    }
  }

  function wire(){
    $('refreshBtn')?.addEventListener('click', () => loadStations().catch((e) => setStatus(String(e?.message || e))));
    $('sendBtn')?.addEventListener('click', () => sendSelected().catch((e) => setStatus(String(e?.message || e))));
    $('selectAllBtn')?.addEventListener('click', () => {
      allStations.forEach((s) => selected.add(String(s.file || '')));
      renderRows();
      if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    });
    $('clearSelBtn')?.addEventListener('click', () => {
      selected.clear(); renderRows();
      if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    });

    let lastActionSig = '';
    let lastActionTs = 0;
    const handleRowAction = (ev) => {
      const targetEl = ev.target instanceof Element ? ev.target : null;
      if (!targetEl) return;

      const collapseBtn = targetEl.closest('button[data-collapse-genre]');
      const favBtn = collapseBtn ? null : targetEl.closest('button[data-fav]');
      const addBtn = (collapseBtn || favBtn) ? null : targetEl.closest('button[data-add]');
      const playBtn = (collapseBtn || favBtn || addBtn) ? null : targetEl.closest('button[data-play]');
      const delBtn = (collapseBtn || favBtn || addBtn || playBtn) ? null : targetEl.closest('button[data-del]');
      if (!collapseBtn && !favBtn && !addBtn && !playBtn && !delBtn) return;

      const sig = collapseBtn
        ? `collapse::${String(collapseBtn.getAttribute('data-collapse-genre') || '')}`
        : `${favBtn ? 'fav' : (addBtn ? 'add' : (playBtn ? 'play' : 'del'))}::${String((favBtn || addBtn || playBtn || delBtn)?.getAttribute(favBtn ? 'data-fav' : (addBtn ? 'data-add' : (playBtn ? 'data-play' : 'data-del'))) || '')}`;
      const now = Date.now();
      if (sig && sig === lastActionSig && (now - lastActionTs) < 220) return;
      lastActionSig = sig;
      lastActionTs = now;

      ev.preventDefault();
      ev.stopPropagation();

      if (collapseBtn) {
        const gKey = decodeURIComponent(String(collapseBtn.getAttribute('data-collapse-genre') || '')).toLowerCase().trim();
        if (!gKey) return;
        if (collapsedGenres.has(gKey)) collapsedGenres.delete(gKey); else collapsedGenres.add(gKey);
        saveCollapsedGenres();
        renderRows();
        return;
      }

      if (favBtn) {
        const file = decodeURIComponent(String(favBtn.getAttribute('data-fav') || ''));
        const prevOn = String(favBtn.getAttribute('data-state') || '0') === '1';
        const next = !prevOn;

        // Optimistic UI (like hero stars): flip heart immediately.
        favBtn.setAttribute('data-state', next ? '1' : '0');
        favBtn.classList.toggle('on', next);

        // Keep local model in sync immediately.
        allStations.forEach((s) => {
          if (String(s?.file || '') === file) s.isFavoriteStation = next;
        });

        toggleFavorite(file, next)
          .then(() => loadFavoritePreset())
          .then(() => { renderRows(); if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`; })
          .catch((e) => {
            // Rollback optimistic state on failure.
            favBtn.setAttribute('data-state', prevOn ? '1' : '0');
            favBtn.classList.toggle('on', prevOn);
            allStations.forEach((s) => {
              if (String(s?.file || '') === file) s.isFavoriteStation = prevOn;
            });
            setStatus(`Favorite failed: ${String(e?.message || e)}`);
          });
        return;
      }

      if (addBtn) {
        const file = decodeURIComponent(String(addBtn.getAttribute('data-add') || ''));
        if (!file) return;
        if (selected.has(file)) selected.delete(file); else selected.add(file);
        renderRows();
        if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
        return;
      }

      if (delBtn) {
        if (delBtn.dataset.busy === '1') return;
        delBtn.dataset.busy = '1';

        const file = decodeURIComponent(String(delBtn.getAttribute('data-del') || ''));
        if (!file) { delBtn.dataset.busy = '0'; return; }

        const ok = window.confirm('Remove this station from moOde stations?');
        if (!ok) { delBtn.dataset.busy = '0'; return; }

        setStatus('Removing station…');
        fetch(`${base()}/config/queue-wizard/radio-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-track-key': key() },
          body: JSON.stringify({ station: file }),
        })
          .then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            selected.delete(file);
            await loadGenres().catch(() => {});
            await loadFavoritePreset().catch(() => {});
            await loadStations();
            setStatus(`Removed: ${j.stationName || j.station || file}`);
          })
          .catch((e) => setStatus(`Remove failed: ${String(e?.message || e)}`))
          .finally(() => { delBtn.dataset.busy = '0'; });
        return;
      }

      if (playBtn) {
        const file = decodeURIComponent(String(playBtn.getAttribute('data-play') || ''));
        playNow(file).catch((e) => setStatus(String(e?.message || e)));
      }
    };

    $('rows')?.addEventListener('pointerdown', handleRowAction, { passive: false, capture: true });
    $('rows')?.addEventListener('touchend', handleRowAction, { passive: false, capture: true });
    $('rows')?.addEventListener('click', handleRowAction, { capture: true });

    ['genre','favoritesOnly','hqOnly','search','favoritesPreset'].forEach((id) => {
      $(id)?.addEventListener('change', () => {
        if (id === 'favoritesOnly' || id === 'hqOnly') saveFilters();
        loadStations().catch((e) => setStatus(String(e?.message || e)));
      });
    });

    $('loadPresets')?.addEventListener('change', (ev) => {
      const id = String(ev?.target?.value || '').trim();
      if (!id) return;
      applyLoadedPreset(id).catch((e) => setStatus(String(e?.message || e)));
    });

    $('rbManualPreview')?.addEventListener('click', () => previewManualStation().catch((e) => setRbStatus(String(e?.message || e))));
    $('rbManualAdd')?.addEventListener('click', () => addManualStation(false).catch((e) => setRbStatus(String(e?.message || e))));
    $('rbManualAddFav')?.addEventListener('click', () => addManualStation(true).catch((e) => setRbStatus(String(e?.message || e))));

    ['rbManualUrl','rbManualName'].forEach((id) => {
      $(id)?.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        previewManualStation().catch((e) => setRbStatus(String(e?.message || e)));
      });
    });

    let rbDebounce = null;
    ['rbSearch','rbCountry','rbTag','rbCodec','rbHqOnly','rbExcludeExisting'].forEach((id) => {
      $(id)?.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        searchRadioBrowser().catch((e) => setRbStatus(String(e?.message || e)));
      });
      $(id)?.addEventListener('input', () => {
        if (rbDebounce) clearTimeout(rbDebounce);
        rbDebounce = setTimeout(() => {
          const hasAny = ['rbSearch','rbCountry','rbTag','rbCodec'].some((k) => String($(k)?.value || '').trim());
          if (!hasAny) return;
          searchRadioBrowser().catch((e) => setRbStatus(String(e?.message || e)));
        }, 450);
      });
    });

    window.addEventListener('storage', (ev) => {
      if (String(ev?.key || '') === RADIO_QUEUE_PRESETS_KEY) renderLoadPresetsDropdown();
    });
    window.addEventListener('message', (ev) => {
      const t = String(ev?.data?.type || '');
      if (t === 'radio-presets-updated') renderLoadPresetsDropdown();
    });
  }

  async function syncActiveOnly(){
    try {
      const prevFile = activeStationFile;
      const prevName = activeStationName;
      await loadActiveStation();
      if (activeStationFile !== prevFile || activeStationName !== prevName) renderRows();
    } catch {}
  }

  (async () => {
    await loadRuntime();
    applySavedFilters();
    collapsedGenres = loadCollapsedGenres();
    wire();
    await loadGenres().catch(() => {});
    await loadFavoritePreset().catch(() => {});
    renderLoadPresetsDropdown();
    await loadStations().catch((e) => setStatus(String(e?.message || e)));

    setInterval(() => {
      if (document.hidden) return;
      syncActiveOnly();
    }, 2500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncActiveOnly(); });
    window.addEventListener('focus', () => syncActiveOnly());
  })();
})();
