(() => {
  const $ = (id) => document.getElementById(id);
  const status = $('status');
  const results = $('results');
  const count = $('count');
  let lastTracks = [];
  let moodeHost = '10.0.0.254';
  let previewTimer = null;

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function selectedValues(sel){ return Array.from(sel?.selectedOptions || []).map(o => o.value); }
  function defaultApiBase(){
    if (location.protocol === 'http:' || location.protocol === 'https:') return `${location.protocol}//${location.hostname}:3101`;
    return 'http://10.0.0.233:3101';
  }
  function setOptions(el, arr){ el.innerHTML = (arr||[]).map(v => `<option>${esc(v)}</option>`).join(''); }

  function renderFiltersSummary(){
    const host = $('filtersSummary');
    if (!host) return;
    const genres = selectedValues($('genres'));
    const artists = selectedValues($('artists'));
    const excludes = selectedValues($('excludeGenres'));
    const stars = Number($('minRating')?.value || 0);
    const maxTracks = Number($('maxTracks')?.value || 250);
    const savePlaylist = !!$('savePlaylist')?.checked;
    const playlistName = $('playlistName')?.value?.trim() || '';
    const starsTxt = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'Any';
    const fmt = (arr) => arr.length ? arr.map(esc).join(', ') : 'Any';
    host.innerHTML = `Genres: ${fmt(genres)} · Artists: ${fmt(artists)} · Excluding: ${fmt(excludes)} · Min rating: ${esc(starsTxt)} · Max: ${Number(maxTracks).toLocaleString()} · Save playlist: ${savePlaylist ? `Yes (${esc(playlistName || 'unnamed')})` : 'No'}`;
  }

  function updatePlaylistUi(){
    const savePlaylist = !!$('savePlaylist')?.checked;
    const opts = $('playlistOptions');
    const collage = $('generateCollage');
    const hint = $('playlistHint');
    const name = $('playlistName')?.value?.trim() || '';

    if (opts) opts.classList.toggle('hidden', !savePlaylist);
    if (collage && !savePlaylist) collage.checked = false;

    if (hint) {
      if (!savePlaylist) hint.textContent = '';
      else if (collage?.checked && !name) hint.textContent = 'Playlist name is required to generate a cover.';
      else hint.textContent = '';
    }

    refreshCoverPreview();
  }

  async function loadOptions(){
    const apiBase = $('apiBase').value.trim().replace(/\/$/, '');
    const key = $('key').value.trim();
    status.innerHTML = '<span class="spin"></span>Loading options…';
    try {
      const r = await fetch(`${apiBase}/config/queue-wizard/options`, { headers: { 'x-track-key': key } });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOptions($('genres'), j.genres || []);
      setOptions($('excludeGenres'), j.genres || []);
      setOptions($('artists'), j.artists || []);
      const ex = $('excludeGenres');
      if (ex) {
        Array.from(ex.options).forEach((opt) => {
          opt.selected = /^christmas$/i.test(String(opt.value || '').trim());
        });
      }
      moodeHost = String(j.moodeHost || moodeHost || '10.0.0.254');
      renderFiltersSummary();
      status.textContent = '';
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  function schedulePreview(delayMs = 200){
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { doPreview(); }, delayMs);
  }

  async function doPreview(){
    const apiBase = $('apiBase').value.trim().replace(/\/$/, '');
    const key = $('key').value.trim();
    renderFiltersSummary();
    status.innerHTML = '<span class="spin"></span>Previewing…';
    try {
      const body = {
        genres: selectedValues($('genres')),
        artists: selectedValues($('artists')),
        excludeGenres: selectedValues($('excludeGenres')),
        minRating: Number($('minRating')?.value || 0),
        maxTracks: Number($('maxTracks').value || 250),
      };
      const r = await fetch(`${apiBase}/config/queue-wizard/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-track-key': key }, body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const doShuffle = !!$('shuffle')?.checked;
      const tracks = Array.isArray(j.tracks) ? j.tracks.slice() : [];
      if (doShuffle) shuffleInPlace(tracks);
      lastTracks = tracks.map(t => t.file);
      count.textContent = `Matched ${Number(tracks.length || 0).toLocaleString()} track(s)${doShuffle ? ' (preview shuffled)' : ''}.`;
      const rows = tracks.slice(0, 500).map(t => `<tr><td>${esc(t.artist)}</td><td>${esc(t.title)}</td><td>${esc(t.album)}</td><td>${esc(t.genre)}</td></tr>`).join('');
      results.innerHTML = rows ? `<table><thead><tr><th>Artist</th><th>Title</th><th>Album</th><th>Genre</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="muted">No matches.</div>';
      status.textContent = 'Preview ready.';
      refreshCoverPreview('If a collage cover exists, it is shown here.');
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  function shuffleInPlace(arr){
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function refreshCoverPreview(note = ''){
    const savePlaylist = !!$('savePlaylist')?.checked;
    const name = $('playlistName')?.value?.trim() || '';
    const wants = !!$('generateCollage')?.checked && savePlaylist;
    const card = $('coverCard');
    const img = $('coverPreview');
    const txt = $('coverStatus');
    if (!wants || !name) {
      if (card) card.style.display = 'none';
      return;
    }
    if (card) card.style.display = '';
    const url = `http://${moodeHost}/imagesw/playlist-covers/${encodeURIComponent(name)}.jpg?t=${Date.now()}`;
    if (img) img.src = url;
    if (txt) txt.textContent = note || `Cover preview for playlist “${name}”`;
  }

  async function doApply(){
    if (!lastTracks.length) {
      await doPreview();
      if (!lastTracks.length) { status.textContent = 'No tracks to send.'; return; }
    }
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'replace';
    const doShuffle = !!$('shuffle')?.checked;
    const savePlaylist = !!$('savePlaylist')?.checked;
    const playlistName = savePlaylist ? ($('playlistName')?.value?.trim() || '') : '';
    const wantsCollage = !!$('generateCollage')?.checked;

    if (wantsCollage && !playlistName) {
      status.textContent = 'Playlist name is required when generating a cover.';
      $('playlistHint').textContent = 'Playlist name is required to generate a cover.';
      return;
    }
    if (mode === 'replace') {
      const ok = confirm('Replace current queue with previewed tracks?');
      if (!ok) return;
    }
    const apiBase = $('apiBase').value.trim().replace(/\/$/, '');
    const key = $('key').value.trim();
    status.innerHTML = '<span class="spin"></span>Sending queue…';
    try {
      const tracksToSend = lastTracks.slice();
      const r = await fetch(`${apiBase}/config/queue-wizard/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-track-key': key },
        body: JSON.stringify({ mode, tracks: tracksToSend, playlistName, shuffle: doShuffle, generateCollage: wantsCollage })
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      status.textContent = `Sent: added ${j.added}/${j.requested}${doShuffle ? ' · shuffled' : ''}${j.playStarted ? ' · playing' : ''}${j.randomTurnedOff ? ' · random off' : ''}${j.playlistSaved ? ' · playlist saved' : ''}${j.collageGenerated ? ' · collage generated' : ''}${j.playlistError ? ` · playlist error: ${j.playlistError}` : ''}${j.collageError ? ` · collage error: ${j.collageError}` : ''}`;
      refreshCoverPreview(j.collageGenerated ? 'Collage generated from current playlist.' : 'If a cover exists, it is shown here.');
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  $('apiBase').value = defaultApiBase();
  $('apply').addEventListener('click', doApply);
  $('playlistName')?.addEventListener('input', () => { updatePlaylistUi(); renderFiltersSummary(); schedulePreview(); });
  $('generateCollage')?.addEventListener('change', () => { updatePlaylistUi(); renderFiltersSummary(); });

  ['genres','artists','excludeGenres','minRating','maxTracks','shuffle','apiBase','key'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => { renderFiltersSummary(); schedulePreview(); });
    if (el.tagName === 'INPUT') el.addEventListener('input', () => { renderFiltersSummary(); schedulePreview(); });
  });

  document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', () => { renderFiltersSummary(); schedulePreview(); }));
  $('savePlaylist')?.addEventListener('change', () => { updatePlaylistUi(); renderFiltersSummary(); schedulePreview(); });

  updatePlaylistUi();
  renderFiltersSummary();
  loadOptions();
})();