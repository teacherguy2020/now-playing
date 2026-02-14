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
    } catch {
      $('apiBase').value = apiBaseDefault();
      $('apiHint').textContent = $('apiBase').value.replace(/^https?:\/\//,'');
      $('webHint').textContent = `${host}:8101`;
      $('alexaHint').textContent = 'unknown';
      setPillState('apiPill','bad'); setPillState('webPill','warn'); setPillState('alexaPill','warn');
      refreshLiveFrame(8101);
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
  async function copyResponse(){
    try { await navigator.clipboard.writeText($('out').textContent || ''); $('status').textContent = 'Response copied.'; }
    catch { $('status').textContent = 'Copy failed.'; }
  }

  $('copyBtn').addEventListener('click', copyResponse);
  $('copyBtnCard')?.addEventListener('click', copyResponse);

  hydrateEndpoints();
  loadRuntime();
})();
