import { createHash } from 'node:crypto';

export const ANIMATED_ART_CONTRACT_VERSION = 'now-playing-animated-art.v1';

const MAX_TEXT_LENGTH = 240;
const VALID_IDENTITY = /^sha256:[a-f0-9]{24}$/i;

function text(value, max = MAX_TEXT_LENGTH) {
  return String(value ?? '').trim().slice(0, max);
}

function safeAppleMusicUrl(value) {
  const raw = text(value, 2_000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || '').toLowerCase();
    const allowedHost = host === 'music.apple.com'
      || host.endsWith('.music.apple.com')
      || host === 'itunes.apple.com'
      || host.endsWith('.itunes.apple.com');
    if (parsed.protocol !== 'https:' || !allowedHost || parsed.username || parsed.password) return '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function sourceForPayload(payload = {}) {
  const explicit = text(payload.source, 64).toLowerCase();
  if (explicit === 'upnp-sonuvi' || explicit === 'external-upnp') return explicit;
  if (payload.isUpnp === true || text(payload.streamKind, 64).toLowerCase() === 'upnp') {
    return 'external-upnp';
  }
  if (payload.isRadio === true || text(payload.streamKind, 64).toLowerCase() === 'radio') return 'radio';
  if (payload.isAirplay === true) return 'airplay';
  return explicit || 'mpd';
}

function stableIdentity({ source, trackIdentity, artist, album, title }) {
  const supplied = text(trackIdentity, 512);
  const seed = [source, supplied, artist, album, title].join('|');
  const digest = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 24);
  return `sha256:${digest}`;
}

/**
 * Build the provider-neutral lookup context consumed by web/native clients.
 * This describes what may be looked up; it does not claim that a match was
 * found. The matcher remains the existing animated-art route and retains its
 * confidence checks and cache.
 */
export function buildAnimatedArtContext(payload = {}, {
  source = '',
  artist = '',
  album = '',
  title = '',
  trackIdentity = '',
  identity = '',
  confirmedAppleMusicUrl = '',
} = {}) {
  const resolvedSource = text(source, 64).toLowerCase() || sourceForPayload(payload);
  const resolvedArtist = text(artist || payload.artist || payload.displayArtist);
  const resolvedAlbum = text(album || payload.album || payload.displayLine3);
  const resolvedTitle = text(title || payload.title || payload.displayTitle);
  const appleMusicUrl = safeAppleMusicUrl(
    confirmedAppleMusicUrl
      || payload.confirmedAppleMusicUrl
      || payload.animatedArt?.appleMusicUrl,
  );
  const suppliedIdentity = text(identity || payload.animatedArt?.identity, 80);
  const safeIdentity = VALID_IDENTITY.test(suppliedIdentity)
    ? suppliedIdentity.toLowerCase()
    : stableIdentity({
      source: resolvedSource,
      trackIdentity: trackIdentity || payload.trackIdentity || payload.file || payload.songid || payload.upnpItem?.id,
      artist: resolvedArtist,
      album: resolvedAlbum,
      title: resolvedTitle,
    });
  const eligible = Boolean(appleMusicUrl || (resolvedArtist && resolvedAlbum));

  return {
    version: ANIMATED_ART_CONTRACT_VERSION,
    source: resolvedSource,
    eligible,
    identity: safeIdentity,
    artist: resolvedArtist,
    album: resolvedAlbum,
    title: resolvedTitle,
    ...(appleMusicUrl ? { appleMusicUrl } : {}),
  };
}

export function isAnimatedArtEligible(payload = {}) {
  return buildAnimatedArtContext(payload).eligible;
}

export function animatedArtSource(payload = {}) {
  return sourceForPayload(payload);
}
