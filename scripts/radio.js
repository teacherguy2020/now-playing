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

    const groups = new Map();
    allStations.forEach((s) => {
      const rawGenre = String(s.genre || '').trim();
      const parts = rawGenre
        ? rawGenre.split(/\s*[\/;,|]\s*/g).map((x) => x.trim()).filter(Boolean)
        : [];

      const normalized = Array.from(new Set(parts.map(normalizeGenreToken).filter(Boolean)));
      const hasDecadeOnly = parts.length > 0 && normalized.length === 0;
      const genres = normalized.length ? normalized : (hasDecadeOnly ? ['Throwback / Hits'] : ['Other']);

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
      const bitrateNum = Number(s?.bitrate || 0);
      const isHq = !!s?.hq || bitrateNum >= 192;
      return `<div class="stationCard ${isSel ? 'isSel' : ''}" data-card-sel="${encodeURIComponent(file)}">
        <img class="logo" src="${logo}" onerror="this.style.opacity=.25;this.removeAttribute('src')" alt="">
        <div>
          <div class="stationName">${name}</div>
          <div class="stationMeta">${String(s.bitrate || '')}${s.bitrate && s.format ? ' • ' : ''}${String(s.format || '')}${isHq ? ` <span class='chip hq'>HQ</span>` : ''}${genreLabel ? ` <span class='chip'>${genreLabel}</span>` : ''}</div>
        </div>
        <div class="stationControls">
          <button class="heartBtn ${on ? 'on' : ''}" data-fav="${encodeURIComponent(file)}" data-state="${on ? '1':'0'}" title="Toggle favorite">♥</button>
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
      return `<section class="stationCluster">
        <div class="clusterHead">
          <div class="clusterTitle">${genre}</div>
          <div class="clusterCount">${list.length} stations</div>
        </div>
        <div class="stationGrid">${cards}</div>
      </section>`;
    }).join('');

    const singlesHtml = singles.length
      ? `<div class="singletonClusterGrid">${singles.map(({ genre, list }) => `
          <section class="stationCluster singleton">
            <div class="clusterHead">
              <div class="clusterTitle">${genre}</div>
              <div class="clusterCount">1 station</div>
            </div>
            <div class="stationGrid">${makeCard(list[0])}</div>
          </section>
        `).join('')}</div>`
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

    $('rows')?.addEventListener('click', (ev) => {
      const favBtn = ev.target instanceof Element ? ev.target.closest('button[data-fav]') : null;
      if (favBtn) {
        ev.preventDefault();
        ev.stopPropagation();
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

      const card = ev.target instanceof Element ? ev.target.closest('[data-card-sel]') : null;
      if (!card) return;
      const file = decodeURIComponent(String(card.getAttribute('data-card-sel') || ''));
      if (!file) return;
      if (selected.has(file)) selected.delete(file); else selected.add(file);
      card.classList.toggle('isSel', selected.has(file));
      if ($('count')) $('count').textContent = `${allStations.length} station(s) shown · ${selected.size} selected`;
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
