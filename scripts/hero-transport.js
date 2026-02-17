(() => {
  const $ = (id) => document.getElementById(id);
  const host = location.hostname;
  const apiPort = (location.port === '8101') ? '3101' : '3000';
  const apiBase = `${location.protocol}//${host}:${apiPort}`;

  function icon(name) {
    if (name === 'play') return '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    if (name === 'pause') return '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
    if (name === 'prev') return '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3 6 9-6v12z"/></svg>';
    if (name === 'next') return '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM7 18V6l9 6z"/></svg>';
    if (name === 'repeat') return '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H6a3 3 0 0 0-3 3v3h2V8a1 1 0 0 1 1-1zm10 10H7v-3l-4 4 4 4v-3h11a3 3 0 0 0 3-3v-3h-2v2a1 1 0 0 1-1 1z"/></svg>';
    if (name === 'shuffle') return '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M24.414,16.586L30.828,23l-6.414,6.414l-2.828-2.828L23.172,25H22c-3.924,0-6.334-2.289-8.173-4.747c0.987-1.097,1.799-2.285,2.516-3.36C18.109,19.46,19.521,21,22,21h1.172l-1.586-1.586L24.414,16.586z M22,11h1.172l-1.586,1.586l2.828,2.828L30.828,9l-6.414-6.414l-2.828,2.828L23.172,7H22c-5.07,0-7.617,3.82-9.664,6.891C10.224,17.059,8.788,19,6,19H2v4h4c5.07,0,7.617-3.82,9.664-6.891C17.776,12.941,19.212,11,22,11z M10.212,15.191c0.399-0.539,1.957-2.848,2.322-3.365C10.917,10.216,8.86,9,6,9H2v4h4C7.779,13,9.007,13.797,10.212,15.191z"/></svg>';
    return '';
  }

  let runtimeTrackKey = '';
  let runtimeKeyAttempted = false;

  function currentKey() {
    return String($('key')?.value || '').trim() || runtimeTrackKey;
  }

  async function ensureRuntimeKey() {
    if (runtimeKeyAttempted || currentKey()) return;
    runtimeKeyAttempted = true;
    try {
      const r = await fetch(`${apiBase}/config/runtime`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      const k = String(j?.config?.trackKey || '').trim();
      if (k) runtimeTrackKey = k;
    } catch {}
  }

  async function playback(action, key, payload = {}) {
    const r = await fetch(`${apiBase}/config/diagnostics/playback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-track-key': key } : {}) },
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadQueueState(key) {
    const r = await fetch(`${apiBase}/config/diagnostics/queue`, { headers: key ? { 'x-track-key': key } : {} });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadNowPlaying(key) {
    const r = await fetch(`${apiBase}/now-playing`, { headers: key ? { 'x-track-key': key } : {} });
    if (!r.ok) return {};
    return await r.json().catch(() => ({}));
  }

  function render(el, q, np = {}) {
    const items = Array.isArray(q?.items) ? q.items : [];
    const head = items.find((x) => !!x?.isHead) || items[0] || null;
    const state = String(q?.playbackState || '').toLowerCase();
    const pp = state === 'playing' ? 'pause' : 'play';
    const randomOn = !!q?.randomOn;
    const repeatOn = !!q?.repeatOn;

    const npArt = String(np?.albumArtUrl || np?.altArtUrl || np?.stationLogoUrl || '').trim();
    const headArt = String(head?.thumbUrl || '').trim();
    const rawThumb = npArt || headArt;
    const thumb = rawThumb
      ? (rawThumb.startsWith('http') ? rawThumb : `${apiBase}${rawThumb}`)
      : '';

    const displayArtist = String(np?._radioDisplay?.artist || np?.radioArtist || np?.artist || head?.artist || '').trim();
    const displayTitle = String(np?._radioDisplay?.title || np?.radioTitle || np?.title || head?.title || '').trim();
    const text = (displayArtist || displayTitle)
      ? `${displayArtist}${displayArtist && displayTitle ? ' • ' : ''}${displayTitle}`
      : 'Nothing playing';
    const appleUrl = String(np?.radioItunesUrl || np?.itunesUrl || np?.radioAppleMusicUrl || '').trim();
    const isLibraryTrack = !np?.isStream && !np?.isRadio && !np?.isPodcast;
    const rating = Math.max(0, Math.min(5, Number(np?.rating ?? head?.rating ?? 0) || 0));
    const ratingFile = String(np?.ratingFile || np?.file || head?.file || '').trim();
    const starsRow = (isLibraryTrack && ratingFile)
      ? `<div class="heroRating" aria-label="Rating">${[1,2,3,4,5].map((i)=>`<button type="button" class="heroRateStar ${i<=rating?'on':'off'}" data-hero-rate-file="${encodeURIComponent(ratingFile)}" data-hero-rate-val="${i}" title="Rate ${i} star${i>1?'s':''}">★</button>`).join('')}</div>`
      : '';

    const radioAlbum = String(np?.radioAlbum || np?.album || '').trim();
    const radioYear = String(np?.radioYear || np?.year || '').trim();
    const albumYearText = [radioAlbum, radioYear].filter(Boolean).join(' • ');
    const metaRow = starsRow || (albumYearText ? `<div class="heroSubline">${albumYearText}</div>` : '');

    const elapsed = Number(np?.elapsed ?? q?.elapsed ?? q?.elapsedSec ?? head?.elapsed ?? head?.elapsedSec ?? 0);
    const duration = Number(np?.duration ?? q?.duration ?? q?.durationSec ?? head?.duration ?? head?.durationSec ?? 0);
    const showProgress = Number.isFinite(duration) && duration > 0;
    const progressPct = showProgress ? Math.max(0, Math.min(100, (elapsed / duration) * 100)) : 0;

    el.innerHTML =
      `<div class="heroArt">${thumb ? `<img src="${thumb}" alt="">` : '<div class="heroArtPh"></div>'}</div>` +
      `<div class="heroMain">` +
        `<div class="np">` +
          (appleUrl
            ? `<a class="txt txtLink" href="${appleUrl}" target="_blank" rel="noopener noreferrer" title="Open in Apple Music">${text}</a>`
            : `<div class="txt">${text}</div>`) +
          `${metaRow}` +
          `<div class="heroTransportControls">` +
            `<button class="tbtn ${repeatOn ? 'on' : ''}" data-a="repeat" title="Repeat">${icon('repeat')}</button>` +
            `<button class="tbtn" data-a="previous" title="Previous">${icon('prev')}</button>` +
            `<button class="tbtn tbtnBig" data-a="${pp}" title="${pp}">${icon(pp)}</button>` +
            `<button class="tbtn" data-a="next" title="Next">${icon('next')}</button>` +
            `<button class="tbtn ${randomOn ? 'on' : ''}" data-a="shuffle" title="Shuffle">${icon('shuffle')}</button>` +
          `</div>` +
          `<div class="progress-bar-wrapper${showProgress ? '' : ' is-hidden'}"><div class="progress-fill" style="transform:scaleX(${progressPct / 100})"></div></div>` +
        `</div>` +
      `</div>`;
  }

  function renderShell(el, status = 'loading') {
    const msg = status === 'unavailable' ? 'Now Playing · unavailable' : 'Now Playing · loading…';
    el.innerHTML =
      `<div class="heroArt"><div class="heroArtPh"></div></div>` +
      `<div class="heroMain">` +
        `<div class="np">` +
          `<div class="txt">${msg}</div>` +
          `<div class="heroTransportControls">` +
            `<button class="tbtn" disabled title="Repeat">${icon('repeat')}</button>` +
            `<button class="tbtn" disabled title="Previous">${icon('prev')}</button>` +
            `<button class="tbtn tbtnBig" disabled title="Play">${icon('play')}</button>` +
            `<button class="tbtn" disabled title="Next">${icon('next')}</button>` +
            `<button class="tbtn" disabled title="Shuffle">${icon('shuffle')}</button>` +
          `</div>` +
          `<div class="progress-bar-wrapper is-hidden"><div class="progress-fill" style="transform:scaleX(0)"></div></div>` +
        `</div>` +
      `</div>`;
  }

  function init() {
    const el = $('heroTransport');
    if (!el) return;
    let busy = false;

    const refresh = async () => {
      try {
        await ensureRuntimeKey();
        const key = currentKey();
        const [q, np] = await Promise.all([
          loadQueueState(key),
          loadNowPlaying(key),
        ]);
        render(el, q, np);
        try { window.dispatchEvent(new CustomEvent('heroTransport:update', { detail: { q, np } })); } catch {}
      } catch {
        renderShell(el, 'unavailable');
      }
    };

    renderShell(el, 'loading');

    el.addEventListener('click', async (ev) => {
      const rateBtn = ev.target instanceof Element ? ev.target.closest('button[data-hero-rate-file][data-hero-rate-val]') : null;
      if (rateBtn && !busy) {
        ev.preventDefault();
        const file = decodeURIComponent(String(rateBtn.getAttribute('data-hero-rate-file') || ''));
        const rating = Number(rateBtn.getAttribute('data-hero-rate-val') || 0);
        if (!file || !Number.isFinite(rating) || rating < 0 || rating > 5) return;

        // Optimistic UI update: fill immediately on click.
        const row = rateBtn.closest('.heroRating');
        if (row) {
          row.querySelectorAll('.heroRateStar[data-hero-rate-val]').forEach((s) => {
            const v = Number(s.getAttribute('data-hero-rate-val') || 0);
            s.classList.toggle('on', v <= rating);
            s.classList.toggle('off', v > rating);
          });
        }

        busy = true;
        try { await playback('rate', currentKey(), { file, rating }); } catch {}
        await refresh();
        busy = false;
        return;
      }

      const btn = ev.target instanceof Element ? ev.target.closest('button[data-a]') : null;
      if (!btn || busy) return;
      busy = true;
      const action = String(btn.getAttribute('data-a') || '').trim().toLowerCase();
      try { await playback(action, currentKey()); } catch {}
      await refresh();
      busy = false;
    });

    setTimeout(refresh, 150);
    setInterval(refresh, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
