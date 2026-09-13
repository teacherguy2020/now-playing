// Browser-local moOde listener.
// Keep one persistent audio element and start it directly from the user tap.
(() => {
  const STREAM_URL = 'http://10.0.0.254:8000';
  const BUTTON_ID = 'webStreamToggle';

  function installStyles() {
    if (document.getElementById('webStreamStyles')) return;
    const style = document.createElement('style');
    style.id = 'webStreamStyles';
    style.textContent = `
      .webStreamToggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
      .webStreamToggle .webStreamIcon{font-size:15px;line-height:1}
      .webStreamToggle.is-on{border-color:#55c98a !important;box-shadow:0 0 0 1px rgba(85,201,138,.28) inset;color:#b9ffd8 !important}
      .webStreamToggle.is-busy{opacity:.72;cursor:wait}
      .webStreamSpinner{width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:webStreamSpin .7s linear infinite}
      @keyframes webStreamSpin{to{transform:rotate(360deg)}}
      .webStreamMobileAction,.webStreamComputerAction{position:relative;display:flex;justify-content:center;margin:8px 0}
      .webStreamMobileAction .webStreamToggle,.webStreamComputerAction .webStreamToggle{border:1px solid rgba(160,180,220,.35);border-radius:8px;padding:7px 12px;background:rgba(12,22,40,.78);color:#dbe7ff;font:inherit;cursor:pointer}
      .tabletActionBar{gap:6px !important;justify-content:flex-end !important}
      .tabletTopCards{grid-template-columns:minmax(0,1.15fr) minmax(240px,1fr) !important}
      .tabletActionBar .queuePos{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis}
      .tabletActionBar .webStreamToggle{padding:5px 7px;font-size:12px;flex:0 1 auto}
      .tabletActionBar #tabletAudioInfoBtn{padding:5px 7px;font-size:12px;flex:0 0 auto}
      .webStreamDebugAudio{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
      .webStreamStatus{position:absolute;left:0;top:calc(100% + 4px);z-index:20;max-width:min(360px,calc(100vw - 28px));padding:5px 8px;border:1px solid rgba(160,180,220,.35);border-radius:7px;background:rgba(8,14,26,.94);color:#dbe7ff;font-size:12px;line-height:1.25;white-space:normal;box-shadow:0 6px 18px rgba(0,0,0,.35)}
      .webStreamErrorModal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.68)}
      .webStreamErrorCard{width:min(420px,100%);padding:20px;border:1px solid rgba(160,180,220,.45);border-radius:14px;background:#0b111c;color:#f3f6ff;box-shadow:0 12px 36px rgba(0,0,0,.55)}
      .webStreamErrorCard h2{margin:0 0 10px;font-size:18px}
      .webStreamErrorCard p{margin:0 0 16px;color:#c9d7ef;line-height:1.4}
      .webStreamErrorCard button{display:block;margin-left:auto;border:1px solid rgba(160,180,220,.45);border-radius:8px;padding:8px 14px;background:#15233b;color:#f3f6ff;font:inherit}
    `;
    document.head.appendChild(style);
  }

  function init() {
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.dataset.webStreamBound === '1') return;
    button.dataset.webStreamBound = '1';
    installStyles();

    const audio = document.createElement('audio');
    audio.id = 'webStreamAudio';
    audio.className = 'webStreamDebugAudio';
    audio.controls = false;
    audio.preload = 'none';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('crossorigin', 'anonymous');
    document.body.appendChild(audio);

    const log = (...args) => console.log('[Listen on Device]', ...args);
    ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled'].forEach((eventName) => {
      audio.addEventListener(eventName, () => log(`AUDIO ${eventName}`, {
        readyState: audio.readyState,
        networkState: audio.networkState,
        currentSrc: audio.currentSrc,
      }));
    });
    audio.addEventListener('error', () => {
      log('AUDIO error', audio.error);
      showErrorModal(`AUDIO error${audio.error?.code ? ` (code ${audio.error.code})` : ''}. See Safari Web Inspector console.`);
    });

    let statusTimer = 0;
    const setStatus = (message = '') => {
      let status = document.getElementById('webStreamStatus');
      if (!message) {
        status?.remove();
        return;
      }
      if (!status) {
        status = document.createElement('div');
        status.id = 'webStreamStatus';
        status.className = 'webStreamStatus';
        button.parentElement?.appendChild(status);
      }
      status.textContent = message;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => status?.remove(), 5000);
    };
    const showErrorModal = (message) => {
      document.getElementById('webStreamErrorModal')?.remove();
      const modal = document.createElement('div');
      modal.id = 'webStreamErrorModal';
      modal.className = 'webStreamErrorModal';
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `<div class="webStreamErrorCard"><h2>Webstream diagnostic</h2><p>${String(message || '')}</p><button type="button">Dismiss</button></div>`;
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelector('button')?.addEventListener('click', close);
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    };
    const paint = (state = 'off') => {
      const on = state === 'on';
      const busy = state === 'busy';
      button.classList.toggle('is-on', on);
      button.classList.toggle('is-busy', busy);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
      button.disabled = false;
      button.innerHTML = busy
        ? '<span class="webStreamSpinner" aria-hidden="true"></span><span>Connecting</span>'
        : `<span class="webStreamIcon" aria-hidden="true">🎧</span><span>${on ? 'Playing on Device' : 'Listen on Device'}</span>`;
    };

    audio.addEventListener('playing', () => {
      paint('on');
      setStatus('Playing on this device');
    });
    audio.addEventListener('pause', () => {
      if (!audio.currentSrc) paint('off');
    });

    button.addEventListener('click', () => {
      if (!audio.paused) {
        log('STOP requested');
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        paint('off');
        return;
      }

      // Critical diagnostic path: no async work before play().
      paint('busy');
      log('CLICK; assigning direct source', STREAM_URL);
      audio.src = STREAM_URL;
      const playPromise = audio.play();
      log('play() returned', playPromise);
      playPromise.then(() => {
        log('play() RESOLVED');
        paint('on');
        setStatus('Playing on Device');
      }).catch((error) => {
        log('play() REJECTED', error.name, error.message, error);
        paint('off');
        const detail = [error?.name, error?.message].filter(Boolean).join(': ');
        setStatus(`Webstream unavailable${detail ? ` (${detail})` : ''}`);
        showErrorModal(`play() rejected${detail ? `: ${detail}` : ''}. See Safari Web Inspector console.`);
      });
    });
    paint('off');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
