import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANIMATED_ART_CONTRACT_VERSION,
  animatedArtSource,
  buildAnimatedArtContext,
  isAnimatedArtEligible,
} from '../src/lib/animated-art-context.mjs';

test('UPnP artist/album metadata is eligible without requiring a local-library match', () => {
  const context = buildAnimatedArtContext({
    source: 'upnp-sonuvi',
    isUpnp: true,
    artist: 'Jellyfin Artist',
    album: 'Remote Album',
    title: 'Remote Track',
    file: 'upnp-sonuvi',
  });

  assert.equal(context.version, ANIMATED_ART_CONTRACT_VERSION);
  assert.equal(context.source, 'upnp-sonuvi');
  assert.equal(context.eligible, true);
  assert.equal(context.artist, 'Jellyfin Artist');
  assert.equal(context.album, 'Remote Album');
  assert.match(context.identity, /^sha256:[a-f0-9]{24}$/);
  assert.equal(context.appleMusicUrl, undefined);
});

test('UPnP track identity changes when queue advancement changes the trusted item', () => {
  const first = buildAnimatedArtContext({
    source: 'upnp-sonuvi',
    artist: 'Artist',
    album: 'Album',
    title: 'First',
    trackIdentity: 'session-generation:track-1',
  });
  const second = buildAnimatedArtContext({
    source: 'upnp-sonuvi',
    artist: 'Artist',
    album: 'Album',
    title: 'Second',
    trackIdentity: 'session-generation:track-2',
  });

  assert.notEqual(first.identity, second.identity);
  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
});

test('missing UPnP metadata is a safe static-art fallback and is not lookup-eligible', () => {
  const context = buildAnimatedArtContext({
    source: 'external-upnp',
    isUpnp: true,
    title: 'Unknown Track',
    file: 'http://10.0.0.254:8200/track.flac?token=private',
  });

  assert.equal(context.eligible, false);
  assert.equal(context.artist, '');
  assert.equal(context.album, '');
  assert.match(context.identity, /^sha256:[a-f0-9]{24}$/);
  assert.equal(isAnimatedArtEligible({ source: 'external-upnp', title: 'Unknown Track' }), false);
});

test('only a confirmed Apple Music URL is accepted as an alternate lookup identity', () => {
  const confirmed = buildAnimatedArtContext({
    source: 'radio',
    artist: 'Artist',
    album: 'Album',
    confirmedAppleMusicUrl: 'https://music.apple.com/us/album/album/123?uo=4',
  });
  const untrusted = buildAnimatedArtContext({
    source: 'upnp-sonuvi',
    artist: 'Artist',
    album: 'Album',
    confirmedAppleMusicUrl: 'https://example.test/album/123',
  });

  assert.equal(confirmed.appleMusicUrl, 'https://music.apple.com/us/album/album/123');
  assert.equal(untrusted.appleMusicUrl, undefined);
  assert.equal(animatedArtSource({ isUpnp: true }), 'external-upnp');
});
