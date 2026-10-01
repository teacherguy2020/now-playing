import crypto from 'node:crypto';

function digest(secret, input) {
  const key = String(secret || '');
  if (!key) throw new Error('mobile playlist ID secret is not configured');
  return crypto.createHmac('sha256', key).update(String(input)).digest('base64url').slice(0, 32);
}

export function normalizeMobilePlaylistName(value) {
  return String(value || '').trim();
}

export function normalizeMobilePlaylistFiles(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim())
    : [];
}

export function createMobilePlaylistId({ secret, name } = {}) {
  const normalizedName = normalizeMobilePlaylistName(name);
  if (!normalizedName) throw new Error('mobile playlist name is required');
  return `pl_${digest(secret, `now-playing-mobile-playlist-v1:${normalizedName}`)}`;
}

export function createMobilePlaylistRevision({ secret, name, files } = {}) {
  const normalizedName = normalizeMobilePlaylistName(name);
  if (!normalizedName) throw new Error('mobile playlist name is required');
  const normalizedFiles = normalizeMobilePlaylistFiles(files);
  const payload = JSON.stringify({ name: normalizedName, files: normalizedFiles });
  return `rev_${digest(secret, `now-playing-mobile-playlist-revision-v1:${payload}`)}`;
}
