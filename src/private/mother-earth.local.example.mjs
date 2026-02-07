// Copy this file to: src/private/mother-earth.local.mjs
// Keep that file private (gitignored).

export function matchStation(currentFile) {
  // Return a station descriptor object when currentFile matches your private station.
  // Example:
  // if (/my_private_station/i.test(String(currentFile || ''))) {
  //   return { key: 'my-private-station', sourceLabel: 'My Station', hiresLabel: '24/192' };
  // }
  return null;
}

export async function fetchMeta(entry, { fetch }) {
  // Fetch + normalize your private metadata payload here.
  // Return null if unavailable.
  // Return shape:
  // {
  //   trackKey: string,
  //   artist: string,
  //   title: string,
  //   album: string,
  //   art: string,
  //   elapsed: number,
  //   duration: number,
  //   is_request: boolean,
  // }
  void entry;
  void fetch;
  return null;
}
