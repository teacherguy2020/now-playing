import path from 'node:path';

export const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
export const CURL = process.env.CURL || '/usr/bin/curl';

export const MPD_PLAYLIST_DIR = '/var/lib/mpd/playlists';
export const FAVORITES_PATH = `${MPD_PLAYLIST_DIR}/Favorites.m3u`;
export const MOODE_SSH_USER = process.env.MOODE_SSH_USER || 'moode';
export const MOODE_SSH_HOST = process.env.MOODE_SSH_HOST || '10.0.0.254';
export const PORT = Number(process.env.PORT || '3000');

export const MOODE_BASE_URL = process.env.MOODE_BASE_URL || 'http://10.0.0.254';
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://moode.brianwis.com';

export const LOCAL_ADDRESS = process.env.LOCAL_ADDRESS || '10.0.0.233';

export const MPD_HOST = process.env.MPD_HOST || '10.0.0.254';
export const MPD_PORT = Number(process.env.MPD_PORT || '6600');

export const MOODE_USB_PREFIX = process.env.MOODE_USB_PREFIX || 'USB/SamsungMoode/';
export const PI4_MOUNT_BASE = process.env.PI4_MOUNT_BASE || '/mnt/SamsungMoode';

export const METAFLAC = process.env.METAFLAC || '/usr/bin/metaflac';

export const TRACK_KEY = process.env.TRACK_KEY || '1029384756';
export const ENABLE_ALEXA = String(process.env.ENABLE_ALEXA || '1').trim() === '1';
export const TRANSCODE_TRACKS = String(process.env.TRANSCODE_TRACKS || '0').trim() === '1';
export const TRACK_CACHE_DIR = process.env.TRACK_CACHE_DIR || '/tmp/moode-track-cache';

export const FAVORITES_PLAYLIST_NAME = process.env.FAVORITES_PLAYLIST_NAME || 'Favorites';
export const FAVORITES_REFRESH_MS = Number(process.env.FAVORITES_REFRESH_MS || '3000');

export const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
export const ITUNES_COUNTRY = 'us';
export const ITUNES_TIMEOUT_MS = Number(process.env.ITUNES_TIMEOUT_MS || '2500');
export const ITUNES_TTL_HIT_MS = 1000 * 60 * 60 * 12;
export const ITUNES_TTL_MISS_MS = 1000 * 60 * 10;

export const ART_CACHE_DIR = process.env.ART_CACHE_DIR || '/home/brianwis/album_art/art';
export const ART_CACHE_LIMIT = Number(process.env.ART_CACHE_LIMIT || '250');

export const ART_640_PATH = path.join(ART_CACHE_DIR, 'current_640.jpg');
export const ART_BG_PATH = path.join(ART_CACHE_DIR, 'current_bg_640_blur.jpg');
export const PODCAST_DL_LOG = '/home/brianwis/album_art/podcasts/downloads.ndjson';

export const MOODE_SSH = process.env.MOODE_SSH || 'moode@10.0.0.254';
export const FAVORITES_M3U = process.env.FAVORITES_M3U || '/var/lib/mpd/playlists/Favorites.m3u';
