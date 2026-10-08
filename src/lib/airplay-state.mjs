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
