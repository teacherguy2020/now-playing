(() => {
  const $ = (id) => document.getElementById(id);
  let allStations = [];
  let selected = new Set();

  function apiBaseDefault(){ return `${location.protocol}//${location.hostname || '10.0.0.233'}:3101`; }
  function key(){ return String($('key')?.value || '').trim(); }
  function base(){ return String($('apiBase')?.value || apiBaseDefault()).replace(/\/$/, ''); }
  function mode(){ return $('modeReplace')?.checked ? 'replace' : 'append'; }
  function setStatus(s){ if ($('status')) $('status').textContent = s || ''; }
  function setPillState(pillId, state){
    const map = { ok:{c:'#22c55e',b:'rgba(34,197,94,.55)'}, warn:{c:'#f59e0b',b:'rgba(245,158,11,.55)'}, bad:{c:'#ef4444',b:'rgba(239,68,68,.55)'}, off:{c:'#64748b',b:'rgba(100,116,139,.45)'} };
    const s = map[state] || map.off;
    const pill = $(pillId); if (!pill) return;
    const dot = pill.querySelector('.dot');
    if (dot) { dot.style.background = s.c; dot.style.boxShadow = `0 0 0 6px ${s.b.replace('.55','.20')}`; }
    pill.style.borderColor = s.b;
  }

  async function loadRuntime(){
    try {
      const r = await fetch(`${apiBaseDefault()}/config/runtime`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      const cfg = j?.config || {};
      const host = location.hostname || '10.0.0.233';
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
      if ($('webHint')) $('webHint').textContent = `${location.hostname || '10.0.0.233'}:8101`;
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
    renderRows();
    if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    setStatus('');
  }

  function renderRows(){
    const rows = $('rows');
    if (!rows) return;
    const b = base();
    rows.innerHTML = allStations.map((s, i) => {
      const file = String(s.file || '');
      const name = String(s.stationName || s.artist || 'Radio Station');
      const logo = `${b}/art/radio-logo.jpg?name=${encodeURIComponent(name)}`;
      const on = !!s.isFavoriteStation;
      return `<tr>
        <td><input type="checkbox" data-sel="${encodeURIComponent(file)}" ${selected.has(file) ? 'checked' : ''}></td>
        <td><button class="heartBtn ${on ? 'on' : ''}" data-fav="${encodeURIComponent(file)}" data-state="${on ? '1':'0'}">♥</button></td>
        <td><img class="logo" src="${logo}" onerror="this.style.opacity=.25;this.removeAttribute('src')"> ${name}</td>
        <td>${String(s.genre || '')}</td>
        <td>${String(s.bitrate || '')}</td>
        <td>${String(s.format || '')}</td>
        <td>${String(s.radioType || '')}</td>
      </tr>`;
    }).join('');
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

    $('rows')?.addEventListener('change', (ev) => {
      const el = ev.target instanceof Element ? ev.target.closest('input[data-sel]') : null;
      if (!el) return;
      const file = decodeURIComponent(String(el.getAttribute('data-sel') || ''));
      if (!file) return;
      if (el.checked) selected.add(file); else selected.delete(file);
      if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
    });

    $('rows')?.addEventListener('click', (ev) => {
      const btn = ev.target instanceof Element ? ev.target.closest('button[data-fav]') : null;
      if (!btn) return;
      ev.preventDefault();
      const file = decodeURIComponent(String(btn.getAttribute('data-fav') || ''));
      const next = String(btn.getAttribute('data-state') || '0') !== '1';
      toggleFavorite(file, next)
        .then(() => loadFavoritePreset())
        .then(() => loadStations())
        .catch((e) => setStatus(`Favorite failed: ${String(e?.message || e)}`));
    });

    ['genre','favoritesOnly','hqOnly','search','favoritesPreset'].forEach((id) => {
      $(id)?.addEventListener('change', () => loadStations().catch((e) => setStatus(String(e?.message || e))));
    });
  }

  (async () => {
    await loadRuntime();
    wire();
    await loadGenres().catch(() => {});
    await loadFavoritePreset().catch(() => {});
    await loadStations().catch((e) => setStatus(String(e?.message || e)));
  })();
})();
