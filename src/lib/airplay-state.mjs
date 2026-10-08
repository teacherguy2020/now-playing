export function isAirplayCurrentSong(song = {}) {
  const file = String(song?.file || '').trim().toLowerCase();
  const encoded = String(song?.encoded || '').trim().toLowerCase();
  return file === 'airplay active' || encoded === 'airplay';
}

export function mergeMoodeAirplaySong(mpdSong = {}, moodeSong = {}) {
  return {
    ...mpdSong,
    artist: '',
    title: '',
    album: '',
    ...moodeSong,
    file: 'AirPlay Active',
    encoded: 'AirPlay',
  };
}

export function isFreshAirplayMetadata(lastModified, sessionStartedAt, now = Date.now()) {
  const modifiedAt = Date.parse(String(lastModified || ''));
  const sessionAt = Number(sessionStartedAt);
  if (!Number.isFinite(modifiedAt) || !Number.isFinite(sessionAt) || sessionAt <= 0) return false;
  return modifiedAt >= sessionAt - 5000 && modifiedAt <= Number(now) + 5000;
}
