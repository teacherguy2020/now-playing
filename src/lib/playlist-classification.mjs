/**
 * Keep playlist classification identical across the web and mobile
 * controllers. Podcast subscriptions are represented in MPD as playlists,
 * but they belong to the separate podcast surface and must not appear in the
 * ordinary music-playlist list.
 */
export function isPodcastPlaylistName(name = '') {
  return /podcast/i.test(String(name || ''));
}

export function isPodcastPlaylistFile(file = '') {
  const value = String(file || '').toLowerCase();
  return /\/podcasts?\//.test(value) || /\bpodcast\b/.test(value);
}

export function isPodcastPlaylist(name = '', files = []) {
  if (isPodcastPlaylistName(name)) return true;
  const rows = Array.isArray(files) ? files.filter(Boolean) : [];
  return rows.length > 0 && rows.every(isPodcastPlaylistFile);
}
