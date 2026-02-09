'use strict';

const Alexa = require('ask-sdk-core');

function createIntentHandlers(deps) {
  const {
    safeStr,
    safeNumFloat,
    decodeHtmlEntities,
    speak,
    getStableNowPlayingSnapshot,
    ensureCurrentTrack,
    buildPlayReplaceAll,
    buildPlayReplaceAllWithOffset,
    rememberIssuedStream,
    getLastPlayed,
    apiSetCurrentRating,
  } = deps;

  const LaunchRequestHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },

    async handle(handlerInput) {
      try {
        const snap = await ensureCurrentTrack();

        if (!snap || !snap.file) {
          console.log('Launch: still no current track after prime');
          return speak(handlerInput, 'I cannot find anything to play right now.', true);
        }

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

  const PlayArtistIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayArtistIntent';
    },
    handle(handlerInput) {
      const artist = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.artist?.value);
      if (!artist) return speak(handlerInput, 'Tell me which artist to play.', false);
      return speak(handlerInput, 'Play artist is recognized, but not wired to playback yet.', false);
    },
  };

  const PlayTrackIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayTrackIntent';
    },
    handle(handlerInput) {
      const track = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.track?.value);
      if (!track) return speak(handlerInput, 'Tell me which track to play.', false);
      return speak(handlerInput, 'Play track is recognized, but not wired to playback yet.', false);
    },
  };

  const ShuffleIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ShuffleIntent';
    },
    handle(handlerInput) {
      const state = safeStr(handlerInput?.requestEnvelope?.request?.intent?.slots?.state?.value).toLowerCase();
      if (!state) return speak(handlerInput, 'Say shuffle on or shuffle off.', false);
      return speak(handlerInput, 'Shuffle control is recognized, but not wired yet.', false);
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
      return speak(handlerInput, 'Repeat control is recognized, but not wired yet.', false);
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
    PlayTrackIntentHandler,
    ShuffleIntentHandler,
    RepeatIntentHandler,
    RateTrackIntentHandler,
    StopHandler,
    SessionEndedRequestHandler,
  };
}

module.exports = { createIntentHandlers };
