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
    apiGetWasPlaying,
    apiAlexaNaturalFinish,
    apiVibeNowPlaying,
    apiQueueWizardApply,
  } = deps;

  async function postWasPlaying(payload, logPrefix) {
    const p = payload || {};
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await apiSetWasPlaying(p);
        if (attempt > 1) {
          console.log(logPrefix, 'set was-playing succeeded on retry');
        }
        return true;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log(logPrefix, `set was-playing attempt ${attempt} failed:`, msg);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }
    return false;
  }

  async function ensureHeadReady(previousToken, logPrefix, options) {
    const opts = options || {};
    const prevToken = safeStr(previousToken);

    if (!prevToken) {
      console.log(logPrefix, 'missing previous token; cannot ENQUEUE');
      return { directive: null, reason: 'missing-token' };
    }

    if (enqueueAlreadyIssuedForPrevToken(prevToken)) {
      console.log(logPrefix, 'enqueue already issued for previous token; no action');
      return { directive: null, reason: 'already-enqueued' };
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
      return { directive: null, reason: 'no-next' };
    }

    const nextFile = safeStr(snap.file);
    const nextPos0 = safeNum(snap.songpos, null);
    const nextSongId = safeNum(snap.songid, null);

    if (!nextFile || nextPos0 === null) {
      console.log(logPrefix, 'invalid next candidate; skipping ENQUEUE');
      return { directive: null, reason: 'invalid-next' };
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
      return { directive: null, reason: 'build-failed' };
    }

    let successorToken = candidateToken;
    try {
      const enqToken = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.token : '';
      const enqUrl = enq.audioItem && enq.audioItem.stream ? enq.audioItem.stream.url : '';
      // Keep the exact token Alexa will receive so Skip can honor an already
      // queued successor instead of selecting the next MPD head after this
      // track has been removed from the live queue.
      if (enqToken) successorToken = enqToken;
      if (enqToken && enqUrl) rememberIssuedStream(enqToken, enqUrl, 0);
    } catch (e) {}

    try {
      await advanceFromTokenIfNeeded(candidateToken);
      console.log(logPrefix, 'advanced MPD head for enqueued track pos0=', nextPos0, 'songid=', nextSongId);
    } catch (e) {
      console.log(logPrefix, 'advance after enqueue failed:', e && e.message ? e.message : String(e));
    }

    markEnqueuedToken(candidateToken, prevToken);

    // Record the successor before Alexa receives the directive. If Alexa sends
    // PlaybackFinished for the previous track before PlaybackStarted for the
    // successor, this marker prevents the final-track fallback from ending
    // Alexa Mode during a normal transition.
    try {
      const marked = await postWasPlaying({
        active: true,
        queuedNextToken: successorToken,
        queuedNextForToken: prevToken,
      }, `${logPrefix} successor:`);
      if (!marked) console.log(logPrefix, 'successor marker was not persisted');
    } catch (e) {
      console.log(logPrefix, 'successor marker failed:', e && e.message ? e.message : String(e));
    }

    console.log(logPrefix, 'ENQUEUE next:', nextFile, 'pos0=', nextPos0, 'songid=', nextSongId);
    console.log(logPrefix, 'enqueue directive:', JSON.stringify(enq, null, 2));

    return { directive: enq, reason: 'enqueued' };
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
          await postWasPlaying({
            token: safeStr(token),
            active: false,
            stoppedAt: Date.now(),
            pendingNaturalFinishToken: '',
            pendingNaturalFinishAt: 0,
            queuedNextToken: '',
            queuedNextForToken: '',
          }, 'PlaybackStopped:');
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
            // Keep this write path minimal and deterministic (token metadata only)
            // so was-playing updates reliably on every track transition.
            const p = parseTokenB64(safeStr(token)) || {};
            const ok = await postWasPlaying({
              token: safeStr(token),
              file: safeStr(p.file),
              title: decodeHtmlEntities(safeStr(p.title || '')),
              artist: decodeHtmlEntities(safeStr(p.artist || '')),
              album: decodeHtmlEntities(safeStr(p.album || '')),
              playbackTarget: 'echo',
              playbackMode: 'alexa',
              startedAt: Date.now(),
              active: true,
              pendingNaturalFinishToken: '',
              pendingNaturalFinishAt: 0,
              queuedNextToken: '',
              queuedNextForToken: '',
            }, 'PlaybackStarted:');
            if (ok) console.log('PlaybackStarted: set was-playing ok for file:', safeStr(p.file));
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
          await postWasPlaying({
            token: safeStr(token),
            active: false,
            stoppedAt: Date.now(),
            pendingNaturalFinishToken: '',
            pendingNaturalFinishAt: 0,
            queuedNextToken: '',
            queuedNextForToken: '',
          }, 'PlaybackFailed:');
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
          const result = await ensureHeadReady(finishedToken, 'NearlyFinished:', { advanceFromPrevious: true });
          if (result && result.directive) {
            return handlerInput.responseBuilder.addDirective(result.directive).getResponse();
          }

          // A missing successor is only a candidate final track. PlaybackFinished
          // is the authoritative confirmation, and may arrive in another Lambda
          // invocation, so persist the candidate through Now Playing.
          if (result && result.reason === 'no-next') {
            await postWasPlaying({
              token: finishedToken,
              active: true,
              pendingNaturalFinishToken: finishedToken,
              pendingNaturalFinishAt: Date.now(),
              queuedNextToken: '',
              queuedNextForToken: '',
            }, 'NearlyFinished:');
            console.log('NearlyFinished: persisted final-track candidate');
          }

          return handlerInput.responseBuilder.getResponse();

        } catch (e) {
          console.log('NearlyFinished handler failed:', e && e.message ? e.message : String(e));
          return handlerInput.responseBuilder.getResponse();
        }
      }

      if (eventType === 'AudioPlayer.PlaybackFinished') {
        try {
          console.log('AudioPlayer event:', eventType);
          const finishedToken = safeStr(token);
          let isFinalTrack = false;
          let finalCandidateRead = false;
          try {
            const inspectFinalState = (state) => {
              const wasPlaying = state && state.wasPlaying ? state.wasPlaying : state;
              const pendingFinalToken = safeStr(wasPlaying && wasPlaying.pendingNaturalFinishToken);
              const currentToken = safeStr(wasPlaying && wasPlaying.token);
              const queuedNextToken = safeStr(wasPlaying && wasPlaying.queuedNextToken);
              const queuedNextForToken = safeStr(wasPlaying && wasPlaying.queuedNextForToken);
              const hasQueuedSuccessor = !!finishedToken
                && queuedNextForToken === finishedToken
                && !!queuedNextToken;
              const modeIsActive = !!(wasPlaying?.modeActive || state?.nowPlaying?.modeActive);
              const pendingFinalMatch = modeIsActive && !!finishedToken && pendingFinalToken === finishedToken;
              const activeTokenFallback = !!finishedToken
                && modeIsActive
                && !!wasPlaying?.active
                && currentToken === finishedToken
                && !hasQueuedSuccessor;

              return {
                isFinalTrack: pendingFinalMatch || activeTokenFallback,
                pendingFinalMatch,
                activeTokenFallback,
              };
            };

            let state = await apiGetWasPlaying();
            finalCandidateRead = true;

            let inspected = inspectFinalState(state);
            // PlaybackFinished can race PlaybackNearlyFinished for the same
            // track. Give the queue handoff time to persist its successor
            // marker before treating an active token as the final track.
            if (inspected.activeTokenFallback && !inspected.pendingFinalMatch) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              try {
                state = await apiGetWasPlaying();
                inspected = inspectFinalState(state);
              } catch (e) {
                console.log('PlaybackFinished: final-track grace recheck failed:', e && e.message ? e.message : String(e));
              }
            }

            isFinalTrack = inspected.isFinalTrack;
            if (inspected.activeTokenFallback && !inspected.pendingFinalMatch) {
              console.log('PlaybackFinished: using active-token final-track fallback');
            }
          } catch (e) {
            console.log('PlaybackFinished: could not read final-track candidate:', e && e.message ? e.message : String(e));
          }

          await postWasPlaying({
            token: finishedToken,
            active: false,
            stoppedAt: Date.now(),
            queuedNextToken: '',
            queuedNextForToken: '',
            ...(!finalCandidateRead || isFinalTrack ? {} : { pendingNaturalFinishToken: '', pendingNaturalFinishAt: 0 }),
          }, 'PlaybackFinished:');

          if (isFinalTrack && typeof apiAlexaNaturalFinish === 'function') {
            let acknowledged = false;
            for (let attempt = 1; attempt <= 2 && !acknowledged; attempt += 1) {
              try {
                await apiAlexaNaturalFinish({ source: 'alexa-skill', reason: 'playback-finished' });
                acknowledged = true;
                console.log('PlaybackFinished: natural Alexa completion acknowledged');
              } catch (e) {
                console.log('PlaybackFinished: natural Alexa completion attempt', attempt, 'failed:', e && e.message ? e.message : String(e));
                if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
              }
            }
          }
          // Alexa does not allow AudioPlayer.Play directives in PlaybackFinished responses.
          console.log('PlaybackFinished: no directives allowed; finalTrack=', isFinalTrack);
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
