/*
 * Small, origin-local preference store for installed controller clients.
 *
 * This intentionally stores presentation preferences only. Credentials and
 * server configuration belong in the server-side config flow, not here.
 */
(() => {
  const STORAGE_KEY = 'nowplaying.clientSettings.v1';
  const VERSION = 1;
  const LEGACY_PROFILE_KEYS = [
    'nowplaying.mobile.profile.v2',
    'nowplaying.mobile.profile.v1',
  ];
  const LEGACY_WAKE_LOCK_KEY = 'nowplaying.keepDisplayAwake.v1';
  const LEGACY_LIBRARY_PAGE_KEYS = [
    'np.controller.lastLibraryPage.v2',
    'np.controller.lastLibraryPage.v1',
  ];

  const DEFAULTS = {
    version: VERSION,
    clientId: '',
    controllerProfile: {},
    displayMode: '',
    playerMode: '',
    outputPreference: '',
    localPlayback: false,
    webStreamAutoMuteAlsa: false,
    webStreamStopMpd: false,
    wakeLock: false,
    lastLibraryPage: '',
    app: {},
  };

  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readString(key) {
    try {
      return String(localStorage.getItem(key) || '').trim();
    } catch {
      return '';
    }
  }

  function createClientId() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID();
      if (crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    } catch {}
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalize(value) {
    const source = isObject(value) ? value : {};
    const profile = isObject(source.controllerProfile) ? source.controllerProfile : {};
    const app = isObject(source.app) ? source.app : {};
    return {
      ...DEFAULTS,
      ...source,
      version: VERSION,
      clientId: String(source.clientId || createClientId()),
      controllerProfile: { ...profile },
      displayMode: String(source.displayMode || ''),
      playerMode: String(source.playerMode || ''),
      outputPreference: String(source.outputPreference || ''),
      localPlayback: source.localPlayback === true,
      webStreamAutoMuteAlsa: source.webStreamAutoMuteAlsa === true,
      webStreamStopMpd: source.webStreamStopMpd === true,
      wakeLock: source.wakeLock === true,
      lastLibraryPage: String(source.lastLibraryPage || ''),
      app: { ...app },
    };
  }

  function readLegacyProfile() {
    for (const key of LEGACY_PROFILE_KEYS) {
      const value = readJson(key);
      if (isObject(value)) return value;
    }
    return {};
  }

  function readLegacyLibraryPage() {
    for (const key of LEGACY_LIBRARY_PAGE_KEYS) {
      const value = readString(key);
      if (value) return value;
    }
    return '';
  }

  function readLegacyAppPreferences() {
    const app = {};
    const tokens = readJson('nowplaying.themeTokens.v1');
    const presets = readJson('nowplaying.themePresets.v1');
    if (isObject(tokens) && Object.keys(tokens).length) app.themeTokens = tokens;
    if (isObject(presets) && Object.keys(presets).length) app.themePresets = presets;
    const strings = {
      themeMode: 'np-theme',
      themeActivePreset: 'nowplaying.themeActivePreset.v1',
      peppySkin: 'peppy.skin',
      peppyTheme: 'peppy.theme',
      playerSize: 'player.profile.size',
      heroQueueCollapsed: 'nowplaying.app.heroQueueCollapsed',
      heroArrowKeys: 'nowplaying.app.arrowKeysEnabled',
      heroQueueMinRating: 'nowplaying.app.queueMinRating',
    };
    for (const [name, key] of Object.entries(strings)) {
      const value = readString(key);
      if (value) app[name] = value;
    }
    return app;
  }

  function mergeMissingAppPreferences(target, legacy) {
    let changed = false;
    for (const [key, value] of Object.entries(legacy || {})) {
      const current = target[key];
      const emptyObject = isObject(current) && Object.keys(current).length === 0;
      if (!(key in target) || current === '' || current === null || current === undefined || emptyObject) {
        target[key] = value;
        changed = true;
      }
    }
    return changed;
  }

  function migrate() {
    const existing = readJson(STORAGE_KEY);
    if (isObject(existing) && Number(existing.version) === VERSION) {
      const normalized = normalize(existing);
      let changed = normalized.clientId !== existing.clientId
        || mergeMissingAppPreferences(normalized.app, readLegacyAppPreferences());
      if (!normalized.playerMode) {
        const legacyPlayerMode = readString('np.peppyMode');
        if (legacyPlayerMode) { normalized.playerMode = legacyPlayerMode; changed = true; }
      }
      if (!normalized.displayMode) {
        const legacyDisplayMode = readString('np.screenMode');
        if (legacyDisplayMode) { normalized.displayMode = legacyDisplayMode; changed = true; }
      }
      if (!normalized.lastLibraryPage) {
        const legacyLibraryPage = readLegacyLibraryPage();
        if (legacyLibraryPage) { normalized.lastLibraryPage = legacyLibraryPage; changed = true; }
      }
      if (changed) writeJson(STORAGE_KEY, normalized);
      return normalized;
    }

    const legacyProfile = readLegacyProfile();
    const migrated = normalize({
      controllerProfile: legacyProfile,
      wakeLock: readString(LEGACY_WAKE_LOCK_KEY) === '1',
      lastLibraryPage: readLegacyLibraryPage(),
      displayMode: readString('np.screenMode'),
      playerMode: readString('np.peppyMode'),
      app: readLegacyAppPreferences(),
    });
    writeJson(STORAGE_KEY, migrated);
    return migrated;
  }

  let settings = migrate();

  function save(next) {
    settings = normalize(next);
    writeJson(STORAGE_KEY, settings);
    try {
      window.dispatchEvent(new CustomEvent('np-client-settings-change', { detail: { ...settings } }));
    } catch {}
    return settings;
  }

  const api = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    getClientId() {
      return settings.clientId;
    },
    read() {
      return { ...settings, controllerProfile: { ...settings.controllerProfile }, app: { ...settings.app } };
    },
    get(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
    },
    set(key, value) {
      return save({ ...settings, [key]: value });
    },
    update(values) {
      return save({ ...settings, ...(isObject(values) ? values : {}) });
    },
    getControllerProfile(defaults = {}) {
      return { ...(isObject(defaults) ? defaults : {}), ...settings.controllerProfile };
    },
    setControllerProfile(profile) {
      return save({ ...settings, controllerProfile: isObject(profile) ? { ...profile } : {} });
    },
    getApp(key, fallback = null) {
      return Object.prototype.hasOwnProperty.call(settings.app, key) ? settings.app[key] : fallback;
    },
    setApp(key, value) {
      return save({ ...settings, app: { ...settings.app, [key]: value } });
    },
  };

  window.NPClientPreferences = api;
})();
