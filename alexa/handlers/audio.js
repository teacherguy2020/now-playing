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
    parseTokenB64,
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
    apiSetWasPlaying,
    apiVibeNowPlaying,
    apiQueueWizardApply,
  } = deps;

  async function ensureHeadReady(previousToken, logPrefix, options) {
    const opts = options || {};
    const prevToken = safeStr(previousToken);

    if (!prevToken) {
      console.log(logPrefix, 'missing previous token; cannot ENQUEUE');
      return null;
    }

    if (enqueueAlreadyIssuedForPrevToken(prevToken)) {
      console.log(logPrefix, 'enqueue already issued for previous token; no action');
      return null;
    }

    let advancedNowPlaying = null;
    if (opts.advanceFromPrevious) {
      try {
        const adv = await advanceFromTokenIfNeeded(prevToken);
        if (adv && adv.advanced) {
          console.log(logPrefix, 'advance-from-previous-token: advanced');
          if (adv.nowPlaying && adv.nowPlaying.file) {
            advancedNowPlaying = adv.nowPlaying;
            console.log(logPrefix, 'using queue/advance nowPlaying candidate');
          }
        } else {
          console.log(logPrefix, 'advance-from-previous-token: no-op', adv && adv.reason ? adv.reason : '');
        }
      } catch (e) {
        console.log(logPrefix, 'advance-from-previous-token failed:', e && e.message ? e.message : String(e));
      }
    }

    const snap = advancedNowPlaying || await ensureNowPlayingForEnqueue(logPrefix);
    console.log(logPrefix, '/now-playing snapshot:', snap ? JSON.stringify(snap, null, 2) : null);

    if (!snap || !snap.file) {
      console.log(logPrefix, 'no next from /now-playing; skipping ENQUEUE');
      return null;
    }

    const nextFile = safeStr(snap.file);
    const nextPos0 = safeNum(snap.songpos, null);
    const nextSongId = safeNum(snap.songid, null);

    if (!nextFile || nextPos0 === null) {
      console.log(logPrefix, 'invalid next candidate; skipping ENQUEUE');
      return null;
    }

    const candidateToken = makeToken({ file: nextFile, songid: nextSongId, pos0: nextPos0 });

    if (recentlyEnqueuedToken(candidateToken)) {
      console.log(logPrefix, 'skip duplicate enqueue token');
      return null;
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
      prevToken
    );

    if (!enq) {
      console.log(logPrefix, 'could not build ENQUEUE directive');
      return null;
    }

    try {
      const enqToken = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.token : '';
      const enqUrl = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.url : '';
      if (enqToken && enqUrl) rememberIssuedStream(enqToken, enqUrl, 0);
    } catch (e) {}

    try {
      await advanceFromTokenIfNeeded(candidateToken);
      console.log(logPrefix, 'advanced MPD head for enqueued track pos0=', nextPos0, 'songid=', nextSongId);
    } catch (e) {
      console.log(logPrefix, 'advance after enqueue failed:', e && e.message ? e.message : String(e));
    }

    markEnqueuedToken(candidateToken, prevToken);

    console.log(logPrefix, 'ENQUEUE next:', nextFile, 'pos0=', nextPos0, 'songid=', nextSongId);
    console.log(logPrefix, 'enqueue directive:', JSON.stringify(enq, null, 2));

    return enq;
  }

  async function maybeTopUpVibeQueueFromToken(token, logPrefix) {
    try {
      const p = parseTokenB64(safeStr(token)) || {};
      if (!p || !p.vibeMode) return;

      const vibe = await apiVibeNowPlaying(1, 0);
      const tracksRaw = Array.isArray(vibe?.tracks) ? vibe.tracks : [];
      const files = tracksRaw
        .map((t) => (typeof t === 'string' ? t : String(t?.file || '').trim()))
        .filter(Boolean)
        .slice(0, 1);

      if (!files.length) return;
      await apiQueueWizardApply(files, { mode: 'append', shuffle: false, keepNowPlaying: true });
      console.log(logPrefix, 'vibe top-up appended', files[0]);
    } catch (e) {
      console.log(logPrefix, 'vibe top-up failed:', e && e.message ? e.message : String(e));
    }
  }

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
          try {
            await apiSetWasPlaying({ token: safeStr(token), active: false, stoppedAt: Date.now() });
          } catch (e) {
            console.log('PlaybackStopped: set was-playing inactive failed:', e && e.message ? e.message : String(e));
          }
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

          try {
            const p = parseTokenB64(safeStr(token)) || {};
            await apiSetWasPlaying({
              token: safeStr(token),
              file: safeStr(p.file),
              title: decodeHtmlEntities(safeStr(p.title || '')),
              artist: decodeHtmlEntities(safeStr(p.artist || '')),
              album: decodeHtmlEntities(safeStr(p.album || '')),
              startedAt: Date.now(),
              active: true,
            });
          } catch (e) {
            console.log('PlaybackStarted: set was-playing failed:', e && e.message ? e.message : String(e));
          }

          if (!(Number.isFinite(startOff) && startOff > 0)) {
            try {
              const adv = await advanceFromTokenIfNeeded(token);
              if (adv && adv.advanced) console.log('PlaybackStarted: advanced queue for this token');
            } catch (e) {
              console.log('PlaybackStarted: advance failed:', e && e.message ? e.message : String(e));
            }
          } else {
            console.log('PlaybackStarted: non-zero offset; skip advance, still checking head readiness');
          }

          // Note: ENQUEUE from PlaybackStarted can trigger System.ExceptionEncountered on some Alexa runtimes.
          // Keep Started as state-repair only; queueing remains anchored to NearlyFinished.
          return handlerInput.responseBuilder.getResponse();
        } catch (e) {
          console.log('PlaybackStarted handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      if (eventType === 'AudioPlayer.PlaybackFailed') {
        try {
          console.log('AudioPlayer event:', eventType);
          try {
            await apiSetWasPlaying({ token: safeStr(token), active: false, stoppedAt: Date.now() });
          } catch (e) {
            console.log('PlaybackFailed: set was-playing inactive failed:', e && e.message ? e.message : String(e));
          }
          return handlerInput.responseBuilder.getResponse();
        } catch (e) {
          console.log('PlaybackFailed handler failed:', e && e.message ? e.message : String(e));
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

          await maybeTopUpVibeQueueFromToken(finishedToken, 'NearlyFinished:');
          const enq = await ensureHeadReady(finishedToken, 'NearlyFinished:', { advanceFromPrevious: true });
          if (enq) return handlerInput.responseBuilder.addDirective(enq).getResponse();

          return handlerInput.responseBuilder.getResponse();

        } catch (e) {
          console.log('NearlyFinished handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      if (eventType === 'AudioPlayer.PlaybackFinished') {
        try {
          console.log('AudioPlayer event:', eventType);
          try {
            await apiSetWasPlaying({ token: safeStr(token), active: false, stoppedAt: Date.now() });
          } catch (e) {
            console.log('PlaybackFinished: set was-playing inactive failed:', e && e.message ? e.message : String(e));
          }
          // Alexa does not allow AudioPlayer.Play directives in PlaybackFinished responses.
          console.log('PlaybackFinished: no directives allowed; no action');
          return handlerInput.responseBuilder.getResponse();
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
