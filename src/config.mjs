import path from 'node:path';
import { loadConfigOrNull } from './config/load-config.mjs';

export const MASTER_CONFIG = loadConfigOrNull();

const apiNode = (MASTER_CONFIG?.nodes || []).find(n => n?.role === 'api' || n?.role === 'both') || null;
const apiIp = String(apiNode?.ip || '').trim() || null;
const alexaEnabledFromConfig = MASTER_CONFIG?.alexa?.enabled;
const publicDomainFromConfig = String(MASTER_CONFIG?.alexa?.publicDomain || '').trim();
const notificationsCfg = MASTER_CONFIG?.notifications || {};
const mpdCfg = MASTER_CONFIG?.mpd || {};
const moodeCfg = MASTER_CONFIG?.moode || {};
const runtimeCfg = MASTER_CONFIG?.runtime || {};

export const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
export const CURL = process.env.CURL || '/usr/bin/curl';

export const MPD_PLAYLIST_DIR = '/var/lib/mpd/playlists';
export const FAVORITES_PATH = `${MPD_PLAYLIST_DIR}/Favorites.m3u`;
export const MOODE_SSH_USER = process.env.MOODE_SSH_USER || moodeCfg?.sshUser || 'moode';
export const MOODE_SSH_HOST = process.env.MOODE_SSH_HOST || moodeCfg?.sshHost || mpdCfg?.host || '10.0.0.254';
export const PORT = Number(process.env.PORT || MASTER_CONFIG?.ports?.api || '3000');

export const MOODE_BASE_URL = process.env.MOODE_BASE_URL || moodeCfg?.baseUrl || `http://${MOODE_SSH_HOST}`;

export const LOCAL_ADDRESS = process.env.LOCAL_ADDRESS || apiIp || '10.0.0.233';

export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  runtimeCfg?.publicBaseUrl ||
  ((alexaEnabledFromConfig ?? true) && publicDomainFromConfig ? `https://${publicDomainFromConfig}` : '') ||
  `http://${LOCAL_ADDRESS}:${PORT}`;

export const MPD_HOST = process.env.MPD_HOST || mpdCfg?.host || MOODE_SSH_HOST || '10.0.0.254';
export const MPD_PORT = Number(process.env.MPD_PORT || mpdCfg?.port || '6600');

export const MOODE_USB_PREFIX =
  process.env.MOODE_USB_PREFIX ||
  (MASTER_CONFIG?.paths?.moodeUsbMount
    ? `USB/${String(MASTER_CONFIG.paths.moodeUsbMount).split('/').filter(Boolean).slice(-1)[0] || 'SamsungMoode'}/`
    : 'USB/SamsungMoode/');
export const PI4_MOUNT_BASE = process.env.PI4_MOUNT_BASE || MASTER_CONFIG?.paths?.piMountBase || '/mnt/SamsungMoode';
export const MUSIC_LIBRARY_ROOT = process.env.MUSIC_LIBRARY_ROOT || MASTER_CONFIG?.paths?.musicLibraryRoot || '/var/lib/mpd/music';

export const METAFLAC = process.env.METAFLAC || '/usr/bin/metaflac';

export const TRACK_KEY = process.env.TRACK_KEY || MASTER_CONFIG?.trackKey || '1029384756';
export const ENABLE_ALEXA =
  process.env.ENABLE_ALEXA != null
    ? String(process.env.ENABLE_ALEXA).trim() === '1'
    : Boolean(alexaEnabledFromConfig ?? true);
export const TRANSCODE_TRACKS = String(process.env.TRANSCODE_TRACKS || '0').trim() === '1';
export const TRACK_CACHE_DIR = process.env.TRACK_CACHE_DIR || runtimeCfg?.trackCacheDir || '/tmp/moode-track-cache';

export const FAVORITES_PLAYLIST_NAME = process.env.FAVORITES_PLAYLIST_NAME || 'Favorites';
export const FAVORITES_REFRESH_MS = Number(process.env.FAVORITES_REFRESH_MS || '3000');

export const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
export const ITUNES_COUNTRY = 'us';
export const ITUNES_TIMEOUT_MS = Number(process.env.ITUNES_TIMEOUT_MS || '2500');
export const ITUNES_TTL_HIT_MS = 1000 * 60 * 60 * 12;
export const ITUNES_TTL_MISS_MS = 1000 * 60 * 10;

export const ART_CACHE_DIR = process.env.ART_CACHE_DIR || runtimeCfg?.artCacheDir || '/tmp/now-playing/art-cache';
export const ART_CACHE_LIMIT = Number(process.env.ART_CACHE_LIMIT || runtimeCfg?.artCacheLimit || '250');

export const ART_640_PATH = path.join(ART_CACHE_DIR, 'current_640.jpg');
export const ART_BG_PATH = path.join(ART_CACHE_DIR, 'current_bg_640_blur.jpg');
export const PODCAST_DL_LOG = process.env.PODCAST_DL_LOG || '/tmp/now-playing/podcasts/downloads.ndjson';

export const MOODE_SSH = process.env.MOODE_SSH || `${MOODE_SSH_USER}@${MOODE_SSH_HOST}`;
export const FAVORITES_M3U = process.env.FAVORITES_M3U || '/var/lib/mpd/playlists/Favorites.m3u';

// Optional track-start push notifications (Pushover)
export const TRACK_NOTIFY_ENABLED =
  process.env.TRACK_NOTIFY_ENABLED != null
    ? /^(1|true|yes|on)$/i.test(String(process.env.TRACK_NOTIFY_ENABLED).trim())
    : Boolean(notificationsCfg?.trackNotify?.enabled ?? false);

export const TRACK_NOTIFY_POLL_MS = Number(
  process.env.TRACK_NOTIFY_POLL_MS || notificationsCfg?.trackNotify?.pollMs || 3000
);

export const TRACK_NOTIFY_DEDUPE_MS = Number(
  process.env.TRACK_NOTIFY_DEDUPE_MS || notificationsCfg?.trackNotify?.dedupeMs || 15000
);

export const TRACK_NOTIFY_ALEXA_MAX_AGE_MS = Number(
  process.env.TRACK_NOTIFY_ALEXA_MAX_AGE_MS || notificationsCfg?.trackNotify?.alexaMaxAgeMs || 21600000
);

export const PUSHOVER_TOKEN = String(
  process.env.PUSHOVER_TOKEN || notificationsCfg?.pushover?.token || ''
).trim();

export const PUSHOVER_USER_KEY = String(
  process.env.PUSHOVER_USER_KEY || notificationsCfg?.pushover?.userKey || ''
).trim();
