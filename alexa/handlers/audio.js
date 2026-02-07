'use strict';

const Alexa = require('ask-sdk-core');

function createAudioHandlers(deps) {
  const {
    API_BASE,
    safeStr,
    safeNum,
    decodeHtmlEntities,
    makeToken,
    absolutizeMaybe,
    getEventType,
    getAudioPlayerToken,
    getAudioOffsetMs,
    advanceFromTokenIfNeeded,
    rememberStop,
    rememberIssuedStream,
    setLastPlayedToken,
    recentlyEnqueuedToken,
    markEnqueuedToken,
    enqueueAlreadyIssuedForPrevToken,
    ensureNowPlayingForEnqueue,
    getStableNowPlayingSnapshot,
    buildPlayEnqueue,
    buildPlayReplaceAll,
  } = deps;

  const PlaybackControllerEventHandler = {
    canHandle(handlerInput) {
      const t = Alexa.getRequestType(handlerInput.requestEnvelope);
      return t === 'PlaybackController.NextCommandIssued'
        || t === 'PlaybackController.PreviousCommandIssued'
        || t === 'PlaybackController.PlayCommandIssued'
        || t === 'PlaybackController.PauseCommandIssued';
    },
    handle(handlerInput) {
      return handlerInput.responseBuilder.getResponse();
    },
  };

  const AudioPlayerEventHandler = {
    canHandle(handlerInput) {
      const t = Alexa.getRequestType(handlerInput.requestEnvelope);
      return t && String(t).startsWith('AudioPlayer.');
    },

    async handle(handlerInput) {
      const eventType = getEventType(handlerInput);
      const token = getAudioPlayerToken(handlerInput);

      if (eventType === 'AudioPlayer.PlaybackStopped') {
        try {
          const off = getAudioOffsetMs(handlerInput);
          console.log('AudioPlayer event:', eventType);
          console.log('PlaybackStopped: token prefix:', safeStr(token).slice(0, 160), 'offsetMs=', off);
          rememberStop(token, off);
        } catch (e) {
          console.log('PlaybackStopped handler failed:', e && e.message ? e.message : String(e));
        }
        return handlerInput.responseBuilder.getResponse();
      }

      if (eventType === 'AudioPlayer.PlaybackStarted') {
        try {
          console.log('AudioPlayer event:', eventType);
          const startOff = getAudioOffsetMs(handlerInput);
          console.log('PlaybackStarted: token prefix:', safeStr(token).slice(0, 160), 'offsetMs=', startOff);

          if (safeStr(token)) setLastPlayedToken(safeStr(token));

          if (Number.isFinite(startOff) && startOff > 0) {
            console.log('PlaybackStarted: non-zero offset; skipping advance');
            return handlerInput.responseBuilder.getResponse();
          }

          try {
            const advanced = await advanceFromTokenIfNeeded(token);
            if (advanced) console.log('PlaybackStarted: advanced queue for this token');
          } catch (e) {
            console.log('PlaybackStarted: advance failed:', e && e.message ? e.message : String(e));
          }

          return handlerInput.responseBuilder.getResponse();
        } catch (e) {
          console.log('PlaybackStarted handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      if (eventType === 'AudioPlayer.PlaybackNearlyFinished') {
        try {
          console.log('AudioPlayer event:', eventType);
          const finishedToken = safeStr(token);

          if (!finishedToken) {
            console.log('NearlyFinished: missing finishedToken; cannot ENQUEUE');
            return handlerInput.responseBuilder.getResponse();
          }

          console.log('NearlyFinished: token prefix:', finishedToken.slice(0, 160));

          const snap = await ensureNowPlayingForEnqueue('NearlyFinished:');
          console.log('NearlyFinished: /now-playing snapshot:', snap ? JSON.stringify(snap, null, 2) : null);

          if (!snap || !snap.file) {
            console.log('NearlyFinished: no next from /now-playing; skipping ENQUEUE');
            return handlerInput.responseBuilder.getResponse();
          }

          const nextFile = safeStr(snap.file);
          const nextPos0 = safeNum(snap.songpos, null);
          const nextSongId = safeNum(snap.songid, null);

          if (!nextFile || nextPos0 === null) {
            console.log('NearlyFinished: still no next after prime; skipping ENQUEUE');
            return handlerInput.responseBuilder.getResponse();
          }

          const candidateToken = makeToken({ file: nextFile, songid: nextSongId, pos0: nextPos0 });

          if (recentlyEnqueuedToken(candidateToken)) {
            console.log('NearlyFinished: skip duplicate enqueue token');
            return handlerInput.responseBuilder.getResponse();
          }

          const enq = buildPlayEnqueue(
            {
              file: nextFile,
              songpos: String(nextPos0),
              songid: (nextSongId !== null ? String(nextSongId) : ''),
              title: decodeHtmlEntities(snap.title || ''),
              artist: decodeHtmlEntities(snap.artist || ''),
              album: decodeHtmlEntities(snap.album || ''),
              albumArtUrl: absolutizeMaybe(snap.albumArtUrl || '', API_BASE),
              altArtUrl: absolutizeMaybe(snap.altArtUrl || '', API_BASE),
            },
            finishedToken
          );

          if (!enq) {
            console.log('NearlyFinished: could not build ENQUEUE directive');
            return handlerInput.responseBuilder.getResponse();
          }

          try {
            const enqToken = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.token : '';
            const enqUrl = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.url : '';
            if (enqToken && enqUrl) rememberIssuedStream(enqToken, enqUrl, 0);
          } catch (e) {}

          try {
            await advanceFromTokenIfNeeded(candidateToken);
            console.log('NearlyFinished: advanced MPD head for enqueued track pos0=', nextPos0, 'songid=', nextSongId);
          } catch (e) {
            console.log('NearlyFinished: advance after enqueue failed:', e && e.message ? e.message : String(e));
          }

          markEnqueuedToken(candidateToken, finishedToken);

          console.log('NearlyFinished: ENQUEUE next:', nextFile, 'pos0=', nextPos0, 'songid=', nextSongId);
          console.log('NearlyFinished: enqueue directive:', JSON.stringify(enq, null, 2));

          return handlerInput.responseBuilder.addDirective(enq).getResponse();

        } catch (e) {
          console.log('NearlyFinished handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      if (eventType === 'AudioPlayer.PlaybackFinished') {
        try {
          console.log('AudioPlayer event:', eventType);

          if (enqueueAlreadyIssuedForPrevToken(token)) {
            console.log('PlaybackFinished: enqueue already issued; no action');
            return handlerInput.responseBuilder.getResponse();
          }

          console.log('PlaybackFinished: fallback continue (REPLACE_ALL)');
          const snap = await getStableNowPlayingSnapshot();
          if (!snap || !snap.file) return handlerInput.responseBuilder.getResponse();

          const directive = buildPlayReplaceAll(snap, 'Continuing playback');
          rememberIssuedStream(directive.audioItem.stream.token, directive.audioItem.stream.url, 0);

          return handlerInput.responseBuilder.addDirective(directive).getResponse();

        } catch (e) {
          console.log('PlaybackFinished handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      return handlerInput.responseBuilder.getResponse();
    },
  };

  return { PlaybackControllerEventHandler, AudioPlayerEventHandler };
}

module.exports = { createAudioHandlers };
