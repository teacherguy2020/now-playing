// Display-only radio naming. Provider prefixes are not part of the station
// name shown to listeners; stream URLs and logo aliases remain authoritative.
export function radioDisplayName(value = '') {
  return String(value || '').replace(/^\s*iheart\s+/i, '').trim();
}
