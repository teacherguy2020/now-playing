(() => {
  const $ = (id) => document.getElementById(id);
  const host = location.hostname;
  const apiPort = (location.port === '8101') ? '3101' : '3000';
  const apiBase = `${location.protocol}//${host}:${apiPort}`;

  function escHtml(v = '') {
    return String(v || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function expandInstrumentAbbrevs(input) {
    let s = String(input || '');
    if (!s) return s;

    // Targeted classical metadata shorthand: ", h;" -> ", harp;"
    s = s.replace(/,\s*h(?=\s*(?:[;,)\]]|\-|$))/gi, ', harp');

    const reps = [
      ['vc', 'cello'], ['db', 'double bass'], ['cb', 'double bass'], ['p', 'piano'], ['hp', 'harp'],
      ['ob', 'oboe'], ['eh', 'english horn'], ['cl', 'clarinet'], ['bcl', 'bass clarinet'], ['fl', 'flute'], ['f', 'flute'],
      ['hn', 'horn'], ['fh', 'horn'], ['tpt', 'trumpet'], ['tp', 'trumpet'], ['tbn', 'trombone'],
      ['tb', 'trombone'], ['tba', 'tuba'], ['perc', 'percussion'], ['timp', 'timpani'], ['vln', 'violin'],
      ['vn', 'violin'], ['vla', 'viola'], ['va', 'viola'], ['sop', 'soprano'], ['mez', 'mezzo-soprano'],
      ['ten', 'tenor'], ['bar', 'baritone'], ['bs', 'bass'],
    ];
    for (const [abbr, full] of reps) {
      const re = new RegExp(`(^|[\\s,;])${abbr}(?=\\s*(?:[;,)\\]]|\\-|$))`, 'gi');
      s = s.replace(re, `$1${full}`);
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  }

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
  let runtimeKeyLastAttemptMs = 0;
  const motionArtCache = new Map();
  const localMotionCache = new Map();
  const MOTION_ART_STORAGE_KEY = 'nowplaying.ui.motionArtEnabled';
  let lastMotionIdentity = '';
  let lastMotionMp4 = '';
  let lastMotionFile = '';
  let lastKnownNowFile = '';
  let lastKnownSongId = '';
  let lastVisibleMotionSrc = '';
  let lastVisibleMotionFile = '';
  let lastMotionTrackKey = '';
  let lastRenderedTrackKey = '';
  const motionLockByTrack = new Map();

  function currentKey() {
    return String($('key')?.value || '').trim() || runtimeTrackKey;
  }

  async function ensureRuntimeKey() {
    if (currentKey()) return;
    const now = Date.now();
    if (runtimeKeyLastAttemptMs && (now - runtimeKeyLastAttemptMs) < 3000) return;
    runtimeKeyLastAttemptMs = now;
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

  async function loadAlexaWasPlaying() {
    try {
      const r = await fetch(`${apiBase}/alexa/was-playing?maxAgeMs=21600000`, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch {
      return null;
    }
  }

  function normalizeAppleMusicUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
      const u = new URL(s);
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return s.split('?')[0].split('#')[0];
    }
  }

  function stripUrlNoise(s) {
    if (!s) return '';
    try {
      const u = new URL(s, window.location.href);
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return String(s).split('?')[0].split('#')[0];
    }
  }

  function canonicalMediaSrc(s) {
    const clean = stripUrlNoise(s);
    if (!clean) return '';
    try {
      const u = new URL(clean, window.location.href);
      return `${u.origin}${u.pathname}`;
    } catch {
      return clean;
    }
  }

  function motionArtEnabled() {
    try {
      const v = String(localStorage.getItem(MOTION_ART_STORAGE_KEY) || '').trim().toLowerCase();
      if (!v) return true;
      return !(['0', 'false', 'off', 'no'].includes(v));
    } catch {
      return true;
    }
  }

  function motionTrackKey(file = '', songid = '') {
    const f = String(file || '').trim();
    if (f) return `f:${f}`;
    const s = String(songid || '').trim();
    if (s) return `s:${s}`;
    return '';
  }

  async function resolveLocalMotionMp4(artist, album, key) {
    const a = String(artist || '').trim();
    const b = String(album || '').trim();
    const k = `${a.toLowerCase()}|${b.toLowerCase()}`;
    if (!a || !b) return '';
    if (localMotionCache.has(k)) return String(localMotionCache.get(k) || '');
    try {
      const url = `${apiBase}/config/library-health/animated-art/lookup?artist=${encodeURIComponent(a)}&album=${encodeURIComponent(b)}`;
      const r = await fetch(url, { headers: key ? { 'x-track-key': key } : {} });
      const j = await r.json().catch(() => ({}));
      const mp4 = String(j?.hit?.mp4 || '').trim();
      localMotionCache.set(k, mp4);
      return mp4;
    } catch {
      localMotionCache.set(k, '');
      return '';
    }
  }

  async function resolveMotionMp4(appleUrl) {
    const normalized = normalizeAppleMusicUrl(appleUrl);
    if (!normalized) return '';
    const cached = motionArtCache.get(normalized);
    if (cached?.state === 'ready') return String(cached.mp4 || '');
    if (cached?.state === 'none') return '';
    if (cached?.state === 'pending' && cached.promise) return cached.promise;

    const p = (async () => {
      try {
        const endpoint = `https://api.aritra.ovh/v1/covers?url=${encodeURIComponent(normalized)}`;
        const r = await fetch(endpoint, { cache: 'force-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json().catch(() => ({}));
        const square = Array.isArray(j?.master_Streams?.square) ? j.master_Streams.square : [];
        const list = square.filter((x) => String(x?.uri || '').includes('.m3u8'));
        if (!list.length) {
          motionArtCache.set(normalized, { state: 'none' });
          return '';
        }

        // Prefer mid/high square sizes (avoid huge 2k+ assets by default).
        const preferred = list
          .map((x) => ({
            uri: String(x?.uri || ''),
            width: Number(x?.width || 0),
            bw: Number(x?.bandwidth || 0),
          }))
          .filter((x) => x.uri)
          .sort((a, b) => (a.width - b.width) || (a.bw - b.bw));
        const choice = preferred.filter((x) => x.width >= 700 && x.width <= 1200).slice(-1)[0] || preferred.slice(-1)[0];
        const mp4 = String(choice?.uri || '').replace(/\.m3u8(?:\?.*)?$/i, '-.mp4');
        if (!mp4 || mp4 === choice.uri) {
          motionArtCache.set(normalized, { state: 'none' });
          return '';
        }
        motionArtCache.set(normalized, { state: 'ready', mp4 });
        return mp4;
      } catch {
        motionArtCache.set(normalized, { state: 'none' });
        return '';
      }
    })();

    motionArtCache.set(normalized, { state: 'pending', promise: p });
    return p;
  }

  function updateHeroDynamic(el, q, np = {}) {
    const state = String(q?.playbackState || '').toLowerCase();
    const pp = state === 'playing' ? 'pause' : 'play';
    const randomOn = !!q?.randomOn;
    const repeatOn = !!q?.repeatOn;

    const big = el.querySelector('.heroTransportControls .tbtnBig');
    if (big) {
      big.classList.toggle('on', state === 'playing');
      big.setAttribute('data-a', pp);
      big.setAttribute('title', pp);
      big.innerHTML = icon(pp);
      if (state === 'playing') big.style.setProperty('--spin-delay', `-${Date.now() % 5600}ms`);
      else big.style.removeProperty('--spin-delay');
    }
    const shuf = el.querySelector('.heroTransportControls .tbtnFar[data-a="shuffle"]');
    if (shuf) shuf.classList.toggle('on', randomOn);
    const rep = el.querySelector('.heroTransportControls .tbtnFar[data-a="repeat"]');
    if (rep) rep.classList.toggle('on', repeatOn);

    const isRadioOrStream = !!np?.isRadio || !!np?.isStream;
    const elapsed = Number(np?.elapsed ?? q?.elapsed ?? q?.elapsedSec ?? 0);
    const duration = Number(np?.duration ?? q?.duration ?? q?.durationSec ?? 0);
    const showProgress = !isAlexaMode && !isRadioOrStream && Number.isFinite(duration) && duration > 0;
    const pct = showProgress ? Math.max(0, Math.min(100, (elapsed / duration) * 100)) : 0;
    const bar = el.querySelector('.progress-bar-wrapper');
    if (bar) {
      bar.classList.toggle('is-hidden', !showProgress);
      bar.setAttribute('data-seekable', showProgress ? '1' : '0');
      const fill = bar.querySelector('.progress-fill');
      if (fill) fill.style.transform = `scaleX(${pct / 100})`;
      const handle = bar.querySelector('.progress-handle');
      if (handle) handle.style.left = `${pct}%`;
      const tip = bar.querySelector('.progress-tip');
      if (tip) tip.style.left = `${pct}%`;
    }
  }

  function render(el, q, np = {}) {
    const prevVid = el.querySelector('.heroArtVid');
    const prevVidSrc = prevVid ? String(prevVid.currentSrc || prevVid.src || '').trim() : '';
    const prevVidTime = prevVid ? Number(prevVid.currentTime || 0) : 0;

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
    const motionMp4 = String(np?._motionMp4 || '').trim();

    const isAlexaMode = !!np?.alexaMode;
    const isRadioOrStream = !!np?.isRadio || !!np?.isStream || !!head?.isStream || isAlexaMode;
    let displayArtist = String(np?._radioDisplay?.artist || np?.radioArtist || np?.artist || head?.artist || '').trim();
    let displayTitle = String(np?._radioDisplay?.title || np?.radioTitle || np?.title || head?.title || '').trim();
    if (!displayTitle) {
      const fileRaw = String(np?.file || head?.file || '').trim();
      const base = fileRaw ? fileRaw.split('/').pop() || '' : '';
      const noExt = base.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
      if (noExt) displayTitle = noExt;
    }

    if (isRadioOrStream) {
      const isGenericArtist = /^(radio\s*station|unknown|stream)$/i.test(displayArtist);
      const lookupReason = String(np?.radioLookupReason || '').toLowerCase();

      if (isGenericArtist && lookupReason.includes('talk-news-sports')) {
        displayArtist = 'Talk radio';
      }

      // Avoid "Radio station • Radio station ..." duplication.
      if (isGenericArtist) {
        displayTitle = displayTitle.replace(/^radio\s*station\s*/i, '').trim();
      }

      if (!isAlexaMode) {
        // If iTunes album text got echoed into title, trim it from the end.
        const radioAlbumForTrim = String(np?.radioAlbum || np?.album || '').trim();
        if (radioAlbumForTrim) {
          const esc = radioAlbumForTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          displayTitle = displayTitle.replace(new RegExp(`([\\s,;:-]*)${esc}$`, 'i'), '').trim();
        }

        // Strip trailing year-like tails from title (year is shown separately when needed).
        displayTitle = displayTitle.replace(/[\s•\-–—,;:]*((19|20)\d{2})\s*$/i, '').trim();
      }
    }

    displayArtist = expandInstrumentAbbrevs(displayArtist);
    displayTitle = expandInstrumentAbbrevs(displayTitle);

    const text = (displayArtist || displayTitle)
      ? `${displayArtist}${displayArtist && displayTitle ? ' • ' : ''}${displayTitle}`
      : 'Nothing playing';
    const appleUrl = String(np?.radioItunesUrl || np?.itunesUrl || np?.radioAppleMusicUrl || '').trim();
    const isPodcast = !!np?.isPodcast;
    const isLibraryTrack = ((!np?.isStream && !np?.isRadio && !isPodcast) || isAlexaMode);
    const modalAlbum = String(np?.album || head?.album || '').trim();
    const modalArtist = String(np?.artist || head?.artist || '').trim();
    const modalArtRaw = String(np?.albumArtUrl || np?.altArtUrl || head?.thumbUrl || '').trim();
    const modalArt = modalArtRaw ? (modalArtRaw.startsWith('http') ? modalArtRaw : `${apiBase}${modalArtRaw}`) : '';
    const canOpenAlbumModal = !appleUrl && isLibraryTrack && !isRadioOrStream && !!modalAlbum;
    const rating = Math.max(0, Math.min(5, Number(np?.rating ?? head?.rating ?? 0) || 0));
    const ratingFile = String(np?.ratingFile || np?.file || head?.file || '').trim();
    const starsRow = (isLibraryTrack && ratingFile)
      ? `<div class="heroRating" aria-label="Rating">${[1,2,3,4,5].map((i)=>`<button type="button" class="heroRateStar ${i<=rating?'on':'off'}" data-hero-rate-file="${encodeURIComponent(ratingFile)}" data-hero-rate-val="${i}" title="Rate ${i} star${i>1?'s':''}">★</button>`).join('')}</div>`
      : '';

    const radioAlbum = String(np?.radioAlbum || np?.album || '').trim();
    let radioYear = String(np?.radioYear || np?.year || '').trim();
    if (!radioYear && isAlexaMode) {
      const d = String(np?.date || '').trim();
      const m = d.match(/^(\d{4})/);
      if (m) radioYear = m[1];
    }
    const stationNameLive = String(np?._stationName || np?.stationName || np?.radioStationName || head?.stationName || '').trim();
    const airplaySource = String(np?.airplaySource || np?.airplaySourceName || np?.airplaySender || '').trim();
    const isAirplay = !!np?.isAirplay;
    const liveLabel = isAlexaMode
      ? 'Alexa Mode'
      : (isAirplay ? (airplaySource ? `AirPlay • ${airplaySource}` : 'AirPlay') : (stationNameLive || 'Radio'));
    const albumYearText = radioAlbum
      ? `${radioAlbum}${radioYear ? ` (${radioYear})` : ''}`
      : '';
    const metaRow = starsRow || (albumYearText ? `<div class="heroSubline">${albumYearText}</div>` : '');

    const fmt = String(np?.encoded || np?.format || '').toUpperCase();
    const brRaw = String(np?.bitrate || '').trim();
    const brMatch = brRaw.match(/(\d+(?:\.\d+)?)/);
    const kbps = brMatch ? Number(brMatch[1]) : 0;
    const isLossless = /(FLAC|ALAC|WAV|AIFF|PCM)/i.test(fmt);
    const isOpus = /OPUS/i.test(fmt);
    const isMp3Aac = /(MP3|AAC)/i.test(fmt);
    const isHq = isLossless || (isOpus ? kbps >= 128 : (isMp3Aac ? kbps >= 320 : kbps >= 320));
    const liveBadge = isLossless ? 'Lossless' : (isHq ? 'HQ' : '');

    const elapsed = Number(np?.elapsed ?? q?.elapsed ?? q?.elapsedSec ?? head?.elapsed ?? head?.elapsedSec ?? 0);
    const duration = Number(np?.duration ?? q?.duration ?? q?.durationSec ?? head?.duration ?? head?.durationSec ?? 0);
    const showProgress = !isAlexaMode && !isRadioOrStream && Number.isFinite(duration) && duration > 0;
    const progressPct = showProgress ? Math.max(0, Math.min(100, (elapsed / duration) * 100)) : 0;
    const spinPeriodMs = 5600;
    const spinDelayStyle = state === 'playing' ? ` style="--spin-delay:-${Date.now() % spinPeriodMs}ms;"` : '';

    el.innerHTML =
      `<div class="heroArt">${motionMp4
        ? `${thumb ? `<img class="heroArtFallback" src="${thumb}" alt="">` : '<div class="heroArtPh heroArtFallback"></div>'}<video class="heroArtVid" src="${motionMp4}" data-fallback-src="${thumb}" autoplay muted loop playsinline preload="metadata"></video>`
        : (thumb ? `<img src="${thumb}" alt="">` : '<div class="heroArtPh"></div>')}</div>` +
      `<div class="heroMain">` +
        `<div class="np">` +
          (appleUrl
            ? `<a class="txt txtLink" href="${appleUrl}" target="_blank" rel="noopener noreferrer" title="Open in Apple Music">${text}</a>`
            : `<div class="txt"${canOpenAlbumModal ? ` data-hero-open-album="1" data-hero-album="${encodeURIComponent(modalAlbum)}" data-hero-artist="${encodeURIComponent(modalArtist)}" data-hero-art="${encodeURIComponent(modalArt)}" title="Open album" style="cursor:pointer;"` : ''}>${text}</div>`) +
          `${metaRow}` +
          `${isAlexaMode
            ? (`<div class="heroTransportControls" style="margin-top:4px;">` +
                `<button class="tbtn tbtnFar ${randomOn ? 'on' : ''}" data-a="shuffle" title="Random">${icon('shuffle')}</button>` +
              `</div>`)
            : (`<div class="heroTransportControls">` +
                (isPodcast ? `<button class="tbtn tbtnSeek" data-a="seekback15" title="Back 15 seconds"><span style="font-size:13px;font-weight:700;">↺15</span></button>` : '') +
                `<button class="tbtn tbtnFar ${repeatOn ? 'on' : ''}" data-a="repeat" title="Repeat">${icon('repeat')}</button>` +
                `<button class="tbtn tbtnNear" data-a="previous" title="Previous">${icon('prev')}</button>` +
                `<button class="tbtn tbtnBig ${state === 'playing' ? 'on' : ''}" data-a="${pp}" title="${pp}"${spinDelayStyle}>${icon(pp)}</button>` +
                `<button class="tbtn tbtnNear" data-a="next" title="Next">${icon('next')}</button>` +
                `<button class="tbtn tbtnFar ${randomOn ? 'on' : ''}" data-a="shuffle" title="Random">${icon('shuffle')}</button>` +
                (isPodcast ? `<button class="tbtn tbtnSeek" data-a="seekfwd30" title="Forward 30 seconds"><span style="font-size:13px;font-weight:700;">30↻</span></button>` : '') +
              `</div>` )}` +
          `<div class="progress-bar-wrapper${showProgress ? '' : ' is-hidden'}" data-seekable="${showProgress ? '1' : '0'}"><div class="progress-fill" style="transform:scaleX(${progressPct / 100})"></div><div class="progress-handle" style="left:${progressPct}%;"></div><div class="progress-tip" style="left:${progressPct}%">Drag to seek</div></div>` +
          `${(!showProgress && isRadioOrStream) ? `<div class="heroLiveLine" style="order:5;font-size:12px;line-height:1.1;color:#9fb1d9;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-top:6px;">${(state === 'playing' && !isAlexaMode) ? `<span class="heroLivePulse">Live</span> • ` : ''}${escHtml(liveLabel)}${liveBadge ? ` <span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;border:1px solid rgba(251,191,36,.75);color:#fbbf24;background:rgba(251,191,36,.14);font-size:11px;font-weight:700;vertical-align:1px;">${liveBadge}</span>` : ''}</div>` : ''}` +
        `</div>` +
      `</div>`;

    // Preserve motion-video playback position across periodic re-renders.
    try {
      const nextVid = el.querySelector('.heroArtVid');
      if (nextVid && prevVidSrc && prevVidTime > 0.2) {
        const nextSrc = String(nextVid.currentSrc || nextVid.src || '').trim();
        if (nextSrc && nextSrc === prevVidSrc) {
          const seek = () => {
            try {
              if (Number.isFinite(nextVid.duration) && nextVid.duration > 0) {
                nextVid.currentTime = Math.min(prevVidTime, Math.max(0, nextVid.duration - 0.1));
              } else {
                nextVid.currentTime = prevVidTime;
              }
            } catch {}
          };
          if (nextVid.readyState >= 1) seek();
          else nextVid.addEventListener('loadedmetadata', seek, { once: true });
        }
      }
    } catch {}
  }

  function armVideoFallback(el) {
    const vid = el.querySelector('.heroArtVid');
    if (!(vid instanceof HTMLVideoElement)) return;
    const fb = el.querySelector('.heroArtFallback');
    const src = String(vid.currentSrc || vid.src || '').trim();

    // No fallback downgrade path: once motion is present, keep video visible.
    if (fb) fb.style.display = 'none';
    vid.style.display = '';

    try {
      const p = (typeof vid.play === 'function') ? vid.play() : null;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}

    if (src) {
      lastVisibleMotionSrc = src;
      if (lastKnownNowFile) lastVisibleMotionFile = lastKnownNowFile;
      lastMotionMp4 = src;
      if (lastKnownNowFile) lastMotionFile = lastKnownNowFile;
      const k = motionTrackKey(lastKnownNowFile, lastKnownSongId);
      if (k) {
        lastMotionTrackKey = k;
        motionLockByTrack.set(k, src);
        if (motionLockByTrack.size > 100) {
          const firstKey = motionLockByTrack.keys().next().value;
          if (firstKey) motionLockByTrack.delete(firstKey);
        }
      }
    }
  }

  let heroDrawerOpen = false;
  const HERO_FAV_GRID_KEY = 'nowplaying.heroFavGridHtml.v1';
  const HERO_FAV_LAST_KEY = 'nowplaying.heroFavLastStation.v1';
  let heroDrawerGridHtml = (() => {
    try { return String(localStorage.getItem(HERO_FAV_GRID_KEY) || ''); } catch { return ''; }
  })();

  function ensureRadioDrawer() {
    let drawer = document.getElementById('heroRadioDrawer');
    if (drawer) return drawer;

    if (!document.getElementById('heroRadioDrawerStyle')) {
      const st = document.createElement('style');
      st.id = 'heroRadioDrawerStyle';
      st.textContent = `
#heroTransport{position:relative;overflow:visible}
.heroTransportRow{position:relative}
#heroRadioDrawerWrap{position:absolute;right:6px;top:calc(58% - 15px);transform:translateY(-50%);z-index:12;display:flex;align-items:center;transition:transform .18s ease}
#heroRadioDrawerWrap.open{transform:translate(-178px,-50%)}
.heroFavTab{border:1px solid #2a3a58;border-right:0;border-radius:10px 0 0 10px;padding:8px 6px;background:#0f1a31;color:#dbe7ff;cursor:pointer;font-size:12px;line-height:1;writing-mode:vertical-rl;text-orientation:mixed;user-select:none;z-index:13}
.heroFavTab:hover{background:#132241}
#heroRadioDrawer{position:absolute;left:100%;top:0;height:100%;width:168px;background:#0f1a31;border-left:1px solid #2a3a58;box-shadow:-8px 0 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;border-radius:0 10px 10px 0;transform:translateX(-10px);opacity:0;visibility:hidden;pointer-events:none;transition:transform .18s ease,opacity .14s ease,visibility 0s linear .18s}
#heroRadioDrawerWrap.open #heroRadioDrawer{transform:translateX(0);opacity:1;visibility:visible;pointer-events:auto;transition:transform .18s ease,opacity .14s ease}
#heroRadioDrawer .grid{padding:6px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;width:100%}
#heroRadioDrawer .tile{width:100%;aspect-ratio:1/1;border:1px solid #2a3a58;border-radius:7px;background:#0a1222;display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden;cursor:pointer;transition:border-color .12s ease,box-shadow .12s ease,transform .08s ease}
#heroRadioDrawer .tile:hover{border-color:#8bd3ff;box-shadow:0 0 0 1px rgba(139,211,255,.35) inset}
#heroRadioDrawer .tile:active{transform:scale(.97)}
#heroRadioDrawer .tile.isLive{border-color:#22c55e !important;box-shadow:0 0 0 1px rgba(34,197,94,.42) inset, 0 0 12px rgba(34,197,94,.20)}
#heroRadioDrawer .tile img{width:100%;height:100%;object-fit:cover}
#heroTransport .heroMain{transform:translateX(-60px)}
#heroTransport .heroLivePulse{color:#ef4444;animation:heroLivePulse 2.2s ease-in-out infinite}
@keyframes heroLivePulse{0%,100%{opacity:1;text-shadow:0 0 0 rgba(239,68,68,0)}50%{opacity:.45;text-shadow:0 0 10px rgba(239,68,68,.45)}}
`;
      document.head.appendChild(st);
    }

    const host = document.getElementById('heroTransport');

    let wrap = document.getElementById('heroRadioDrawerWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'heroRadioDrawerWrap';
      wrap.innerHTML = `<button type="button" class="heroFavTab" data-a="radio-favs" title="Favorite stations">♥ Favorites</button>`;
      host?.appendChild(wrap);
    }

    drawer = document.createElement('aside');
    drawer.id = 'heroRadioDrawer';
    drawer.innerHTML = `<div class="grid">${heroDrawerGridHtml || ''}</div>`;
    wrap.appendChild(drawer);

    wrap.classList.toggle('open', heroDrawerOpen);
    document.getElementById('heroTransport')?.classList.toggle('hasFavDrawerOpen', heroDrawerOpen);

    return drawer;
  }

  async function loadRadioFavoritesList() {
    const r = await fetch(`${apiBase}/config/queue-wizard/radio-favorites`, { headers: currentKey() ? { 'x-track-key': currentKey() } : {} });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return Array.isArray(j.favorites) ? j.favorites : [];
  }

  async function sendStationToQueue(file, mode = 'append', keepNowPlaying = false, playNow = false) {
    const run = async () => {
      const r = await fetch(`${apiBase}/config/queue-wizard/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(currentKey() ? { 'x-track-key': currentKey() } : {}) },
        body: JSON.stringify({ mode, keepNowPlaying, tracks: [String(file || '')], forceRandomOff: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        const err = new Error(j?.error || `HTTP ${r.status}`);
        err.status = r.status;
        throw err;
      }
      return j;
    };

    let j;
    try {
      j = await run();
    } catch (e) {
      if (Number(e?.status) === 401 || Number(e?.status) === 403) {
        try { await ensureRuntimeKey(); } catch {}
        j = await run();
      } else {
        throw e;
      }
    }

    if (playNow) {
      try {
        await fetch(`${apiBase}/config/diagnostics/playback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(currentKey() ? { 'x-track-key': currentKey() } : {}) },
          body: JSON.stringify({ action: 'play' }),
        });
      } catch {}
    }

    return j;
  }

  async function toggleFavoriteStation(file, favorite) {
    const r = await fetch(`${apiBase}/config/queue-wizard/radio-favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(currentKey() ? { 'x-track-key': currentKey() } : {}) },
      body: JSON.stringify({ station: String(file || ''), favorite: !!favorite }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function openRadioDrawer() {
    const drawer = ensureRadioDrawer();
    const grid = drawer.querySelector('.grid');
    if (!grid) return;
    const wrap = document.getElementById('heroRadioDrawerWrap');
    heroDrawerOpen = true;
    wrap?.classList.add('open');
    document.getElementById('heroTransport')?.classList.add('hasFavDrawerOpen');

    const skeleton = Array.from({ length: 9 }).map(() => '<div class="tile" aria-hidden="true" style="opacity:.25"></div>').join('');
    grid.innerHTML = heroDrawerGridHtml || skeleton;

    try {
      const favs = await loadRadioFavoritesList();
      const top = favs.slice(0, 9);
      let lastPicked = '';
      try { lastPicked = String(localStorage.getItem(HERO_FAV_LAST_KEY) || ''); } catch {}
      const cells = top.map((f) => {
        const file = String(f.file || '');
        const name = String(f.stationName || file || 'Station');
        const logo = `${apiBase}/art/radio-logo.jpg?name=${encodeURIComponent(name)}`;
        const on = lastPicked && file === lastPicked;
        return `<button class="tile ${on ? 'isLive' : ''}" data-station-tile="${encodeURIComponent(file)}" title="${name}"><img src="${logo}" alt="${name}"></button>`;
      });
      while (cells.length < 9) cells.push('<div class="tile" aria-hidden="true" style="opacity:.25"></div>');
      const nextHtml = cells.join('');
      if (nextHtml !== heroDrawerGridHtml) {
        heroDrawerGridHtml = nextHtml;
        try { localStorage.setItem(HERO_FAV_GRID_KEY, heroDrawerGridHtml); } catch {}
        grid.innerHTML = heroDrawerGridHtml;
      }
    } catch {
      // keep last rendered grid/skeleton; avoid flashing error text in drawer
    }
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
            `<button class="tbtn" disabled title="Random">${icon('shuffle')}</button>` +
          `</div>` +
          `<div class="progress-bar-wrapper is-hidden"><div class="progress-fill" style="transform:scaleX(0)"></div></div>` +
        `</div>` +
      `</div>`;
  }

  function init() {
    const el = $('heroTransport');
    if (!el) return;
    let busy = false;
    let lastQ = null;
    let lastNp = null;
    let lastRenderSignature = '';

  function heroMotionDebugEnabled() {
    try {
      const v = String(localStorage.getItem('nowplaying.debug.hero') || '').trim().toLowerCase();
      return ['1', 'true', 'on', 'yes'].includes(v);
    } catch {
      return false;
    }
  }

  function heroMotionLog(...args) {
    if (!heroMotionDebugEnabled()) return;
    try { console.log('[hero-motion]', ...args); } catch {}
  }

    const cloneObj = (v) => {
      try { return JSON.parse(JSON.stringify(v || {})); } catch { return (v && typeof v === 'object') ? { ...v } : {}; }
    };

    const renderOptimistic = (action) => {
      if (!lastQ || !lastNp) return;
      const q = cloneObj(lastQ);
      const np = cloneObj(lastNp);
      const a = String(action || '').toLowerCase();
      if (a === 'play') q.playbackState = 'playing';
      else if (a === 'pause') q.playbackState = 'paused';
      else if (a === 'shuffle') q.randomOn = !q.randomOn;
      else if (a === 'repeat') q.repeatOn = !q.repeatOn;
      else if (a === 'seekback15') {
        const e = Number(np?.elapsed ?? q?.elapsed ?? 0) || 0;
        const n = Math.max(0, e - 15);
        np.elapsed = n; q.elapsed = n;
      } else if (a === 'seekfwd30') {
        const e = Number(np?.elapsed ?? q?.elapsed ?? 0) || 0;
        const d = Number(np?.duration ?? q?.duration ?? 0) || 0;
        const n = d > 0 ? Math.min(d, e + 30) : (e + 30);
        np.elapsed = n; q.elapsed = n;
      }
      render(el, q, np);
      armVideoFallback(el);
      try { ensureRadioDrawer(); } catch {}
    };

    let refreshSeq = 0;
    const refresh = async () => {
      try {
        await ensureRuntimeKey();
        const key = currentKey();
        const [qRes, npRes, awRes] = await Promise.allSettled([
          loadQueueState(key),
          loadNowPlaying(key),
          loadAlexaWasPlaying(),
        ]);

        const q = (qRes.status === 'fulfilled' && qRes.value) ? qRes.value : (lastQ || { items: [], playbackState: '' });
        let np = (npRes.status === 'fulfilled' && npRes.value) ? npRes.value : (lastNp || {});
        const alexaWas = (awRes.status === 'fulfilled') ? awRes.value : null;

        if (!(qRes.status === 'fulfilled' || npRes.status === 'fulfilled' || awRes.status === 'fulfilled')) {
          throw new Error('all refresh sources failed');
        }
        const aw = alexaWas || null;
        const awNp = aw?.nowPlaying || null;
        const awWp = aw?.wasPlaying || null;
        const awActive = !!((awNp && awNp.active) || (awWp && awWp.active));
        const awFresh = !!aw?.fresh;
        const awPayload = (awNp && awNp.file) ? awNp : ((awWp && awWp.file) ? awWp : null);
        if (awFresh && awActive && awPayload) {
          const baseNp = np;
          np = { ...np, ...awPayload, alexaMode: true };
          // Preserve rating context from primary now-playing when Alexa payload lacks it.
          if (!String(np?.ratingFile || '').trim() && String(baseNp?.ratingFile || '').trim()) np.ratingFile = String(baseNp.ratingFile).trim();
          if ((Number(np?.rating || 0) <= 0) && Number(baseNp?.rating || 0) > 0) np.rating = Number(baseNp.rating || 0);
        }

        lastQ = cloneObj(q);
        lastNp = cloneObj(np);
        const seq = ++refreshSeq;

        const appleUrl = String(np?.radioItunesUrl || np?.itunesUrl || np?.radioAppleMusicUrl || '').trim();
        const motionEnabled = motionArtEnabled();
        const isRadioOrStream = !!np?.isRadio || !!np?.isStream;
        const artist = String(np?.artist || '').trim();
        const album = String(np?.album || '').trim();
        const motionIdentity = `${isRadioOrStream ? 'r' : 'l'}|${appleUrl || ''}|${artist}|${album}`;

        const head = (Array.isArray(q?.items) ? (q.items.find((x) => !!x?.isHead) || q.items[0]) : null) || null;
        const currentFile = String(np?.file || head?.file || '').trim();
        const currentSongId = String(np?.songid || head?.songid || '').trim();
        if (currentFile) lastKnownNowFile = currentFile;
        if (currentSongId) lastKnownSongId = currentSongId;
        const effectiveFile = currentFile || lastKnownNowFile;
        const effectiveSongId = currentSongId || lastKnownSongId;
        const effectiveTrackKey = motionTrackKey(effectiveFile, effectiveSongId);

        // Render immediately with cached motion if available; do not block on remote lookup.
        // "Motion is law": if track file is unchanged (or temporarily missing in payload), keep using known-good motion clip.
        let motionMp4 = '';
        const lockedMotion = effectiveTrackKey ? String(motionLockByTrack.get(effectiveTrackKey) || '').trim() : '';
        if (lockedMotion) {
          motionMp4 = lockedMotion;
        } else if (effectiveTrackKey && lastVisibleMotionSrc && effectiveTrackKey === lastMotionTrackKey) {
          motionMp4 = lastVisibleMotionSrc;
        } else if (effectiveFile && lastVisibleMotionSrc && effectiveFile === lastVisibleMotionFile) {
          motionMp4 = lastVisibleMotionSrc;
        } else if (lastMotionMp4 && ((motionIdentity === lastMotionIdentity) || (effectiveFile && effectiveFile === lastMotionFile))) {
          motionMp4 = lastMotionMp4;
        }

        // Hard render guard: if same track key is still active, keep currently visible motion src.
        if (!motionMp4) {
          const liveVid = el.querySelector('.heroArtVid');
          const liveSrc = String(liveVid?.currentSrc || liveVid?.src || '').trim();
          if (liveSrc && effectiveTrackKey && lastRenderedTrackKey && effectiveTrackKey === lastRenderedTrackKey) {
            motionMp4 = liveSrc;
          }
        }

        // If this track previously proved motion, NEVER render static fallback branch.
        const motionLockedForTrack = !!(effectiveTrackKey && (motionLockByTrack.get(effectiveTrackKey) || (effectiveTrackKey === lastMotionTrackKey && lastVisibleMotionSrc)));
        if (motionLockedForTrack && !motionMp4) {
          const fallbackMotion = String(motionLockByTrack.get(effectiveTrackKey) || lastVisibleMotionSrc || '').trim();
          if (fallbackMotion) motionMp4 = fallbackMotion;
        }

        np._motionMp4 = motionMp4;

        const sigIsRadio = !!np?.isRadio || !!np?.isStream || !!head?.isStream;
        const renderSig = JSON.stringify({
          f: String(np?.file || head?.file || ''),
          // For local/static tracks, avoid full hero repaint on late metadata enrichment
          // (prevents one-time art flash a few seconds after page load).
          t: sigIsRadio ? String(np?.title || np?.radioTitle || head?.title || '') : '',
          a: sigIsRadio ? String(np?.artist || np?.radioArtist || head?.artist || '') : '',
          al: sigIsRadio ? String(np?.album || np?.radioAlbum || '') : '',
          art: String((motionLockedForTrack ? '' : (np?.albumArtUrl || np?.altArtUrl || np?.stationLogoUrl || head?.thumbUrl || ''))),
          m: String(motionMp4 || ''),
          r: sigIsRadio,
          p: !!np?.isPodcast,
          x: !!np?.alexaMode,
        });

        if (renderSig !== lastRenderSignature) {
          heroMotionLog('renderSig changed', {
            trackKey: effectiveTrackKey,
            motionLockedForTrack,
            hasMotion: !!motionMp4,
            isAlexaMode: !!np?.alexaMode,
          });
          render(el, q, np);
          armVideoFallback(el);
          lastRenderSignature = renderSig;
        } else {
          // If motion is locked for this track, avoid text-only update path that can repaint static art elsewhere.
          if (!motionLockedForTrack) updateHeroDynamic(el, q, np);
        }
        if (effectiveTrackKey) lastRenderedTrackKey = effectiveTrackKey;

        try { ensureRadioDrawer(); } catch {}
        try { window.dispatchEvent(new CustomEvent('heroTransport:update', { detail: { q, np } })); } catch {}

        // Background motion resolution (non-blocking)
        if (!motionEnabled) return;
        const shouldTryRemoteMotion = !!appleUrl && isRadioOrStream;
        if (motionMp4) {
          heroMotionLog('skip motion resolve (already have motion)', { trackKey: effectiveTrackKey, src: canonicalMediaSrc(motionMp4) });
          return;
        }

        const resolved = shouldTryRemoteMotion
          ? await resolveMotionMp4(appleUrl).catch(() => '')
          : await resolveLocalMotionMp4(artist, album, key).catch(() => '');

        if (seq !== refreshSeq) {
          heroMotionLog('discard stale motion resolve', { trackKey: effectiveTrackKey });
          return; // stale refresh result
        }
        if (!resolved) {
          heroMotionLog('motion resolve miss', { trackKey: effectiveTrackKey, remote: shouldTryRemoteMotion });
          // Do not clear known-good motion on transient lookup misses.
          return;
        }
        heroMotionLog('motion resolved', { trackKey: effectiveTrackKey, src: canonicalMediaSrc(resolved), remote: shouldTryRemoteMotion });

        lastMotionIdentity = motionIdentity;
        lastMotionMp4 = resolved;
        lastMotionFile = effectiveFile;
        if (effectiveTrackKey) {
          lastMotionTrackKey = effectiveTrackKey;
          motionLockByTrack.set(effectiveTrackKey, resolved);
        }

        const liveVid = el.querySelector('.heroArtVid');
        const liveSrc = String(liveVid?.currentSrc || liveVid?.src || '').trim();
        if (liveVid && liveSrc && canonicalMediaSrc(liveSrc) === canonicalMediaSrc(resolved)) {
          // Avoid one-time flash: do not rebuild hero DOM when the same motion clip is already visible.
          try {
            const fb = el.querySelector('.heroArtFallback');
            if (fb) fb.style.display = 'none';
            liveVid.style.display = '';
            const p = (typeof liveVid.play === 'function') ? liveVid.play() : null;
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch {}
          return;
        }

        const npResolved = { ...np, _motionMp4: resolved };
        render(el, q, npResolved);
        armVideoFallback(el);
        const head2 = (Array.isArray(q?.items) ? (q.items.find((x) => !!x?.isHead) || q.items[0]) : null) || null;
        const sig2IsRadio = !!npResolved?.isRadio || !!npResolved?.isStream || !!head2?.isStream;
        lastRenderSignature = JSON.stringify({
          f: String(npResolved?.file || head2?.file || ''),
          t: sig2IsRadio ? String(npResolved?.title || npResolved?.radioTitle || head2?.title || '') : '',
          a: sig2IsRadio ? String(npResolved?.artist || npResolved?.radioArtist || head2?.artist || '') : '',
          al: sig2IsRadio ? String(npResolved?.album || npResolved?.radioAlbum || '') : '',
          art: String(npResolved?.albumArtUrl || npResolved?.altArtUrl || npResolved?.stationLogoUrl || head2?.thumbUrl || ''),
          m: String(resolved || ''),
          r: sig2IsRadio,
          p: !!npResolved?.isPodcast,
          x: !!npResolved?.alexaMode,
        });
        if (effectiveTrackKey) lastRenderedTrackKey = effectiveTrackKey;
        try { ensureRadioDrawer(); } catch {}
      } catch {
        // Never blank a previously good hero card on transient fetch/render failures.
        if (lastQ || lastNp) {
          try {
            render(el, lastQ || { items: [], playbackState: '' }, lastNp || {});
            armVideoFallback(el);
            try { ensureRadioDrawer(); } catch {}
            return;
          } catch {}
        }
        renderShell(el, 'unavailable');
        try { ensureRadioDrawer(); } catch {}
      }
    };

    renderShell(el, 'loading');

    el.addEventListener('click', async (ev) => {
      const albumHit = ev.target instanceof Element ? ev.target.closest('[data-hero-open-album]') : null;
      if (albumHit) {
        ev.preventDefault();
        const album = decodeURIComponent(String(albumHit.getAttribute('data-hero-album') || ''));
        const artist = decodeURIComponent(String(albumHit.getAttribute('data-hero-artist') || ''));
        const art = decodeURIComponent(String(albumHit.getAttribute('data-hero-art') || ''));
        if (album) {
          try {
            window.dispatchEvent(new CustomEvent('openclaw:hero-open-album-modal', { detail: { album, artist, art } }));
          } catch {}
        }
        return;
      }

      const rateBtn = ev.target instanceof Element ? ev.target.closest('button[data-hero-rate-file][data-hero-rate-val]') : null;
      if (rateBtn) {
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
        try { await refresh(); } catch {}
        busy = false;
        return;
      }

      const btn = ev.target instanceof Element ? ev.target.closest('button[data-a]') : null;
      if (!btn || busy) return;
      const action = String(btn.getAttribute('data-a') || '').trim().toLowerCase();
      if (action === 'radio-favs') {
        ev.preventDefault();
        heroDrawerOpen = !heroDrawerOpen;
        document.getElementById('heroRadioDrawerWrap')?.classList.toggle('open', heroDrawerOpen);
        document.getElementById('heroTransport')?.classList.toggle('hasFavDrawerOpen', heroDrawerOpen);
        if (heroDrawerOpen) openRadioDrawer().catch(() => {});
        return;
      }
      renderOptimistic(action);
      busy = true;
      try {
        if (action === 'seekback15') await playback('seekrel', currentKey(), { seconds: -15 });
        else if (action === 'seekfwd30') await playback('seekrel', currentKey(), { seconds: 30 });
        else await playback(action, currentKey());
      } catch {}
      await refresh();
      busy = false;
    });

    ensureRadioDrawer();
    document.addEventListener('click', async (ev) => {
      const tile = ev.target instanceof Element ? ev.target.closest('#heroRadioDrawer button[data-station-tile]') : null;
      if (!tile) return;
      ev.preventDefault();
      ev.stopPropagation();
      const file = decodeURIComponent(String(tile.getAttribute('data-station-tile') || ''));
      if (!file) return;
      try {
        await ensureRuntimeKey();
        try { localStorage.setItem(HERO_FAV_LAST_KEY, file); } catch {}
        tile.classList.add('isLive');
        await sendStationToQueue(file, 'replace', false, true);
        heroDrawerOpen = false;
        document.getElementById('heroRadioDrawerWrap')?.classList.remove('open');
        document.getElementById('heroTransport')?.classList.remove('hasFavDrawerOpen');
        await refresh();
        try { window.dispatchEvent(new CustomEvent('heroTransport:update')); } catch {}
      } catch (e) {
        console.warn('favorite station click failed', e);
      }
    });

    const hostEl = document.getElementById('heroTransport');
    let seeking = false;
    let seekBar = null;
    let seekPct = null;

    const calcSeekPct = (bar, clientX) => {
      const rect = bar.getBoundingClientRect();
      if (!rect.width) return null;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return Math.max(0, Math.min(100, (x / rect.width) * 100));
    };

    const paintSeekPct = (bar, pct) => {
      const fill = bar.querySelector('.progress-fill');
      if (fill) fill.style.transform = `scaleX(${pct / 100})`;
      const handle = bar.querySelector('.progress-handle');
      if (handle) handle.style.left = `${pct}%`;
      const tip = bar.querySelector('.progress-tip');
      if (tip) tip.style.left = `${pct}%`;
    };

    hostEl?.addEventListener('pointerdown', (ev) => {
      const bar = ev.target instanceof Element ? ev.target.closest('.progress-bar-wrapper[data-seekable="1"]') : null;
      if (!bar || busy) return;
      const pct = calcSeekPct(bar, ev.clientX);
      if (pct == null) return;
      seeking = true;
      seekBar = bar;
      seekPct = pct;
      paintSeekPct(bar, pct);
      try { ev.preventDefault(); } catch {}
    });

    hostEl?.addEventListener('pointermove', (ev) => {
      if (!seeking || !seekBar) return;
      const pct = calcSeekPct(seekBar, ev.clientX);
      if (pct == null) return;
      seekPct = pct;
      paintSeekPct(seekBar, pct);
    });

    window.addEventListener('pointerup', async () => {
      if (!seeking) return;
      seeking = false;
      const pct = seekPct;
      seekBar = null;
      seekPct = null;
      if (!Number.isFinite(pct) || busy) return;
      busy = true;
      try { await playback('seekpct', currentKey(), { percent: pct }); } catch {}
      await refresh();
      busy = false;
    });

    setTimeout(refresh, 150);
    setInterval(() => { if (!document.hidden) refresh(); }, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
