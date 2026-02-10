'use strict';

const Alexa = require('ask-sdk-core');

function createIntentHandlers(deps) {
  const {
    safeStr,
    safeNumFloat,
    decodeHtmlEntities,
    parseTokenB64,
    speak,
    getStableNowPlayingSnapshot,
    ensureCurrentTrack,
    buildPlayReplaceAll,
    buildPlayReplaceAllWithOffset,
    rememberIssuedStream,
    getLastPlayed,
    apiSetCurrentRating,
    apiPlayArtist,
    apiPlayAlbum,
    apiPlayTrack,
    apiPlayPlaylist,
    apiMpdShuffle,
    apiGetWasPlaying,
  } = deps;

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
          const parsed = parseTokenB64(currentToken) || {};
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

          const speech = `Currently playing ${t || 'unknown title'} by ${a}. What would you like to hear?`;

          return handlerInput.responseBuilder
            .speak(speech)
            .reprompt('You can say play artist, play album, play track, or play playlist.')
            .withShouldEndSession(false)
            .getResponse();
        }

        const snap = await getStableNowPlayingSnapshot();

        // 2) Not currently playing, but head exists: start queue.
        if (snap && snap.file) {
          const directive = buildPlayReplaceAll(snap, 'Starting playback');
          try {
            const issuedToken = directive.audioItem.stream.token;
            const issuedUrl = directive.audioItem.stream.url;
            rememberIssuedStream(issuedToken, issuedUrl, 0);
          } catch (e) {}

          return handlerInput.responseBuilder
            .speak('Starting your queue.')
            .withShouldEndSession(true)
            .addDirective(directive)
            .getResponse();
        }

        // 3) Not playing and no head: ask what to hear.
        console.log('Launch: no head ready; prompting for invocation');
        return handlerInput.responseBuilder
          .speak('What would you like to hear?')
          .reprompt('You can say play artist, play album, play track, or play playlist.')
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

  const PlayArtistIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayArtistIntent';
    },
    async handle(handlerInput) {
      const artist = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.artist?.value);
      if (!artist) return speak(handlerInput, 'Tell me which artist to play.', false);
      try {
        const resp = await apiPlayArtist(artist);
        const snap = extractSnapFromApi(resp);
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${artist}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        console.log('PlayArtistIntent error:', e && e.message ? e.message : String(e));
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
      const album = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.album?.value);
      if (!album) return speak(handlerInput, 'Tell me which album to play.', false);
      try {
        const resp = await apiPlayAlbum(album);
        const snap = extractSnapFromApi(resp);
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${album}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        console.log('PlayAlbumIntent error:', e && e.message ? e.message : String(e));
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
      const playlist = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.playlist?.value);
      if (!playlist) return speak(handlerInput, 'Tell me which playlist to play.', false);
      try {
        const resp = await apiPlayPlaylist(playlist);
        const snap = extractSnapFromApi(resp);
        const directive = buildDirectiveFromApiSnap(snap, 'Starting your selection');
        if (!directive) return speak(handlerInput, `I found ${playlist}, but could not start playback.`, false);
        rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);
        return handlerInput.responseBuilder
          .withShouldEndSession(true)
          .addDirective(directive)
          .getResponse();
      } catch (e) {
        console.log('PlayPlaylistIntent error:', e && e.message ? e.message : String(e));
        return speak(handlerInput, `I couldn't play playlist ${playlist} right now.`, false);
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
    HelpIntentHandler,
    FallbackIntentHandler,
    PlayArtistIntentHandler,
    PlayAlbumIntentHandler,
    PlayTrackIntentHandler,
    PlayPlaylistIntentHandler,
    ShuffleIntentHandler,
    RepeatIntentHandler,
    RateTrackIntentHandler,
    StopHandler,
    SessionEndedRequestHandler,
  };
}

module.exports = { createIntentHandlers };
