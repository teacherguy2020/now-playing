(() => {
  const $ = (id) => document.getElementById(id);
  const TRACK_KEY_STORAGE = 'np_track_key';
  let runtimeConfig = null;

  function apiBaseDefault(){
    const host = location.hostname || '10.0.0.233';
    return `${location.protocol}//${host}:3101`;
  }

  function status(msg){
    const el = $('status');
    if (el) el.textContent = msg;
  }

  function setAliasesSaveNote(msg, ok = true) {
    const el = $('aliasesSaveNote');
    if (!el) return;
    el.textContent = String(msg || '');
    el.style.color = ok ? '#86efac' : '#fca5a5';
  }

  async function withButtonFeedback(btn, action, opts = {}) {
    if (!btn) return action();
    const idle = String(opts.idle || btn.dataset.idleText || btn.textContent || 'Save');
    const busy = String(opts.busy || 'Saving…');
    const done = String(opts.done || 'Saved ✓');

    btn.dataset.idleText = idle;
    btn.disabled = true;
    btn.textContent = busy;
    btn.style.opacity = '0.85';

    try {
      const out = await action();
      btn.textContent = done;
      btn.style.background = '#14532d';
      setTimeout(() => {
        btn.textContent = idle;
        btn.style.background = '';
        btn.style.opacity = '';
        btn.disabled = false;
      }, 900);
      return out;
    } catch (e) {
      btn.textContent = 'Save failed';
      btn.style.background = '#7f1d1d';
      setTimeout(() => {
        btn.textContent = idle;
        btn.style.background = '';
        btn.style.opacity = '';
        btn.disabled = false;
      }, 1200);
      throw e;
    }
  }

  function pretty(obj){ return JSON.stringify(obj || {}, null, 2); }

  function parseJsonField(id){
    const raw = String($(id)?.value || '').trim();
    if (!raw) return {};
    const out = JSON.parse(raw);
    if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error(`${id} must be a JSON object`);
    return out;
  }

  function aliasKey(s){ return String(s || '').trim().toLowerCase(); }

  function readAliasMap(id){
    try {
      const obj = parseJsonField(id);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function renderHeard(id, rows, field, type){
    const host = $(id);
    if (!host) return;

    const mapId = type === 'album' ? 'albumAliases' : (type === 'playlist' ? 'playlistAliases' : 'artistAliases');
    const aliases = readAliasMap(mapId);

    const list = (Array.isArray(rows) ? rows : [])
      .filter((r) => {
        const what = String(r?.[field] || '').trim();
        if (!what) return false;
        // Hide items already corrected in alias map.
        return !aliases[aliasKey(what)];
      })
      .slice(0, 20);

    if (!list.length) { host.innerHTML = '<div>None (all recent items are already fixed)</div>'; return; }

    host.innerHTML = list.map((r, idx) => {
      const what = String(r?.[field] || '').trim() || '(blank)';
      const st = String(r?.status || 'seen');
      const src = String(r?.source || 'alexa');
      const safeWhat = what.replace(/</g,'&lt;');
      return `<div style="margin:4px 0;">• <code>${safeWhat}</code> <span style="opacity:.8;">[${st} · ${src}]</span> <button type="button" data-fix-type="${type}" data-heard="${encodeURIComponent(what)}" data-row="${idx}" style="margin-left:6px;">Fix</button></div>`;
    }).join('');
  }

  async function load(){
    const base = apiBaseDefault();
    const r = await fetch(`${base}/config/runtime`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    runtimeConfig = j.config || {};

    const key = String(runtimeConfig.trackKey || '').trim();
    if (key) localStorage.setItem(TRACK_KEY_STORAGE, key);

    const ax = runtimeConfig.alexa || {};
    $('alexaEnabled').checked = !!ax.enabled;
    $('publicDomain').value = String(ax.publicDomain || '');
    $('artistAliases').value = pretty(ax.artistAliases || {});
    $('albumAliases').value = pretty(ax.albumAliases || {});
    $('playlistAliases').value = pretty(ax.playlistAliases || {});

    renderHeard('heardArtists', ax.heardArtists, 'artist', 'artist');
    renderHeard('heardAlbums', ax.heardAlbums, 'album', 'album');
    renderHeard('heardPlaylists', ax.heardPlaylists, 'playlist', 'playlist');

    status('Loaded.');
  }

  async function postRuntime(nextAlexa){
    const base = apiBaseDefault();
    const key = String(localStorage.getItem(TRACK_KEY_STORAGE) || '').trim();
    if (!key) throw new Error('Missing track key. Open Config once to load it.');

    const payload = { config: { alexa: nextAlexa } };
    const r = await fetch(`${base}/config/runtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function saveSettings(){
    if (!runtimeConfig) throw new Error('Runtime config not loaded yet');
    const ax = runtimeConfig.alexa || {};
    const nextAlexa = {
      ...ax,
      enabled: !!$('alexaEnabled').checked,
      publicDomain: String($('publicDomain').value || '').trim(),
    };
    await postRuntime(nextAlexa);
    status('Saved Alexa settings.');
    await load();
  }

  async function saveAliases(){
    if (!runtimeConfig) throw new Error('Runtime config not loaded yet');
    const ax = runtimeConfig.alexa || {};
    const nextAlexa = {
      ...ax,
      artistAliases: parseJsonField('artistAliases'),
      albumAliases: parseJsonField('albumAliases'),
      playlistAliases: parseJsonField('playlistAliases'),
    };
    await postRuntime(nextAlexa);
    const when = new Date().toLocaleTimeString();
    setAliasesSaveNote(`Saved at ${when}.`, true);
    status('Saved Alexa corrections.');
    await load();
  }

  async function clearHeard(kind){
    if (!runtimeConfig) throw new Error('Runtime config not loaded yet');
    const ax = runtimeConfig.alexa || {};
    const nextAlexa = { ...ax };
    if (kind === 'artist') nextAlexa.heardArtists = [];
    if (kind === 'album') nextAlexa.heardAlbums = [];
    if (kind === 'playlist') nextAlexa.heardPlaylists = [];
    await postRuntime(nextAlexa);
    status(`Cleared recently heard ${kind}s.`);
    await load();
  }

  $('saveSettingsBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    try {
      await withButtonFeedback(btn, () => saveSettings(), { busy: 'Saving…', done: 'Saved ✓' });
    } catch (e) {
      status(`Error: ${e.message || e}`);
    }
  });

  $('clearHeardArtistsBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!confirm('Clear recently heard artists list?')) return;
    try { await withButtonFeedback(btn, () => clearHeard('artist'), { idle: 'Clear', busy: 'Clearing…', done: 'Cleared ✓' }); }
    catch (e) { status(`Error: ${e.message || e}`); }
  });
  $('clearHeardAlbumsBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!confirm('Clear recently heard albums list?')) return;
    try { await withButtonFeedback(btn, () => clearHeard('album'), { idle: 'Clear', busy: 'Clearing…', done: 'Cleared ✓' }); }
    catch (e) { status(`Error: ${e.message || e}`); }
  });
  $('clearHeardPlaylistsBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!confirm('Clear recently heard playlists list?')) return;
    try { await withButtonFeedback(btn, () => clearHeard('playlist'), { idle: 'Clear', busy: 'Clearing…', done: 'Cleared ✓' }); }
    catch (e) { status(`Error: ${e.message || e}`); }
  });

  $('saveAliasesBtn')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    try {
      setAliasesSaveNote('');
      await withButtonFeedback(btn, () => saveAliases(), { busy: 'Saving…', done: 'Saved ✓' });
    } catch (e) {
      setAliasesSaveNote(`Save failed: ${e.message || e}`, false);
      status(`Error: ${e.message || e}`);
    }
  });

  document.addEventListener('click', async (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-fix-type]') : null;
    if (!btn) return;
    const type = String(btn.getAttribute('data-fix-type') || '').trim();
    const heard = decodeURIComponent(String(btn.getAttribute('data-heard') || ''));
    if (!heard || heard === '(blank)') return;

    const mapId = type === 'album' ? 'albumAliases' : (type === 'playlist' ? 'playlistAliases' : 'artistAliases');
    const label = type === 'album' ? 'album' : (type === 'playlist' ? 'playlist' : 'artist');
    const map = readAliasMap(mapId);
    const suggested = String(map[aliasKey(heard)] || heard).trim();
    const corrected = window.prompt(`Correct ${label} for "${heard}"`, suggested);
    if (corrected === null) return;
    const out = String(corrected || '').trim();
    if (!out) return;

    map[aliasKey(heard)] = out;
    $(mapId).value = pretty(map);
    try {
      await saveAliases();
      status(`Saved correction: ${heard} → ${out}`);
    } catch (e) {
      status(`Error: ${e.message || e}`);
    }
  });

  load().catch((e) => status(`Error: ${e.message || e}`));
})();
