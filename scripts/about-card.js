(function () {
  const state = { enabled: true };

  function apiBase() {
    const host = location.hostname || 'localhost';
    const port = location.port === '8101' ? '3101' : (location.port === '3000' ? '3000' : '');
    return location.protocol + '//' + host + (port ? ':' + port : '');
  }

  function configure(config) {
    state.enabled = config?.features?.showAboutWhenNoPersonnel ?? true;
    return state.enabled;
  }

  async function loadConfig() {
    try {
      const response = await fetch(apiBase() + '/config/runtime', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.config) configure(payload.config);
    } catch {}
    return state.enabled;
  }

  function choose({ data = {}, personnelText = '', aboutOnly = false } = {}) {
    const personnel = String(personnelText || '').trim();
    if (!aboutOnly && personnel) return { kind: 'personnel', text: personnel };
    const about = String(data?.about?.text || '').trim();
    if (state.enabled && data?.aboutStatus === 'available' && about) {
      return { kind: 'about', text: about };
    }
    return { kind: 'fallback', text: aboutOnly ? 'No About available for this track.' : 'No personnel available for this track.' };
  }

  function renderBack({ data = {}, personnelText = '', aboutOnly = false, bodyId = 'npPersonnelBody', titleId = '' } = {}) {
    const body = document.getElementById(bodyId);
    if (!body) return false;
    const choice = choose({ data, personnelText, aboutOnly });
    body.textContent = choice.text;
    const title = document.getElementById(titleId) || body.closest('.personnelCard, .artFaceBack')?.querySelector('.personnelTitle');
    if (title) title.textContent = choice.kind === 'about' || aboutOnly ? 'About' : 'Personnel';
    body.dataset.aboutKind = choice.kind;
    return choice.kind !== 'fallback';
  }

  function renderInline({ data = {}, element, personnelText = '', aboutOnly = false } = {}) {
    if (!element) return false;
    const choice = choose({ data, personnelText: personnelText || element.textContent, aboutOnly });
    if (choice.kind === 'about') {
      element.textContent = choice.text;
      element.dataset.aboutKind = 'about';
      return true;
    }
    return false;
  }

  window.NPAboutCard = { configure, loadConfig, choose, renderBack, renderInline, state };
  loadConfig();
}());
