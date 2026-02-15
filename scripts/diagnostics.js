(() => {
  const $ = (id) => document.getElementById(id);
  const ENDPOINTS = [
    // Playback / art
    { name: 'Now Playing', method: 'GET', path: '/now-playing' },
    { name: 'Next Up', method: 'GET', path: '/next-up' },
    { name: 'Current art (jpg)', method: 'GET', path: '/art/current.jpg' },
    { name: 'Current art 640 (jpg)', method: 'GET', path: '/art/current_640.jpg' },
    { name: 'Blurred bg art 640 (jpg)', method: 'GET', path: '/art/current_bg_640_blur.jpg' },

    // Runtime/config
    { name: 'Runtime config', method: 'GET', path: '/config/runtime' },
    { name: 'Runtime meta', method: 'GET', path: '/config/runtime-meta' },
    { name: 'Queue wizard options', method: 'GET', path: '/config/queue-wizard/options' },
    { name: 'Ratings sticker status', method: 'GET', path: '/config/ratings/sticker-status' },
    { name: 'Ratings sticker backups', method: 'GET', path: '/config/ratings/sticker-backups' },
    { name: 'Library health (sample)', method: 'GET', path: '/config/library-health?sampleLimit=25' },
    { name: 'Diagnostics queue', method: 'GET', path: '/config/diagnostics/queue' },

    // Helper POST checks
    { name: 'Runtime check env (POST)', method: 'POST', path: '/config/runtime/check-env', body: { mpdHost: '', mpdPort: 6600, sshHost: '', sshUser: 'moode', paths: {} } },
    { name: 'Alexa domain check (POST)', method: 'POST', path: '/config/alexa/check-domain', body: { domain: '' } },
  ];

  function setPillState(pillId, state){
    const map = { ok:{c:'#22c55e',b:'rgba(34,197,94,.55)'}, warn:{c:'#f59e0b',b:'rgba(245,158,11,.55)'}, bad:{c:'#ef4444',b:'rgba(239,68,68,.55)'}, off:{c:'#64748b',b:'rgba(100,116,139,.45)'} };
    const s = map[state] || map.off;
    const pill = $(pillId); if (!pill) return;
    const dot = pill.querySelector('.dot');
    if (dot) { dot.style.background = s.c; dot.style.boxShadow = `0 0 0 6px ${s.b.replace('.55','.20')}`; }
    pill.style.borderColor = s.b;
  }

  function apiBaseDefault(){
    const host = location.hostname || '10.0.0.233';
    return `${location.protocol}//${host}:3101`;
  }

  function applyLiveZoom(){
    const BASE_W = 1920;
    const BASE_H = 1080;
    const z = Number($('liveZoom')?.value || 55);
    const scale = Math.max(0.35, Math.min(1, z / 100));
    const wrap = $('liveFrameScaleWrap');
    const label = $('liveZoomLabel');
    const viewport = $('liveFrameViewport');
    if (wrap) {
      wrap.style.transform = `scale(${scale})`;
      wrap.style.width = `${Math.round(BASE_W * scale)}px`;
      wrap.style.height = `${Math.round(BASE_H * scale)}px`;
    }
    if (viewport) viewport.style.minHeight = `${Math.round(BASE_H * scale) + 16}px`;
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
  }

  function refreshLiveFrame(uiPort = 8101){
    const host = location.hostname || '10.0.0.233';
    const proto = location.protocol || 'http:';
    const url = `${proto}//${host}:${uiPort}/index.html`;
    const fr = $('liveFrame');
    const a = $('openLiveLink');
    if (fr) fr.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    if (a) a.href = url;
    applyLiveZoom();
  }

  async function loadRuntime(){
    const host = location.hostname || '10.0.0.233';
    try {
      const r = await fetch(`${apiBaseDefault()}/config/runtime`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error('runtime unavailable');
      const cfg = j.config || {};
      const apiPort = Number(cfg?.ports?.api || 3101);
      const uiPort = Number(cfg?.ports?.ui || 8101);
      const base = `${location.protocol}//${host}:${apiPort}`;
      $('apiBase').value = base;
      $('key').value = String(cfg?.trackKey || '').trim();
      $('apiHint').textContent = `${host}:${apiPort}`;
      $('webHint').textContent = `${host}:${uiPort}`;
      const axEnabled = !!cfg?.alexa?.enabled;
      const axDomain = String(cfg?.alexa?.publicDomain || '').trim();
      $('alexaHint').textContent = !axEnabled ? 'disabled' : (axDomain || 'missing domain');
      setPillState('apiPill','ok'); setPillState('webPill','ok'); setPillState('alexaPill', !axEnabled ? 'off' : (axDomain ? 'ok' : 'warn'));
      refreshLiveFrame(uiPort);
      loadQueue();
    } catch {
      $('apiBase').value = apiBaseDefault();
      $('apiHint').textContent = $('apiBase').value.replace(/^https?:\/\//,'');
      $('webHint').textContent = `${host}:8101`;
      $('alexaHint').textContent = 'unknown';
      setPillState('apiPill','bad'); setPillState('webPill','warn'); setPillState('alexaPill','warn');
      refreshLiveFrame(8101);
      loadQueue();
    }
  }

  function updateShuffleBtn(randomOn){
    const btn = $('shuffleBtn');
    if (!btn) return;
    if (typeof randomOn === 'boolean') {
      btn.textContent = `Shuffle: ${randomOn ? 'On' : 'Off'}`;
      btn.style.borderColor = randomOn ? '#22c55e' : '';
    } else {
      btn.textContent = 'Shuffle: ?';
      btn.style.borderColor = '';
    }
  }

  async function sendPlayback(action, extra = null, opts = null){
    const base = String($('apiBase').value || apiBaseDefault()).replace(/\/$/,'');
    const key = String($('key').value || '').trim();
    const payload = Object.assign({ action }, extra || {});
    const refreshQueue = opts?.refreshQueue !== false;
    const r = await fetch(`${base}/config/diagnostics/playback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-track-key': key },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    if (typeof j?.randomOn === 'boolean') updateShuffleBtn(j.randomOn);
    $('status').textContent = `Playback: ${action}`;
    if (refreshQueue) await loadQueue();
    return j;
  }

  function starsHtml(file, rating){
    const f = encodeURIComponent(String(file || ''));
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let out = '<div style="display:flex;gap:2px;align-items:center;">';
    for (let i = 1; i <= 5; i += 1) {
      const on = i <= r;
      out += `<button type="button" data-rate-file="${f}" data-rate-val="${i}" title="Rate ${i} star${i>1?'s':''}" style="padding:0 2px;border:0;background:transparent;font-size:15px;line-height:1;color:${on?'#fbbf24':'#5b6780'};cursor:pointer;">★</button>`;
    }
    out += '</div>';
    return out;
  }

  async function loadQueue(){
    const base = String($('apiBase').value || apiBaseDefault()).replace(/\/$/,'');
    const key = String($('key').value || '').trim();
    const wrap = $('queueWrap');
    if (!wrap) return;
    wrap.innerHTML = 'Loading queue…';
    try {
      const r = await fetch(`${base}/config/diagnostics/queue`, { headers: { 'x-track-key': key } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (typeof j?.randomOn === 'boolean') updateShuffleBtn(j.randomOn);
      const items = Array.isArray(j.items) ? j.items : [];
      if (!items.length) { wrap.innerHTML = '<div class="muted">Queue is empty.</div>'; return; }
      wrap.innerHTML = items.slice(0, 80).map((x) => {
        const thumbSrc = x.thumbUrl ? (String(x.thumbUrl).startsWith('http') ? String(x.thumbUrl) : `${base}${x.thumbUrl}`) : '';
        const thumb = thumbSrc ? `<img src="${thumbSrc}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #2a3a58;background:#111;" />` : '<div style="width:36px;height:36px"></div>';
        const head = !!x.isHead;
        const pos = Number(x.position || 0);
        const stars = starsHtml(x.file, Number(x.rating || 0));
        return `<div style="display:flex;gap:8px;align-items:center;padding:6px 6px;border-bottom:1px dashed #233650;${head?'background:rgba(34,197,94,.15);border-radius:8px;':''}">${thumb}<div style="min-width:0;flex:1 1 auto;"><div><b>${String(x.position||0)}</b>. ${head?'▶️ ':''}${String(x.artist||'')}</div><div class="muted">${String(x.title||'')} ${x.album?`• ${String(x.album)}`:''}</div><div style="margin-top:2px;">${stars}</div></div><button type="button" data-remove-pos="${pos}" style="margin-left:auto;">Remove</button></div>`;
      }).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="muted">Queue load failed: ${e?.message || e}</div>`;
    }
  }

  function hydrateEndpoints(){
    const sel = $('endpoint');
    sel.innerHTML = ENDPOINTS.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');
    const apply = () => {
      const e = ENDPOINTS[Number(sel.value) || 0];
      $('method').value = e.method;
      $('path').value = e.path;
      $('body').value = JSON.stringify(e.body || {}, null, 2);
      $('bodyWrap').style.display = (e.method === 'POST') ? '' : 'none';
    };
    sel.addEventListener('change', apply);
    $('method').addEventListener('change', () => $('bodyWrap').style.display = ($('method').value === 'POST') ? '' : 'none');
    apply();
  }

  async function run(){
    const base = String($('apiBase').value || apiBaseDefault()).replace(/\/$/,'');
    const path = String($('path').value || '').trim();
    const method = String($('method').value || 'GET');
    const useKey = !!$('useTrackKey').checked;
    const key = String($('key').value || '').trim();
    const out = $('out');
    const st = $('status');
    const meta = $('meta');
    const imageWrap = $('imageWrap');
    const imageOut = $('imageOut');

    if (!path) return;
    const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
    const headers = {};
    if (useKey && key) headers['x-track-key'] = key;
    let body;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      try { body = JSON.stringify(JSON.parse($('body').value || '{}')); }
      catch (e) { out.textContent = `Invalid JSON body: ${e.message}`; return; }
    }

    st.innerHTML = '<span class="spin"></span>Running…';
    if (imageWrap) imageWrap.style.display = 'none';
    if (imageOut) imageOut.removeAttribute('src');
    $('meta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const t0 = performance.now();
    try {
      const r = await fetch(url, { method, headers, body });
      const ms = Math.round(performance.now() - t0);
      const ctype = String(r.headers.get('content-type') || '').toLowerCase();

      if (ctype.startsWith('image/')) {
        const blob = await r.blob();
        const objUrl = URL.createObjectURL(blob);
        if (imageOut) imageOut.src = objUrl;
        if (imageWrap) imageWrap.style.display = '';
        out.textContent = `[image response: ${ctype}, ${blob.size} bytes]`;
      } else {
        const txt = await r.text();
        let parsed = null;
        try { parsed = txt ? JSON.parse(txt) : null; } catch {}
        out.textContent = parsed ? JSON.stringify(parsed, null, 2) : txt;
      }

      meta.textContent = `${method} ${url}  •  HTTP ${r.status}  •  ${ms} ms`;
      st.textContent = r.ok ? 'Done.' : 'Completed with errors.';
    } catch (e) {
      meta.textContent = `${method} ${url}`;
      out.textContent = `Request failed: ${e?.message || e}`;
      st.textContent = 'Request failed.';
    }
  }

  $('runBtn').addEventListener('click', () => run());
  $('reloadLiveBtn')?.addEventListener('click', () => loadRuntime());
  $('liveZoom')?.addEventListener('input', applyLiveZoom);
  $('reloadQueueBtn')?.addEventListener('click', () => loadQueue());
  $('queueWrap')?.addEventListener('click', (ev) => {
    const el = ev.target instanceof Element ? ev.target : null;
    const rateBtn = el ? el.closest('button[data-rate-file][data-rate-val]') : null;
    if (rateBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const encFile = String(rateBtn.getAttribute('data-rate-file') || '');
      const file = decodeURIComponent(encFile || '');
      const rating = Number(rateBtn.getAttribute('data-rate-val') || 0);
      if (!file || !Number.isFinite(rating) || rating < 0 || rating > 5) return;

      const row = rateBtn.closest('div');
      if (row) {
        const stars = row.querySelectorAll('button[data-rate-file][data-rate-val]');
        stars.forEach((s) => {
          const v = Number(s.getAttribute('data-rate-val') || 0);
          s.style.color = v <= rating ? '#fbbf24' : '#5b6780';
        });
      }

      rateBtn.disabled = true;
      sendPlayback('rate', { file, rating }, { refreshQueue: false })
        .then(() => { $('status').textContent = `Rated: ${rating} star${rating===1?'':'s'}`; })
        .catch((e) => { $('status').textContent = String(e?.message || e); })
        .finally(() => { rateBtn.disabled = false; });
      return;
    }

    const btn = el ? el.closest('button[data-remove-pos]') : null;
    if (!btn) return;
    const pos = Number(btn.getAttribute('data-remove-pos') || 0);
    if (!Number.isFinite(pos) || pos <= 0) return;
    btn.disabled = true;
    sendPlayback('remove', { position: pos })
      .then(() => { $('status').textContent = `Removed track at position ${pos}`; })
      .catch((e) => { $('status').textContent = String(e?.message || e); })
      .finally(() => { btn.disabled = false; });
  });
  $('playBtn')?.addEventListener('click', () => sendPlayback('play').catch((e)=>$('status').textContent=String(e?.message||e)));
  $('pauseBtn')?.addEventListener('click', () => sendPlayback('pause').catch((e)=>$('status').textContent=String(e?.message||e)));
  $('shuffleBtn')?.addEventListener('click', () => sendPlayback('shuffle').catch((e)=>$('status').textContent=String(e?.message||e)));
  $('prevBtn')?.addEventListener('click', () => sendPlayback('prev').catch((e)=>$('status').textContent=String(e?.message||e)));
  $('nextBtn')?.addEventListener('click', () => sendPlayback('next').catch((e)=>$('status').textContent=String(e?.message||e)));
  async function copyResponse(){
    try { await navigator.clipboard.writeText($('out').textContent || ''); $('status').textContent = 'Response copied.'; }
    catch { $('status').textContent = 'Copy failed.'; }
  }

  $('copyBtn').addEventListener('click', copyResponse);
  $('copyBtnCard')?.addEventListener('click', copyResponse);

  hydrateEndpoints();
  loadRuntime();
})();
