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
      return speak(handlerInput, 'You can say: what’s playing, pause, resume, or next.', false);
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
    StopHandler,
    SessionEndedRequestHandler,
  };
}

module.exports = { createIntentHandlers };
