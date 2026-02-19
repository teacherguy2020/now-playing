'use strict';

const Alexa = require('ask-sdk-core');

function createIntentHandlers(deps) {
  const {
    safeStr,
    safeNumFloat,
    decodeHtmlEntities,
    parseTokenB64,
    makeToken,
    speak,
    getStableNowPlayingSnapshot,
    ensureCurrentTrack,
    buildPlayReplaceAll,
    buildPlayReplaceAllWithOffset,
    rememberIssuedStream,
    getLastPlayed,
    apiSetCurrentRating,
    apiPlayArtist,
    apiSuggestArtistAlias,
    apiLogHeardArtist,
    apiPlayAlbum,
    apiSuggestAlbumAlias,
    apiLogHeardAlbum,
    apiPlayTrack,
    apiPlayPlaylist,
    apiSuggestPlaylistAlias,
    apiQueueMix,
    apiLogHeardPlaylist,
    apiMpdShuffle,
    apiPlayFile,
    apiVibeNowPlaying,
    apiQueueWizardApply,
    apiGetWasPlaying,
    apiGetRuntimeConfig,
  } = deps;

  function markAwaitingQueueConfirmation(handlerInput, value) {
    try {
      const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
      attrs.awaitingQueueConfirmation = !!value;
      handlerInput.attributesManager.setSessionAttributes(attrs);
    } catch (_) {}
  }

  function isAwaitingQueueConfirmation(handlerInput) {
    try {
      const attrs = handlerInput.attributesManager.getSessionAttributes() || {};
      return !!attrs.awaitingQueueConfirmation;
    } catch (_) {
      return false;
    }
  }

  const LaunchRequestHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },

    async handle(handlerInput) {
      try {
        const ap = handlerInput?.requestEnvelope?.context?.AudioPlayer || {};
        const playerActivity = safeStr(ap.playerActivity).toUpperCase();
        const currentToken = safeStr(ap.token);
        const alexaPlayingOurStream = playerActivity === 'PLAYING' && currentToken.startsWith('moode-track:');

        // 1) Alexa is already playing our queue item: announce and open mic for optional change.
        if (alexaPlayingOurStream) {
          const parsed = (typeof parseTokenB64 === 'function' ? parseTokenB64(currentToken) : null) || {};
          const tokenFile = safeStr(parsed.file);

          let t = '';
          let a = '';

          try {
            const wp = await apiGetWasPlaying();
            const was = wp && wp.wasPlaying ? wp.wasPlaying : null;
            const wasToken = safeStr(was?.token);
            if (was && wasToken && wasToken === currentToken) {
              t = decodeHtmlEntities(safeStr(was.title));
              a = decodeHtmlEntities(safeStr(was.artist));
            }
          } catch (e) {}

          const snapPlaying = await getStableNowPlayingSnapshot();
          const snapFile = safeStr(snapPlaying?.file);

          // Only trust /now-playing metadata if it matches the token file currently playing on Alexa.
          if ((!t || !a) && tokenFile && snapFile && tokenFile === snapFile) {
            if (!t) t = decodeHtmlEntities(safeStr(snapPlaying?.title));
            if (!a) a = decodeHtmlEntities(safeStr(snapPlaying?.artist));
          }

          if (!t) t = decodeHtmlEntities(safeStr(parsed.title || ''));
          if (!a) a = decodeHtmlEntities(safeStr(parsed.artist || ''));

          if (!t && tokenFile) {
            const base = tokenFile.split('/').pop() || tokenFile;
            t = decodeHtmlEntities(base.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '));
          }
          if (!a) a = 'unknown artist';

          const speech = `Currently playing ${t || 'unknown title'} by ${a}.`;

          return handlerInput.responseBuilder
            .speak(speech)
            .withShouldEndSession(false)
            .getResponse();
        }

        // Not currently playing: always ask what to hear.
        markAwaitingQueueConfirmation(handlerInput, false);
        return handlerInput.responseBuilder
          .speak('What do you want to hear?')
          .reprompt('You can say play the queue, play artist, play album, play track, or play playlist.')
          .withShouldEndSession(false)
          .getResponse();

      } catch (e) {
        console.log('Launch error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, 'Please check your skill code.', true);
      }
    },
  };

  const NowPlayingIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NowPlayingIntent';
    },
    async handle(handlerInput) {
      try {
        const snap = await getStableNowPlayingSnapshot();
        if (!snap || !snap.title) {
          return speak(handlerInput, 'I cannot determine what is playing right now.', false);
        }

        const title = decodeHtmlEntities(snap.title || '');
        const artist = decodeHtmlEntities(snap.artist || '');
        const album = decodeHtmlEntities(snap.album || '');

        let speech = 'This is ' + title + '.';
        if (artist) speech += ' By ' + artist + '.';
        if (album) speech += ' From ' + album + '.';

        return speak(handlerInput, speech, false);
      } catch (e) {
        console.log('NowPlayingIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, 'Sorry, I could not fetch what is playing.', false);
      }
    },
  };

  const PauseIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PauseIntent';
    },
    handle(handlerInput) {
      return handlerInput.responseBuilder
        .speak('Paused.')
        .withShouldEndSession(true)
        .addDirective({ type: 'AudioPlayer.Stop' })
        .getResponse();
    },
  };

  const ResumeIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent';
    },
    async handle(handlerInput) {
      try {
        const lp = getLastPlayed();
        const tok = safeStr(lp.token);
        const url = safeStr(lp.url);
        const off = safeNumFloat(lp.offsetMs, 0);

        if (tok && url) {
          const directive = buildPlayReplaceAllWithOffset(tok, url, off);

          console.log('Resume: using saved token prefix:', tok.slice(0, 160), 'offsetMs=', Math.floor(off || 0));

          rememberIssuedStream(tok, url, off);

          return handlerInput.responseBuilder
            .speak('Resuming.')
            .withShouldEndSession(true)
            .addDirective(directive)
            .getResponse();
        }

        const snap = await getStableNowPlayingSnapshot();
        if (!snap || !snap.file) {
          return speak(handlerInput, 'I cannot resume right now.', false);
        }

        const directive2 = buildPlayReplaceAll(snap, 'Resuming playback');
        rememberIssuedStream(directive2.audioItem.stream.token, directive2.audioItem.stream.url, 0);

        return handlerInput.responseBuilder
          .speak('Resuming.')
          .withShouldEndSession(true)
          .addDirective(directive2)
          .getResponse();
      } catch (e) {
        console.log('ResumeIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, 'I cannot resume right now.', false);
      }
    },
  };

  const NextIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent';
    },
    async handle(handlerInput) {
      try {
        const snap = await getStableNowPlayingSnapshot();
        if (!snap || !snap.file) {
          return speak(handlerInput, 'I cannot skip right now.', false);
        }

        const directive = buildPlayReplaceAll(snap, 'Skipping');
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);

        return handlerInput.responseBuilder
          .speak('Skipping.')
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        console.log('NextIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, 'I cannot skip right now.', false);
      }
    },
  };

  const YesIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
      if (!isAwaitingQueueConfirmation(handlerInput)) {
        return speak(handlerInput, 'Okay.', false);
      }

      try {
        const snap = await getStableNowPlayingSnapshot();
        if (!snap || !snap.file) {
          markAwaitingQueueConfirmation(handlerInput, false);
          return speak(handlerInput, 'I cannot find a playable queue right now. What would you like to hear?', false);
        }

        const directive = buildPlayReplaceAll(snap, 'Starting playback');
        try {
          const issuedToken = directive.audioItem.stream.token;
          const issuedUrl = directive.audioItem.stream.url;
          rememberIssuedStream(issuedToken, issuedUrl, 0);
        } catch (_) {}

        markAwaitingQueueConfirmation(handlerInput, false);
        return handlerInput.responseBuilder
          .speak('Starting your queue.')
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        markAwaitingQueueConfirmation(handlerInput, false);
        return speak(handlerInput, 'I could not start your queue right now.', false);
      }
    },
  };

  const NoIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    handle(handlerInput) {
      if (!isAwaitingQueueConfirmation(handlerInput)) {
        return speak(handlerInput, 'Okay.', false);
      }
      markAwaitingQueueConfirmation(handlerInput, false);
      return handlerInput.responseBuilder
        .speak('Okay. What would you like to hear?')
        .reprompt('You can say play artist, play album, play track, or play playlist.')
        .withShouldEndSession(false)
        .getResponse();
    },
  };

  const HelpIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
      return speak(handlerInput, 'You can say: what is playing, pause, resume, next, or rate this five stars.', false);
    },
  };

  const FallbackIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
      return speak(handlerInput, 'Sorry, I did not understand. Try: what’s playing.', false);
    },
  };

  function extractSnapFromApi(resp) {
    if (!resp || typeof resp !== 'object') return null;
    if (resp.nowPlaying && resp.nowPlaying.file) return resp.nowPlaying;
    if (resp.file) return resp;
    return null;
  }

  function buildDirectiveFromApiSnap(snap, spokenTitle) {
    const file = safeStr(snap && snap.file);
    if (!file) return null;
    return buildPlayReplaceAll({
      file,
      songpos: safeStr(snap.songpos || '0'),
      songid: safeStr(snap.songid || ''),
      title: decodeHtmlEntities(safeStr(snap.title || '')),
      artist: decodeHtmlEntities(safeStr(snap.artist || '')),
      album: decodeHtmlEntities(safeStr(snap.album || '')),
    }, spokenTitle || 'Starting playback');
  }

  const PlayQueueIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayQueueIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      try {
        const snap = await ensureCurrentTrack();
        if (!snap || !snap.file) {
          return speak(handlerInput, 'I do not see a queue ready right now. What would you like to hear?', false);
        }
        const directive = buildPlayReplaceAll(snap, 'Starting your queue');
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .speak('Starting your queue.')
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        return speak(handlerInput, 'I could not start your queue right now.', false);
      }
    },
  };

  async function runPlayAnything(handlerInput, rawQuery, forceHere = false) {
    markAwaitingQueueConfirmation(handlerInput, false);
    if (!rawQuery) return speak(handlerInput, 'Tell me what you want to hear.', false);

    const playHere = forceHere || /\bhere\b\s*$/i.test(rawQuery);
    const query = rawQuery.replace(/\bhere\b\s*$/i, '').trim() || rawQuery;

    const tryStartFromResp = async (resp) => {
      const snap = extractSnapFromApi(resp);
      if (!snap) return null;

      if (playHere) {
        try {
          await apiPlayFile(String(snap.file || '').trim());
          return handlerInput.responseBuilder
            .speak('Playing on moode.')
            .withShouldEndSession(true)
            .addDirective({ type: 'AudioPlayer.Stop' })
            .getResponse();
        } catch (_) {
          return speak(handlerInput, 'I found it, but could not start moode playback right now.', false);
        }
      }

      const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
      if (!directive) return null;
      rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
      return handlerInput.responseBuilder.withShouldEndSession(true).addDirective(directive).getResponse();
    };

    const attempts = [
      {
        kind: 'artist',
        run: async () => {
          try { await apiLogHeardArtist(query, 'alexa-play-anything', 'attempt'); } catch (_) {}
          return apiPlayArtist(query);
        },
        ok: async () => { try { await apiLogHeardArtist(query, 'alexa-play-anything', 'ok'); } catch (_) {} },
        miss: async () => {
          try { await apiLogHeardArtist(query, 'alexa-play-anything', 'not-found'); } catch (_) {}
          try { await apiSuggestArtistAlias(query, 'alexa-play-anything-not-found'); } catch (_) {}
        },
      },
      {
        kind: 'playlist',
        run: async () => {
          try { await apiLogHeardPlaylist(query, 'alexa-play-anything', 'attempt'); } catch (_) {}
          return apiPlayPlaylist(query);
        },
        ok: async (resp) => { try { await apiLogHeardPlaylist(query, 'alexa-play-anything', 'ok', String(resp?.chosen || resp?.playlist || '')); } catch (_) {} },
        miss: async () => {
          try { await apiLogHeardPlaylist(query, 'alexa-play-anything', 'not-found'); } catch (_) {}
          try { await apiSuggestPlaylistAlias(query, 'alexa-play-anything-not-found'); } catch (_) {}
        },
      },
      {
        kind: 'album',
        run: async () => {
          try { await apiLogHeardAlbum(query, 'alexa-play-anything', 'attempt'); } catch (_) {}
          return apiPlayAlbum(query);
        },
        ok: async (resp) => { try { await apiLogHeardAlbum(query, 'alexa-play-anything', 'ok', String(resp?.album || '')); } catch (_) {} },
        miss: async () => {
          try { await apiLogHeardAlbum(query, 'alexa-play-anything', 'not-found'); } catch (_) {}
          try { await apiSuggestAlbumAlias(query, 'alexa-play-anything-not-found'); } catch (_) {}
        },
      },
      { kind: 'track', run: async () => apiPlayTrack(query), ok: async () => {}, miss: async () => {} },
    ];

    for (const step of attempts) {
      try {
        const resp = await step.run();
        const out = await tryStartFromResp(resp);
        if (out) {
          try { await step.ok(resp); } catch (_) {}
          return out;
        }
        try { await step.miss(); } catch (_) {}
      } catch (e) {
        try { await step.miss(); } catch (_) {}
      }
    }

    return speak(handlerInput, `I could not find ${query}. Try saying play artist, play album, or play playlist.`, false);
  }

  const PlayAnythingIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayAnythingIntent';
    },
    async handle(handlerInput) {
      const rawQuery = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.query?.value);
      return runPlayAnything(handlerInput, rawQuery, false);
    },
  };

  const PlayHereIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayHereIntent';
    },
    async handle(handlerInput) {
      const rawQuery = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.query?.value);
      return runPlayAnything(handlerInput, rawQuery, true);
    },
  };

  async function runVibeFromCurrent(handlerInput, forceHere = false) {
    markAwaitingQueueConfirmation(handlerInput, false);
    try {
      // Keep Alexa response under timeout budget: build a small starter queue,
      // then let vibe top-up extend it during playback.
      const vibe = await apiVibeNowPlaying(12, 0);
      const tracksRaw = Array.isArray(vibe?.tracks) ? vibe.tracks : [];
      const files = tracksRaw
        .map((t) => (typeof t === 'string' ? t : String(t?.file || '').trim()))
        .filter(Boolean);

      if (!files.length) {
        return speak(handlerInput, 'I could not build a vibe list from this song right now.', false);
      }

      const applied = await apiQueueWizardApply(files, {
        mode: 'replace',
        shuffle: true,
        keepNowPlaying: false,
      });
      const snap = extractSnapFromApi(applied);

      if (forceHere) {
        if (!snap || !snap.file) return speak(handlerInput, `Built a vibe list with ${files.length} tracks, but could not start moode playback.`, false);
        await apiPlayFile(String(snap.file || '').trim());
        return handlerInput.responseBuilder
          .speak(`Loaded ${files.length} vibe tracks. Playing on moode.`)
          .withShouldEndSession(true)
          .addDirective({ type: 'AudioPlayer.Stop' })
          .getResponse();
      }

      const directive = buildDirectiveFromApiSnap(snap, 'Starting your vibe');
      if (!directive) return speak(handlerInput, `Built a vibe list with ${files.length} tracks, but could not start playback.`, false);

      try {
        const tok = String(directive?.audioItem?.stream?.token || '').trim();
        const parsed = (typeof parseTokenB64 === 'function' ? parseTokenB64(tok) : null) || {};
        const enriched = makeToken({ ...parsed, vibeMode: true });
        directive.audioItem.stream.token = enriched;
      } catch (_) {}

      rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
      return handlerInput.responseBuilder
        .speak(`Loaded ${files.length} vibe tracks. Starting now.`)
        .withShouldEndSession(true)
        .addDirective(directive)
        .getResponse();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return speak(handlerInput, `I couldn't vibe this song right now. ${msg.includes('Last.fm') ? 'Check Last.fm configuration.' : ''}`.trim(), false);
    }
  }

  const VibeThisSongIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'VibeThisSongIntent';
    },
    async handle(handlerInput) {
      return runVibeFromCurrent(handlerInput, false);
    },
  };

  const VibeThisSongHereIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'VibeThisSongHereIntent';
    },
    async handle(handlerInput) {
      return runVibeFromCurrent(handlerInput, true);
    },
  };

  const PlayArtistIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayArtistIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      const artist = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.artist?.value);
      if (!artist) return speak(handlerInput, 'Tell me which artist to play.', false);
      try {
        console.log('[PlayArtistIntent] request', { artist });
        try { await apiLogHeardArtist(artist, 'alexa-play-artist', 'attempt'); } catch (_) {}
        const resp = await apiPlayArtist(artist);
        const snap = extractSnapFromApi(resp);
        console.log('[PlayArtistIntent] api response', {
          ok: !!resp?.ok,
          artist: String(resp?.artist || ''),
          added: Number(resp?.added || 0),
          removedHoliday: Number(resp?.removedHoliday || 0),
          hasSnap: !!(snap && snap.file),
        });
        try { await apiLogHeardArtist(artist, 'alexa-play-artist', 'ok'); } catch (_) {}
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${artist}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log('[PlayArtistIntent] error', { artist, msg });
        const notFound = /HTTP\s+404\b/.test(msg) || /No matches for artist/i.test(msg);
        if (notFound) {
          try { await apiLogHeardArtist(artist, 'alexa-play-artist', 'not-found'); } catch (_) {}
          try {
            const s = await apiSuggestArtistAlias(artist, 'alexa-play-artist-not-found');
            console.log('[PlayArtistIntent] alias suggestion queued', { artist, ok: !!s?.ok });
          } catch (ee) {
            console.log('[PlayArtistIntent] alias suggestion failed', {
              artist,
              msg: ee && ee.message ? ee.message : String(ee),
            });
          }
          return speak(handlerInput, `I could not find artist ${artist}. Visit your configuration to make an adjustment.`, false);
        }
        try { await apiLogHeardArtist(artist, 'alexa-play-artist', 'error'); } catch (_) {}
        return speak(handlerInput, `I couldn't play ${artist} right now.`, false);
      }
    },
  };

  const PlayAlbumIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayAlbumIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      const album = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.album?.value);
      if (!album) return speak(handlerInput, 'Tell me which album to play.', false);
      try {
        console.log('[PlayAlbumIntent] request', { album });
        try { await apiLogHeardAlbum(album, 'alexa-play-album', 'attempt'); } catch (_) {}
        const resp = await apiPlayAlbum(album);
        const snap = extractSnapFromApi(resp);
        const resolvedAlbum = String(resp?.album || '').trim();
        console.log('[PlayAlbumIntent] api response', { ok: !!resp?.ok, album: resolvedAlbum, added: Number(resp?.added || 0), hasSnap: !!(snap && snap.file) });
        try { await apiLogHeardAlbum(album, 'alexa-play-album', 'ok', resolvedAlbum); } catch (_) {}
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${album}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log('[PlayAlbumIntent] error', { album, msg });
        const notFound = /HTTP\s+404\b/.test(msg) || /No matches for album/i.test(msg);
        if (notFound) {
          try { await apiLogHeardAlbum(album, 'alexa-play-album', 'not-found'); } catch (_) {}
          try { await apiSuggestAlbumAlias(album, 'alexa-play-album-not-found'); } catch (_) {}
          return speak(handlerInput, `I could not find album ${album}. Visit your configuration to make an adjustment.`, false);
        }
        try { await apiLogHeardAlbum(album, 'alexa-play-album', 'error'); } catch (_) {}
        return speak(handlerInput, `I couldn't play ${album} right now.`, false);
      }
    },
  };

  const PlayTrackIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayTrackIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      const track = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.track?.value);
      if (!track) return speak(handlerInput, 'Tell me which track to play.', false);
      try {
        const resp = await apiPlayTrack(track);
        const snap = extractSnapFromApi(resp);
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${track}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        console.log('PlayTrackIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, `I couldn't play ${track} right now.`, false);
      }
    },
  };

  const PlayPlaylistIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayPlaylistIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      const playlist = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.playlist?.value);
      if (!playlist) return speak(handlerInput, 'Tell me which playlist to play.', false);
      try {
        console.log('[PlayPlaylistIntent] request', { playlist });
        try { await apiLogHeardPlaylist(playlist, 'alexa-play-playlist', 'attempt'); } catch (_) {}
        const resp = await apiPlayPlaylist(playlist);
        const snap = extractSnapFromApi(resp);
        const resolvedPlaylist = String(resp?.chosen || resp?.playlist || '').trim();
        console.log('[PlayPlaylistIntent] api response', { ok: !!resp?.ok, playlist: resolvedPlaylist, added: Number(resp?.added || 0), hasSnap: !!(snap && snap.file) });
        try { await apiLogHeardPlaylist(playlist, 'alexa-play-playlist', 'ok', resolvedPlaylist); } catch (_) {}
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${playlist}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log('[PlayPlaylistIntent] error:', { playlist, msg });
        const notFound = /HTTP\s+404\b/.test(msg) || /No matches for playlist/i.test(msg);
        if (notFound) {
          try { await apiLogHeardPlaylist(playlist, 'alexa-play-playlist', 'not-found'); } catch (_) {}
          try { await apiSuggestPlaylistAlias(playlist, 'alexa-play-playlist-not-found'); } catch (_) {}
          return speak(handlerInput, `I could not find playlist ${playlist}. Visit your configuration to make an adjustment.`, false);
        }
        try { await apiLogHeardPlaylist(playlist, 'alexa-play-playlist', 'error'); } catch (_) {}
        return speak(handlerInput, `I couldn't play playlist ${playlist} right now.`, false);
      }
    },
  };

  function parseArtistsFromMixQuery(q) {
    const raw = safeStr(q);
    if (!raw) return [];

    const normalized = raw
      .replace(/\bmix of\b/ig, '')
      .replace(/\bplay\b/ig, '')
      .replace(/\bartists?\b/ig, '')
      // Delimiter policy for mixes: require explicit "plus" between artists.
      .replace(/\bplus\b/ig, ',');

    const parts = normalized
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return Array.from(new Set(parts)).slice(0, 8);
  }

  function normalizeAliasKey(s) {
    return safeStr(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  async function resolveArtistAliasesForMix(rawArtists) {
    const out = [];
    const aliasHits = [];

    let aliasMap = {};
    try {
      const cfg = await apiGetRuntimeConfig();
      aliasMap = (cfg && cfg.config && cfg.config.alexa && cfg.config.alexa.artistAliases) || {};
    } catch (_) {}

    for (const a of rawArtists) {
      const keyNorm = normalizeAliasKey(a);
      const direct = aliasMap[a];
      const lower = aliasMap[safeStr(a).toLowerCase()];
      const norm = aliasMap[keyNorm];
      const resolvedRaw = safeStr(direct || lower || norm || a);

      // Allow alias targets to expand into multiple artists:
      // e.g. "steely dan donald fagen" -> "Steely Dan, Donald Fagen"
      const expanded = resolvedRaw
        .split(/[;,]/)
        .map((x) => safeStr(x))
        .filter(Boolean);

      if (expanded.length) out.push(...expanded);
      else out.push(a);

      if (resolvedRaw && resolvedRaw !== a) aliasHits.push({ from: a, to: resolvedRaw, expanded });
    }

    return {
      artists: Array.from(new Set(out)).slice(0, 8),
      aliasHits,
    };
  }

  const PlayMixIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayMixIntent';
    },
    async handle(handlerInput) {
      markAwaitingQueueConfirmation(handlerInput, false);
      const mixQuery = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.mixQuery?.value);
      const parsedArtists = parseArtistsFromMixQuery(mixQuery);
      const resolved = await resolveArtistAliasesForMix(parsedArtists);
      const artists = resolved.artists;
      console.log('[PlayMixIntent] request', { mixQuery, parsedArtists, artists, aliasHits: resolved.aliasHits });

      for (const a of parsedArtists) {
        try { await apiLogHeardArtist(a, 'alexa-play-mix', 'attempt'); } catch (_) {}
      }

      if (!artists.length) {
        return speak(handlerInput, 'Tell me the artists for the mix, for example Frank Sinatra plus Diana Krall.', false);
      }

      if (parsedArtists.length < 2 && /\b(and|with)\b/i.test(mixQuery || '')) {
        return speak(handlerInput, 'For mixes, say plus between artists. For example, Frank Sinatra plus Diana Krall.', false);
      }

      try {
        const resp = await apiQueueMix(artists, {
          excludeHoliday: true,
          clearFirst: true,
          random: true,
          startPlayback: false,
          maxTracks: 300,
        });

        const added = Number(resp?.added || 0);
        console.log('[PlayMixIntent] queue/mix response', {
          ok: !!resp?.ok,
          added,
          byArtist: resp?.byArtist || {},
        });
        if (added < 1) {
          for (const a of parsedArtists) {
            try { await apiLogHeardArtist(a, 'alexa-play-mix', 'not-found'); } catch (_) {}
            try { await apiSuggestArtistAlias(a, 'alexa-play-mix-not-found'); } catch (_) {}
          }
          return speak(handlerInput, 'I could not build that mix right now.', false);
        }

        for (const a of parsedArtists) {
          try { await apiLogHeardArtist(a, 'alexa-play-mix', 'ok'); } catch (_) {}
        }

        let snap = (resp && resp.nowPlaying && resp.nowPlaying.file) ? resp.nowPlaying : null;
        if (!snap || !snap.file) {
          snap = await ensureCurrentTrack();
        }
        if (!snap || !snap.file) {
          console.log('[PlayMixIntent] no playable head after queue/mix', { added, startedPlayback: !!resp?.startedPlayback });
          return speak(handlerInput, `I loaded ${added} tracks, but could not start playback.`, false);
        }

        console.log('[PlayMixIntent] starting playback from head', {
          file: snap.file,
          title: snap.title || '',
          artist: snap.artist || '',
        });

        const directive = buildPlayReplaceAll(snap, 'Starting your mix');
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);

        return handlerInput.responseBuilder
          .speak(`Loaded ${added} tracks. Starting your mix.`)
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log('[PlayMixIntent] error:', { mixQuery, artists, msg });
        return speak(handlerInput, 'I could not build that mix right now.', false);
      }
    },
  };

  const ShuffleIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShuffleIntent';
    },
    async handle(handlerInput) {
      try {
        await apiMpdShuffle();
        return speak(handlerInput, 'Shuffled.', false);
      } catch (e) {
        console.log('ShuffleIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, 'I could not shuffle right now.', false);
      }
    },
  };

  const RepeatIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RepeatIntent';
    },
    handle(handlerInput) {
      const mode = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.mode?.value).toLowerCase();
      if (!mode) return speak(handlerInput, 'Say repeat off, repeat one, or repeat all.', false);
      return speak(handlerInput, 'Repeat control is not wired yet.', false);
    },
  };

  function ratingSlotToNumber(v) {
    const s = safeStr(v).toLowerCase();
    if (!s) return null;
    if (s.includes('five')) return 5;
    if (s.includes('four')) return 4;
    if (s.includes('three')) return 3;
    if (s.includes('two')) return 2;
    if (s.includes('one')) return 1;
    if (s === 'up' || s.includes('thumbs up') || s === 'like') return 5;
    if (s === 'down' || s.includes('thumbs down') || s === 'dislike') return 1;
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.round(n);
    return null;
  }

  const RateTrackIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RateTrackIntent';
    },
    async handle(handlerInput) {
      const raw = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.rating?.value);
      const rating = ratingSlotToNumber(raw);
      if (rating === null) {
        return speak(handlerInput, 'Say a rating like one star through five stars.', false);
      }

      try {
        const r = await apiSetCurrentRating(rating);
        if (r && r.disabled) return speak(handlerInput, 'Ratings are not available for this source.', false);
        return speak(handlerInput, `Set rating to ${rating} stars.`, false);
      } catch (e) {
        return speak(handlerInput, 'I could not set the rating right now.', false);
      }
    },
  };

  const StopHandler = {
    canHandle(handlerInput) {
      const t = Alexa.getRequestType(handlerInput.requestEnvelope);
      if (t !== 'IntentRequest') return false;
      const name = Alexa.getIntentName(handlerInput.requestEnvelope);
      return name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
    },
    handle(handlerInput) {
      return handlerInput.responseBuilder
        .withShouldEndSession(true)
        .addDirective({ type: 'AudioPlayer.Stop' })
        .getResponse();
    },
  };

  const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
      console.log('SessionEndedRequest');
      return handlerInput.responseBuilder.getResponse();
    },
  };

  return {
    LaunchRequestHandler,
    NowPlayingIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    PlayQueueIntentHandler,
    PlayAnythingIntentHandler,
    PlayHereIntentHandler,
    VibeThisSongIntentHandler,
    VibeThisSongHereIntentHandler,
    PlayArtistIntentHandler,
    PlayAlbumIntentHandler,
    PlayTrackIntentHandler,
    PlayPlaylistIntentHandler,
    PlayMixIntentHandler,
    ShuffleIntentHandler,
    RepeatIntentHandler,
    RateTrackIntentHandler,
    StopHandler,
    SessionEndedRequestHandler,
  };
}

module.exports = { createIntentHandlers };
