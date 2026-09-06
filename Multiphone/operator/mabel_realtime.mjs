#!/usr/bin/env node
/** Mabel Realtime voice agent: live SSL 2 audio in, streamed voice out. */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, writeFile, unlink } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { harmony_press_many, defaultClient as harmonyClient } from './harmony_hub.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1] || '');
}
const input = args.get('input') || ':0';
const model = args.get('model') || 'gpt-realtime';
const mabelUrl = args.get('mabel-url') || 'http://127.0.0.1:8788';
const startOffScript = args.has('off-script');
const MAX_MULTIPHONE_NUMBER = 170;
const idleSeconds = Math.max(5, Number(args.get('idle-seconds') || 15));
// Keep a tiny settling period after local playback drains, but do not leave
// callers waiting behind the old quarter-second blind spot.
const listenDelayValue = args.get('listen-delay-ms');
const listenDelayMs = Math.max(0, Number(listenDelayValue === undefined ? 0 : listenDelayValue));
// Finalize short caller turns promptly so the number confirmation does not
// feel delayed. Keep this configurable because noisy rooms may need a longer
// silence window to capture compound numbers reliably.
const vadSilenceValue = args.get('vad-silence-ms');
const vadSilenceMs = Math.max(50, Number(vadSilenceValue === undefined ? 150 : vadSilenceValue));
// Confirmation answers are short (“yes”, “right”, or a brief correction),
// so endpoint them sooner than the initial number utterance. Keep the latter
// longer to avoid clipping compound numbers in the noisy record room.
const confirmationVadSilenceValue = args.get('confirmation-vad-silence-ms');
const confirmationVadSilenceMs = Math.max(50, Number(
  confirmationVadSilenceValue === undefined ? 250 : confirmationVadSilenceValue,
));
const voicePlaybackRate = 1.1;
const confirmationPlaybackRate = 1.2;
const retrievalAudioTailGraceMs = 750;
const duckSteps = Math.max(0, Math.min(100, Number(args.get('duck-steps') === undefined ? 40 : args.get('duck-steps'))));
const duckInterPressValue = args.get('duck-inter-press-ms');
const duckInterPressMs = Math.max(0, Number(duckInterPressValue === undefined ? 0 : duckInterPressValue));
const restoreInterPressValue = args.get('restore-inter-press-ms');
const restoreInterPressMs = Math.max(0, Number(restoreInterPressValue === undefined ? 5 : restoreInterPressValue));
const soundsDir = args.get('sounds-dir') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sounds');
const soundFiles = {
  ringback: 'phone-ringback-answer-click.m4a',
  footsteps: 'high-heels-walk-2s.m4a',
  hangup: 'phone-hangup-click.m4a',
};
const footstepsEnabled = args.get('footsteps') !== 'off';
const ambienceFile = path.join(soundsDir, 'shyvers-office-ambiance.mp3');
const ambienceVolume = String(Math.min(1, Math.max(0, Number(args.get('ambience-volume') || 0.08))));
const apiKey = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'Shyvers Multiphone / OpenAI', '-a', 'mabel-voice', '-w'], { encoding: 'utf8' }).trim();
if (!apiKey) throw new Error('OpenAI API key is not configured; run mabel_voice.py --setup-openai-key first');

const instructions = `You are Mabel, a lively 22-year-old 1940s telephone operator and record spinner for Multiphone in Seattle. Speak only clear American English in brisk, warm, youthful 1940s telephone vernacular. Use light period humor and occasional tasteful affection, but stay concise and never sound like a modern assistant. The caller is already connected to Mabel; she retrieves records from the Multiphone library and never connects, transfers, routes, dials, or “puts through” anyone. Never invent titles, artists, numbers, queue positions, or service results. Valid numbered records are 1 through ${MAX_MULTIPHONE_NUMBER}; larger numbers are invalid. Normal mode is a deterministic numbered-request flow: acknowledge a possible number only with a digit-by-digit confirmation question, wait for explicit caller confirmation, then let the client retrieve it. Never retrieve, announce success, or imply completion before confirmation. If the caller corrects the number, repeat the corrected digits and ask again. After a successful request, accurately announce the service result, give a brief warm goodbye, and end the call. If the caller says goodbye, respond briefly and end. Keep scripted prompts exact when the client supplies wording. In off-script mode, handle only the enabled music actions, then confirm and end after a successful playback action; now-playing may continue the conversation.`;
const finalSelectionInstruction = 'Important current call behavior: after every successful numbered selection, announce the result, give a brief goodbye, and end the call after speaking. Do not keep listening for another request.';
const recordReactionInstruction = 'After naming a supplied title and artist, usually add exactly one short personal reaction, unless the announcement needs to stay especially brisk. Keep it subjective and playful, such as “great choice,” “one of my faves,” “love this one,” “you clearly have great taste,” “this is a real honey,” or “that one has plenty of pep.” Use at most one reaction, with no long commentary. Do not invent biographical or catalog facts. Do not claim that a record gets lots of requests or is topping the charts unless the service explicitly provides that fact; those are factual claims, not personal opinions.';
const retrievalInstruction = 'For numbered requests, say each digit separately in one brief confirmation question and wait for confirmation. Never say “I heard” or “correct?”, and never retrieve before confirmation. A corrected number replaces the old one and must be confirmed again. After confirmation, give only a short businesslike retrieval acknowledgment. A surprise request is a separate local flow: choose privately from the real Multiphone library, do not ask for or confirm a number, and return only with the service-provided record facts.';
const speedInstruction = 'Speak about 10% faster than ordinary conversation while remaining crisp and intelligible—brisk, but never rushed.';
const affectionateAddressInstruction = 'Use the approved affectionate forms of address sparingly and naturally—at most once every few turns, and usually not at all in a short scripted exchange. Keep most replies free of pet names. When one fits, choose only one: honey, sport, dear, kiddo, boss, sugar, sweetheart, my dear, doll, or champ. Keep Mabel fun, warm, and lightly flirtatious, tasteful, concise, and professionally demure; never stack multiple terms in one reply or force one into every stage.';
const libraryRetrievalBoundary = 'The caller is already connected. Mabel retrieves a 78 from the Multiphone library. Before confirmation, ask only the brief digit-by-digit question. Never say connect, connecting, dial, dialing, transfer, route, put through, or imply that a request is complete. Say record, song, or tune—not selection—and use retrieve, grab, fetch, or get the record.';
const clemsPlaceContext = 'The direct song-transmission line serves Clem’s Place, a lively bar in Seattle. Mention Clem’s Place occasionally and naturally—especially when referring to records waiting there—but do not force it into every reply or imply that you are connecting the caller to the bar. When saying “Clem’s Place,” put the vocal emphasis on “Clem’s” and say “Place” more lightly: “CLEM’s place.”';
const normalGreetingInstruction = 'Say exactly one of these brief greetings, with no improvisation: “Multiphone! Mabel here—hello to Clem’s Place. Number, please.”, “Multiphone! Mabel here—hope everyone’s having a great time at Clem’s. What number, please?”, or “Multiphone! Mabel here—hello to Clem’s Place. Which number, please?” Begin with Multiphone, identify Mabel, acknowledge Clem’s Place, and ask for the song number. The caller is already connected; Mabel retrieves a record. Do not describe the request as dialing, connecting, transferring, routing, or putting anyone through. Use an affectionate name only occasionally, not in this greeting every time.';
const confirmationQuestionDeliveryInstruction = 'This is a turn-taking question, not a statement: ALWAYS finish with a clearly audible high-rising question contour. Lift the pitch on the final syllable of the final digit and leave a tiny beat afterward so the caller hears that Mabel is waiting for an immediate yes-or-no reply. Never let the pitch fall on the final digit, even after an apology. Never deliver the confirmation as a directive, announcement, or flat statement.';
const confirmationStyleInstruction = `For every number confirmation, make it an unmistakable yes-or-no question. ${confirmationQuestionDeliveryInstruction} Keep the digit-by-digit number at the very end: “You’re requesting one-four-eight?”, “Just confirming one-four-eight?”, or “That’s number one-four-eight?”. Never put the number first with a trailing “okay?”, “right?”, or “yeah?”.`;
const offScriptTriggerPattern = /\boff[ -]?script\b|\bi(?:['’]m| am)\s+a\s+v(?:\.?i\.?p\.?)\b/i;
const sessionInstructions = startOffScript
  ? `${instructions} ${speedInstruction} ${affectionateAddressInstruction} ${retrievalInstruction} ${confirmationStyleInstruction} ${libraryRetrievalBoundary} ${clemsPlaceContext} ${finalSelectionInstruction} This is a VIP-line call started by the iPad Shortcut. It's already off-script; do not treat it as a normal numbered Multiphone call. The opening must acknowledge the VIP line and ask what the caller wants to hear.`
  : `${instructions} ${speedInstruction} ${affectionateAddressInstruction} ${retrievalInstruction} ${confirmationStyleInstruction} ${libraryRetrievalBoundary} ${clemsPlaceContext} ${finalSelectionInstruction}`;
const tool = {
  type: 'function', name: 'submit_multiphone_number',
  description: "After a brief spoken retrieval acknowledgment, queue a Multiphone record number in the normal FIFO order.",
  parameters: { type: 'object', properties: { number: { type: 'integer', minimum: 1, maximum: MAX_MULTIPHONE_NUMBER } }, required: ['number'], additionalProperties: false },
};
const playNowTool = {
  type: 'function', name: 'play_multiphone_now',
  description: "Immediately play the just-requested Multiphone record, interrupting the currently playing record if necessary. Use only after the caller explicitly asks to hear their most recent record right now.",
  parameters: { type: 'object', properties: { number: { type: 'integer', minimum: 1, maximum: MAX_MULTIPHONE_NUMBER } }, required: ['number'], additionalProperties: false },
};
const goOffScriptTool = {
  type: 'function', name: 'go_off_script',
  description: "Enter expanded music-request mode only when the caller explicitly says 'off script', asks Mabel to go off script, or says 'I'm a VIP'.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};
const offscriptTools = [
  { type: 'function', name: 'offscript_play_album', description: 'Play an entire matching album using the existing Now Playing album behavior.', parameters: { type: 'object', properties: { album: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['album'], additionalProperties: false } },
  { type: 'function', name: 'offscript_play_artist', description: 'Play matching music by an artist, shuffled.', parameters: { type: 'object', properties: { artist: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['artist'], additionalProperties: false } },
  { type: 'function', name: 'offscript_play_playlist', description: 'Play a matching saved playlist.', parameters: { type: 'object', properties: { playlist: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['playlist'], additionalProperties: false } },
  { type: 'function', name: 'offscript_play_mix', description: 'Build and play a mix of two or more artists.', parameters: { type: 'object', properties: { artists: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 }, minItems: 2, maxItems: 8 } }, required: ['artists'], additionalProperties: false } },
  { type: 'function', name: 'offscript_now_playing', description: 'Report what is currently playing.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
];

async function post(path, body) {
  const response = await fetch(`${mabelUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Mabel service HTTP ${response.status}`);
  return payload;
}

const session = await post('/shyvers/call', { event: 'coin', station: "Clem's Place", suppressGreeting: true });
const secondsSinceLastCall = Number.isFinite(Number(session.secondsSinceLastCall))
  ? Number(session.secondsSinceLastCall)
  : null;
const recentCaller = secondsSinceLastCall !== null && secondsSinceLastCall <= 300;
let duckPromise = Promise.resolve({ sent: 0 });
let duckRestored = false;
if (duckSteps > 0) {
  duckPromise = harmony_press_many('33760171', 'VolumeDown', duckSteps, {
    client: harmonyClient,
    interPressMs: duckInterPressMs,
  }).catch((error) => {
    console.warn(`Mabel volume ducking unavailable: ${error.message}`);
    return { sent: Number(error.sent) || 0 };
  });
}
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const recorder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation', '-i', input, '-ac', '1', '-ar', '24000', '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
let audioChunks = [];
let assistantSpeaking = false;
let ending = false;
let idleTimer = null;
let allowPlayNow = false;
let lastCallerText = '';
let offScript = startOffScript;
let audioQueue = Promise.resolve();
let effectPlaying = false;
let ambienceActive = false;
let ambienceProcess = null;
let ambienceTimer = null;
let greetingStarted = false;
let stopPromise = null;
let volumeRestorePromise = null;
let footstepsPromise = null;
let deferredPlaybackStart = null;
let pendingNumber = null;
let normalNumberFlow = false;
let numberSelectionInProgress = false;
let numberAcknowledgmentRequested = false;
let numberConfirmationListening = false;
let callerTranscriptBuffer = '';
let audioDoneHandled = false;
const handledAudioResponseIds = new Set();
let activeResponseId = null;
let retrievalAcknowledgmentResolver = null;
let responseInProgress = false;
let responseFinalized = false;
let responseAudioStarted = false;
let responseAudioFinished = false;
const responseIdleWaiters = [];
let responseCreateChain = Promise.resolve();
let confirmationPromptGeneration = 0;
const usageTotals = {
  responses: 0,
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  cached_input_tokens: 0,
  input_audio_tokens: 0,
  output_audio_tokens: 0,
};
let listeningNudgeTimer = null;
let listeningNudgeCount = 0;
let initialGreetingAudioPending = false;
let earlyAnswerBuffering = false;
let earlyAnswerBuffer = [];
let earlyAnswerTimer = null;
// Keep the tail of the caller's answer while the greeting is still draining.
// This catches a number spoken immediately after the greeting without opening
// the microphone for the entire greeting and risking Mabel's own voice being
// transcribed as the caller.
const earlyAnswerWindowMs = 1400;
// Never feed microphone audio from while Mabel is speaking back into Realtime:
// her digit-by-digit confirmation can otherwise be transcribed as the caller's
// correction. Confirmation turns use no tail buffer at all; the mic opens only
// after local playback has fully drained.
const earlyAnswerMaxBytes = 24000 * 2 * 1.6;
const goodbyeLines = [
  'Thanks a lot, bye!',
  'Call again, bye!',
  'Call anytime, buh-bye!',
  'Thanks for calling, bye now!',
  'You’re all set, buh-bye!',
  'I’m on to other calls, take care!',
  'Gotta run, thanks for calling!',
  'Thanks a lot, honey—bye!',
  'Call again, sport—bye!',
  'Call anytime, sweetheart—buh-bye!',
  'Thanks for calling, doll—bye now!',
  'You’re all set, champ—buh-bye!',
  'I’m on to other calls, dear—take care!',
  'Gotta run, my dear—thanks for calling!',
];
const immediatePlaybackLines = [
  'It’s playing now.',
  'It’s spinning now.',
  'I just dropped the needle on it.',
  'That one’s on the turntable now.',
  'Your record is spinning.',
  'The music is underway.',
];
const confirmationTemplates = [
  'You’re requesting {digits}?',
  'Just confirming {digits}?',
  'That’s number {digits}?',
];
const correctionTemplates = [
  "Sorry about that—just confirming {digits}?",
  "Oops, my mistake—just confirming {digits}?",
  "Sorry, I misheard you—just confirming {digits}?",
  "My apologies—just confirming {digits}?",
];
const spokenDigits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function digitsForSpeech(number, separator = ' ') {
  return String(number)
    .split('')
    .map((digit) => spokenDigits[Number(digit)] || digit)
    .join(separator);
}
function immediatePlaybackLine() {
  return immediatePlaybackLines[Math.floor(Math.random() * immediatePlaybackLines.length)];
}
const noResponseSecondNudges = [
  'Are you putting one over on me? I know you’re there… which number, please, buddy?',
  'Are you putting one over on me? I know you’re there… which number, please, pal?',
  'Are you putting one over on me? I know you’re there… which number, please, sailor?',
  'Are you putting one over on me? I know you’re there… which number, please, sweetie?',
  'Are you putting one over on me? I know you’re there… which number, please, honey?',
  'Are you putting one over on me? I know you’re there… which number, please, sugar?',
  'Are you putting one over on me? I know you’re there… which number, please, doll?',
  'Are you putting one over on me? I know you’re there… which number, please, champ?',
  'Are you putting one over on me? I know you’re there… which number, please, kiddo?',
  'Are you putting one over on me? I know you’re there… which number, please, boss?',
  'Are you putting one over on me? I know you’re there… which number, please, my dear?',
];

function sanitizeMabelInstructions(text) {
  return String(text)
    .replace(/\bselections\b/gi, 'records')
    .replace(/\bselection\b/gi, 'record');
}
function send(event) {
  let outgoing = event;
  if (event.type === 'session.update' && event.session?.instructions) {
    outgoing = { ...event, session: { ...event.session, instructions: sanitizeMabelInstructions(event.session.instructions) } };
  } else if (event.type === 'response.create' && event.response?.instructions) {
    outgoing = { ...event, response: { ...event.response, instructions: sanitizeMabelInstructions(event.response.instructions) } };
  }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(outgoing));
}
function setVadSilenceDuration(silenceDurationMs) {
  send({ type: 'session.update', session: {
    type: 'realtime',
    audio: { input: { turn_detection: {
      type: 'server_vad', threshold: 0.5, prefix_padding_ms: 500,
      silence_duration_ms: silenceDurationMs, create_response: false,
    } } },
  } });
}
function waitForResponseIdle(timeoutMs = 6000) {
  if (!responseInProgress) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const index = responseIdleWaiters.indexOf(finish);
      if (index >= 0) responseIdleWaiters.splice(index, 1);
      resolve(true);
    };
    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const index = responseIdleWaiters.indexOf(finish);
      if (index >= 0) responseIdleWaiters.splice(index, 1);
      console.warn('Mabel Realtime: timed out waiting for the previous response to finish.');
      resolve(false);
    }, timeoutMs);
    timeout.unref();
    responseIdleWaiters.push(finish);
  });
}
function markResponseIdle() {
  responseInProgress = false;
  const waiters = responseIdleWaiters.splice(0);
  for (const resolve of waiters) resolve();
}
function maybeMarkResponseIdle() {
  if (!responseFinalized || (responseAudioStarted && !responseAudioFinished)) return;
  markResponseIdle();
}
function queueResponse(response, isStillRelevant = () => true) {
  const run = responseCreateChain.then(async () => {
    // Realtime accepts only one response at a time. This local queue also
    // covers the small interval before response.created arrives, when a
    // second event could otherwise observe responseInProgress === false.
    if (!isStillRelevant()) return false;
    if (!await waitForResponseIdle()) return false;
    if (!isStillRelevant()) return false;
    responseInProgress = true;
    activeResponseId = null;
    audioDoneHandled = false;
    send({ type: 'response.create', ...(response ? { response } : {}) });
    await waitForResponseIdle();
    return true;
  });
  responseCreateChain = run.catch(() => {});
  return run;
}
function cancelActiveResponse() {
  if (!responseInProgress || ws.readyState !== WebSocket.OPEN) return;
  send({ type: 'response.cancel', ...(activeResponseId ? { response_id: activeResponseId } : {}) });
}
function recordResponseUsage(event) {
  const usage = event.response?.usage || event.usage;
  if (!usage) return;
  usageTotals.responses += 1;
  usageTotals.input_tokens += Number(usage.input_tokens) || 0;
  usageTotals.output_tokens += Number(usage.output_tokens) || 0;
  usageTotals.total_tokens += Number(usage.total_tokens) ||
    (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0);
  const inputDetails = usage.input_token_details || {};
  const outputDetails = usage.output_token_details || {};
  usageTotals.cached_input_tokens += Number(inputDetails.cached_tokens ?? inputDetails.cached_input_tokens) || 0;
  usageTotals.input_audio_tokens += Number(inputDetails.audio_tokens) || 0;
  usageTotals.output_audio_tokens += Number(outputDetails.audio_tokens) || 0;
}
function logUsageSummary() {
  if (usageTotals.total_tokens <= 0 && usageTotals.input_tokens <= 0 && usageTotals.output_tokens <= 0) {
    console.log('Mabel usage: no token usage was reported by Realtime.');
    return;
  }
  console.log(`Mabel usage: ${JSON.stringify(usageTotals)}`);
}
function clearListeningNudge() {
  if (listeningNudgeTimer) clearTimeout(listeningNudgeTimer);
  listeningNudgeTimer = null;
}
function clearEarlyAnswerBuffer() {
  if (earlyAnswerTimer) clearTimeout(earlyAnswerTimer);
  earlyAnswerTimer = null;
  earlyAnswerBuffering = false;
  earlyAnswerBuffer = [];
}
function finishRetrievalAcknowledgmentPlayback() {
  if (!retrievalAcknowledgmentResolver) return;
  const resolveAcknowledgment = retrievalAcknowledgmentResolver;
  retrievalAcknowledgmentResolver = null;
  const pcm = Buffer.concat(audioChunks);
  audioChunks = [];
  const playback = pcm.length ? enqueueAudio(() => playWavNow(pcm, voicePlaybackRate, 'retrieval-ack')) : Promise.resolve();
  playback.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, retrievalAudioTailGraceMs));
    resolveAcknowledgment();
  }, resolveAcknowledgment);
}
function flushEarlyAnswerBuffer() {
  if (!earlyAnswerBuffer.length || ws.readyState !== WebSocket.OPEN) {
    earlyAnswerBuffer = [];
    return;
  }
  const buffered = earlyAnswerBuffer;
  earlyAnswerBuffer = [];
  for (const chunk of buffered) {
    send({ type: 'input_audio_buffer.append', audio: chunk.toString('base64') });
  }
}
function armListeningNudge(mode) {
  if (ending || listeningNudgeTimer) return;
  listeningNudgeTimer = setTimeout(async () => {
    listeningNudgeTimer = null;
    if (ending || assistantSpeaking || effectPlaying || numberSelectionInProgress) return;
    if (!await waitForResponseIdle()) return;
    if (ending || assistantSpeaking || effectPlaying || numberSelectionInProgress) return;
    const nudgeLines = mode === 'confirmation'
      ? [
          () => confirmationTemplates[Math.floor(Math.random() * confirmationTemplates.length)]
            .replace('{digits}', digitsForSpeech(pendingNumber, '-')),
          () => 'Are you there? Say yes, or give me the number again, please.',
          () => 'Just talk into the top of the Multiphone—there’s a microphone there. Say yes or correct the number.',
          () => 'Hm, seems like we might have a bad connection. Last chance—yes, or give me the song number again.',
        ]
      : [
          () => 'Number, please.',
          () => noResponseSecondNudges[Math.floor(Math.random() * noResponseSecondNudges.length)],
          () => 'Just talk into the top of the Multiphone—there’s a microphone there. Which number, please?',
          () => 'Hm, seems like we might have a bad connection. Last chance for a song number, please.',
        ];
    if (listeningNudgeCount >= nudgeLines.length) {
      ending = true;
      return stop(0);
    }
    const nudge = nudgeLines[listeningNudgeCount]();
    listeningNudgeCount += 1;
    if (mode === 'confirmation' && pendingNumber !== null) {
      queueResponse({
        tool_choice: 'none',
        instructions: `Say exactly this brief confirmation reminder in lively 1940s Mabel style: “${nudge}” If digits are included, say them as one brisk, nearly continuous operator phrase with only tiny natural gaps; do not over-enunciate or add dramatic pauses. ${confirmationQuestionDeliveryInstruction} Do not add any other text, explanation, thanks, or goodbye. Do not call a tool.`,
      });
      return;
    }
    queueResponse({
        tool_choice: 'none',
        instructions: `The caller has not given a song number and has said nothing. Say only this exact brief reminder in lively 1940s Mabel style: “${nudge}” Copy it word for word. Do not improvise, answer a question, infer any device or phone number, mention a number other than the quoted words, or add an explanation. Do not say “You got it,” “Got it,” “Sure thing,” “Putting you through,” “Connecting,” “Dialing,” “Thanks,” or any goodbye. Do not mention Clem’s Place. Do not call a tool.`,
      });
  }, 2000);
  listeningNudgeTimer.unref();
}
function enqueueAudio(task) {
  const next = audioQueue.then(task, task);
  audioQueue = next.catch(() => {});
  return next;
}
function playEffectNow(name) {
  const filename = soundFiles[name];
  const file = path.join(soundsDir, filename);
  if (!existsSync(file)) {
    console.warn(`Mabel sound effect missing: ${file}`);
    return Promise.resolve();
  }
  effectPlaying = true;
  return new Promise((resolve) => {
    let settled = false;
    const maxDurationMs = name === 'ringback' ? 9000 : name === 'footsteps' ? 6000 : 4000;
    let timeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      effectPlaying = false;
      resolve();
    };
    // Keep the effects present but tuck them under Mabel's voice/music bed.
    const volume = name === 'ringback' ? '0.125' : name === 'footsteps' ? '0.25' : '0.5';
    const playback = spawn('afplay', ['-v', volume, file], { stdio: 'ignore' });
    playback.once('error', finish);
    playback.once('close', finish);
    timeout = setTimeout(() => {
      playback.kill('SIGTERM');
      finish();
    }, maxDurationMs);
  });
}
function enqueueEffect(name) { return enqueueAudio(() => playEffectNow(name)); }
function startAmbience() {
  if (ambienceActive || !existsSync(ambienceFile)) {
    if (!existsSync(ambienceFile)) console.warn(`Mabel ambience missing: ${ambienceFile}`);
    return;
  }
  ambienceActive = true;
  const playNext = () => {
    if (!ambienceActive) return;
    const playback = spawn('afplay', ['-v', ambienceVolume, ambienceFile], { stdio: 'ignore' });
    ambienceProcess = playback;
    const finish = () => {
      if (ambienceProcess !== playback) return;
      ambienceProcess = null;
      if (ambienceTimer) clearTimeout(ambienceTimer);
      ambienceTimer = null;
      if (ambienceActive) setTimeout(playNext, 25);
    };
    playback.once('error', finish);
    playback.once('close', finish);
    // Recover if Core Audio leaves an ambience player stuck.
    ambienceTimer = setTimeout(() => {
      if (ambienceProcess === playback) {
        playback.kill('SIGTERM');
        finish();
      }
    }, 30000);
  };
  playNext();
}
function stopAmbience() {
  ambienceActive = false;
  if (ambienceTimer) clearTimeout(ambienceTimer);
  ambienceTimer = null;
  if (ambienceProcess) ambienceProcess.kill('SIGTERM');
  ambienceProcess = null;
}
function soundsLikeSongNumber(text) {
  const number = songNumberFromText(text);
  return Number.isInteger(number) && number >= 1 && number <= MAX_MULTIPHONE_NUMBER;
}
function numberCandidateFromText(text) {
  // Transcripts commonly include terminal punctuation (for example,
  // “one fifteen.”). Strip it before matching compound spoken numbers.
  const value = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const digit = value.match(/\b\d+\b/);
  if (digit) return Number(digit[0]);
  const digitWords = { zero: 0, oh: 0, naught: 0, one: 1, two: 2, three: 3, tree: 3, free: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const digitTokens = value.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < digitTokens.length; i += 1) {
    let j = i;
    let digits = '';
    while (j < digitTokens.length && digitWords[digitTokens[j]] !== undefined) {
      digits += String(digitWords[digitTokens[j]]);
      j += 1;
    }
    if (digits.length >= 2 && digits.length <= 3) {
      const number = Number(digits);
      if (number >= 1) return number;
    }
    if (j > i) i = j - 1;
  }
  const units = { one: 1, two: 2, three: 3, tree: 3, free: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const small = { ...units, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const tokens = value.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === 'and') continue;
    if (small[tokens[i]] !== undefined || tens[tokens[i]] !== undefined) {
      let number = small[tokens[i]] ?? tens[tokens[i]];
      let j = i + 1;
      if (tokens[j] === 'hundred' && small[tokens[i]] !== undefined && small[tokens[i]] < 10) {
        number *= 100;
        j += 1;
        if (tokens[j] === 'and') j += 1;
        if (tens[tokens[j]] !== undefined) {
          number += tens[tokens[j]];
          j += 1;
          if (units[tokens[j]] !== undefined) number += units[tokens[j]];
        } else if (small[tokens[j]] !== undefined && small[tokens[j]] < 10) {
          number += small[tokens[j]];
        }
      } else if (tens[tokens[i]] !== undefined && units[tokens[j]] !== undefined) {
        number += units[tokens[j]];
      } else if (small[tokens[i]] !== undefined && small[tokens[i]] < 10 && tens[tokens[j]] !== undefined) {
        // Colloquial forms such as “one fifty” mean 150, not 1 or 51.
        // Include a trailing unit in forms such as “one fifty-five.”
        number = (small[tokens[i]] * 100) + tens[tokens[j]];
        if (units[tokens[j + 1]] !== undefined) number += units[tokens[j + 1]];
      } else if (small[tokens[i]] !== undefined && small[tokens[i]] < 10 && small[tokens[j]] !== undefined && small[tokens[j]] >= 10) {
        // Likewise, “one eleven” means 111 when a caller dictates a
        // three-digit Multiphone number without saying “hundred”.
        number = (small[tokens[i]] * 100) + small[tokens[j]];
      }
      if (number >= 1) return number;
    }
  }
  return null;
}
function songNumberFromText(text) {
  const number = numberCandidateFromText(text);
  return Number.isInteger(number) && number >= 1 && number <= MAX_MULTIPHONE_NUMBER ? number : null;
}
function requestTooHighNumberRedirect(text) {
  if (offScript || ending || pendingNumber !== null || numberAcknowledgmentRequested || numberConfirmationListening) return false;
  const number = numberCandidateFromText(text);
  if (!Number.isInteger(number) || number <= MAX_MULTIPHONE_NUMBER) return false;
  normalNumberFlow = true;
  redirectTooHighNumber();
  return true;
}
function redirectTooHighNumber() {
  queueResponse({
    tool_choice: 'none',
    instructions: `Say exactly this brief redirect in your lively but businesslike Mabel voice: "That number is too high. I can take a song number from 1 through ${MAX_MULTIPHONE_NUMBER}. Which number, please?" Do not confirm, retrieve, or invent a record number. Do not say “dialing,” “connecting,” or “selection.”`,
  });
}
async function requestFastNumberAcknowledgment(text) {
  if (offScript || ending || pendingNumber !== null || numberAcknowledgmentRequested || numberConfirmationListening) return false;
  const value = String(text || '');
  // numberCandidateFromText intentionally understands words such as “one,”
  // but “pick one by Frank Sinatra” is a surprise request, not song number 1.
  if (!looksLikeNumberUtterance(value)) return false;
  const number = songNumberFromText(value);
  if (number === null) return false;
  // Do not commit to 20 while a partial transcript may still become
  // "twenty one" through "twenty five".
  if (/\btwenty\s*$/i.test(value) && !/\btwenty[- ](?:one|two|three|four|five)\b/i.test(value)) return false;
  pendingNumber = number;
  normalNumberFlow = true;
  numberAcknowledgmentRequested = true;
  const generation = ++confirmationPromptGeneration;
  await queueResponse(
    { tool_choice: 'none', instructions: confirmationPrompt(number) },
    () => !ending && pendingNumber === number && numberAcknowledgmentRequested && confirmationPromptGeneration === generation,
  );
  return true;
}
function confirmationPrompt(number, correction = false) {
  const digits = digitsForSpeech(number, '-');
  const template = correction
    ? correctionTemplates[Math.floor(Math.random() * correctionTemplates.length)]
    : confirmationTemplates[Math.floor(Math.random() * confirmationTemplates.length)];
  const line = template.replace('{digits}', digits);
  return `Say exactly one brief confirmation in your lively Mabel voice: "${line}" This is one uninterrupted sentence. Spell out every digit separately as one connected hyphenated phrase with no pauses between digits. The digits must be the final words of the question. ${confirmationQuestionDeliveryInstruction} Do not change, invent, or reorder any digit. Do not say the number as a single cardinal number. Ignore the caller’s other conversation and do not answer it. Do not say you are playing, connecting, fetching, or looking at a shelf. Do not append “okay?”, “right?”, or “yeah?” after the digits, call a tool, add anything else, or ask a different question.`;
}
function retrievalAcknowledgmentPrompt(number) {
  return `The caller has already confirmed the record request. Give one natural, brief retrieval acknowledgment in lively 1940s Mabel style, as an operator physically fetching that exact record from the shelf. Keep the response focused only on getting the record off the shelf. You may say that you are fetching, grabbing, or taking the record from the shelf. Do not describe or imply a telephone connection, transfer, routing, dialing, or putting anyone through. Do not ask whether the caller wants anything else. Do not mention another number, title, artist, queue position, tool, service result, or goodbye. Do not introduce a new topic or handle any caller intent. Finish the acknowledgment and stop so the local retrieval effects can begin.`;
}
function surpriseAcknowledgmentPrompt(artist = null) {
  const constraint = artist ? ` by ${artist}` : '';
  return `Give a natural, concise surprise acknowledgment in lively 1940s Mabel style${constraint}. Vary the wording naturally and sound pleasantly flattered that the caller wants Mabel to choose. End by indicating that Mabel will find one now, such as “Hold on” or “One moment.” Do not mention a number, title, tool, or confirmation. Do not add a second question, goodbye, or outside facts.`;
}
async function requestRetrievalAcknowledgment(number, prompt = retrievalAcknowledgmentPrompt(number)) {
  if (!await waitForResponseIdle()) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (retrievalAcknowledgmentResolver === finish) retrievalAcknowledgmentResolver = null;
      resolve(true);
    };
    retrievalAcknowledgmentResolver = finish;
    const timeout = setTimeout(finish, 15000);
    timeout.unref();
    queueResponse({ tool_choice: 'none', instructions: prompt });
  });
}
function normalizeConfirmationText(text) {
  return String(text || '')
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function isAffirmative(text) {
  // Realtime transcripts often include extra conversational words, so accept
  // a clear affirmative signal anywhere in the turn. Explicit negatives and
  // different number corrections are checked before this function is used.
  const value = normalizeConfirmationText(text);
  // A clipped "yes, please" is sometimes transcribed as just "please".
  // In the closed confirmation state, a standalone please is a reasonable
  // affirmative fallback; explicit negatives and corrections still win.
  return /\b(?:yes|yeah|yep|yup|sure(?: am)?|right|exactly|correct|affirmative)\b|\buh[- ]huh\b|\b(?:you got it)\b|\b(?:that's|that is) (?:right|what i said|the (?:one|number)|it)\b/i.test(value) || value === 'please';
}
function goodbyePrompt(context = 'The caller is ending the call.') {
  return `Give one very brief 1940s-style goodbye as Mabel. ${context} Use 3 to 8 words. Be warm, brisk, and youthful. Vary the wording naturally from recent replies. You may use at most one approved affectionate address, but do not force one. Do not ask a question. Do not mention a record, number, connection, tool, or another request. Do not add anything after the goodbye; this is the final response.`;
}
function isNegative(text) {
  const value = normalizeConfirmationText(text);
  return /\b(?:no|nope)\b|\b(?:wrong|incorrect)\b|\bnot right\b|\b(?:that's|that is) not right\b/i.test(value);
}
function isConfirmationFragment(text) {
  const value = normalizeConfirmationText(text);
  // Short VAD splits such as “What's” are not answers. Leave the local
  // confirmation state listening for the rest of the caller's sentence.
  return /^(?:what|what's|what is|huh|pardon|wait|hold on)$/i.test(value);
}
async function requestNumberConfirmation(number, correction = false) {
  numberAcknowledgmentRequested = true;
  numberConfirmationListening = false;
  const generation = ++confirmationPromptGeneration;
  if (!await waitForResponseIdle()) return;
  await queueResponse(
    { tool_choice: 'none', instructions: confirmationPrompt(number, correction) },
    () => !ending && pendingNumber === number && numberAcknowledgmentRequested && confirmationPromptGeneration === generation,
  );
}
function handleNumberConfirmation(text) {
  // numberConfirmationListening is the normal marker, but derive the state
  // from the pending number too. A speech_started event can clear
  // numberAcknowledgmentRequested before the audio-drain callback updates
  // the marker; confirmation must remain local through that race.
  const confirmationTurn = pendingNumber !== null && (!numberAcknowledgmentRequested || numberConfirmationListening);
  if (!confirmationTurn || ending) return false;
  numberConfirmationListening = true;
  const value = String(text || '');
  if (/\b(?:bye|goodbye|farewell)\b|never mind|good night|i(?:'m| am) leaving/i.test(value)) {
    cancelActiveResponse();
    confirmationPromptGeneration += 1;
    pendingNumber = null;
    numberAcknowledgmentRequested = false;
    numberConfirmationListening = false;
    ending = true;
    queueResponse({ instructions: goodbyePrompt('The caller said goodbye or indicated they are leaving.') });
    return true;
  }
  if (isSurpriseRequest(value)) {
    cancelActiveResponse();
    confirmationPromptGeneration += 1;
    pendingNumber = null;
    numberAcknowledgmentRequested = false;
    numberConfirmationListening = false;
    processSurpriseSelection(surpriseArtistFromText(value)).catch((error) => console.error(`Mabel surprise: ${error.message}`));
    return true;
  }
  // A caller's confirmation turn is closed locally. Cancel any response that
  // may have started from the same audio before the transcript completed.
  cancelActiveResponse();
  const correctedNumber = songNumberFromText(value);
  const tooHighNumber = numberCandidateFromText(value);
  const affirmative = isAffirmative(value);
  const negative = isNegative(value);
  // Rejection or a different number wins over an affirmative in the same
  // transcript. A repeated pending number plus “yes” still confirms.
  if (negative || (correctedNumber !== null && correctedNumber !== pendingNumber)) {
    if (correctedNumber !== null) pendingNumber = correctedNumber;
    requestNumberConfirmation(pendingNumber, true);
    return true;
  }
  if (affirmative) {
    // Prevent a stale model response from leaking between confirmation and
    // the deterministic local retrieval sequence.
    cancelActiveResponse();
    confirmationPromptGeneration += 1;
    const number = pendingNumber;
    pendingNumber = null;
    numberConfirmationListening = false;
    numberAcknowledgmentRequested = false;
    processNumberSelection(number);
    return true;
  }
  if (Number.isInteger(tooHighNumber) && tooHighNumber > MAX_MULTIPHONE_NUMBER) {
    pendingNumber = null;
    numberAcknowledgmentRequested = false;
    numberConfirmationListening = false;
    redirectTooHighNumber();
    return true;
  }
  if (correctedNumber !== null) {
    pendingNumber = correctedNumber;
    requestNumberConfirmation(pendingNumber, true);
    return true;
  }
  if (isConfirmationFragment(value)) return true;
  // Keep the confirmation loop deterministic for unrelated replies such as
  // “what's the song number?”—never fall through to the general assistant.
  requestNumberConfirmation(pendingNumber);
  return true;
}
function surpriseArtistFromText(text) {
  const value = String(text || '')
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Artist-constrained surprise requests must be the caller's complete
  // utterance. Matching a phrase inside ordinary conversation can turn a
  // harmless remark into an unsolicited record pick.
  const match = value.match(/^(?:pick|choose)(?:\s+me)?\s+(?:one|something|a\s+(?:record|song|tune))(?:\s+for\s+me)?\s+by\s+(.+?)\s*$/i)
    || value.match(/^(?:you pick|you choose)\s+(?:one|something|a\s+(?:record|song|tune))(?:\s+for\s+me)?\s+by\s+(.+?)\s*$/i)
    || value.match(/^(?:surprise me|give me a surprise)(?:\s+with)?\s+(?:one|something|a\s+(?:record|song|tune))(?:\s+for\s+me)?\s+by\s+(.+?)\s*$/i);
  if (!match) return null;
  const artist = String(match[1] || '')
    .replace(/\b(?:please|tonight|if you can|for me|would you)\s*$/i, '')
    .trim();
  return artist ? artist.slice(0, 160) : null;
}
function isSurpriseRequest(text) {
  const value = String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (Boolean(surpriseArtistFromText(value))) return true;
  // Choice language is an explicit surprise signal in the pre-number funnel.
  // Keep only a small negation guard so ordinary phrases such as “I don't
  // want a surprise” do not accidentally start a pick.
  if (/\b(?:don't|do not|never|not)\b.{0,24}\b(?:choose|surprise)\b/.test(value)) return false;
  return /\b(?:choose|surprise)\b/.test(value);
}

function isWorkQuestion(text) {
  const value = String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:how(?:'s| is) (?:it going|it going at work|work going|the work going|work|the work|the shift|things at work|things going)|how are (?:things|you doing|things at work|things going at work)|how(?:'s| is) (?:everything|business)|busy (?:night|today|at work|tonight)|what(?:'s| is) it like at work|how(?:'s| is) (?:the )?(?:shop|place) tonight|are you getting (?:a lot of|many|lots of) calls tonight|are (?:the )?calls (?:busy|coming in) tonight|how many calls (?:are you getting|do you have) tonight)$/.test(value);
}

function redirectToNumberRequest(workQuestion = false) {
  if (workQuestion) {
    const workLines = [
      'Busy as a one-armed paperhanger. Number, please?',
      'Ringing off the hook. Which number, please?',
      'Swell and busy here. What number, please?',
    ];
    const line = workLines[Math.floor(Math.random() * workLines.length)];
    queueResponse({
      tool_choice: 'none',
      instructions: `Say exactly this brief reply in lively 1940s Mabel style: “${line}” Do not add anything before or after it, choose a record, offer a surprise pick, mention a title or artist, or ask another question. Do not call a tool.`,
    });
    return;
  }
  queueResponse({
    tool_choice: 'none',
    instructions: 'Give one brief, natural social reply in lively 1940s Mabel style, then ask for the song number. End exactly with “Number, please,” “What number, please?” or “Which number, please?” Do not choose a record, offer a surprise pick, mention a title or artist, or ask any other question. Keep the whole reply under 14 words. Do not call a tool.',
  });
}
function looksLikeNumberUtterance(text) {
  const value = String(text || '').toLowerCase().replace(/[’‘]/g, "'").trim();
  if (/\d/.test(value)) return true;
  if (/^(?:number|song number|record number)\b/.test(value)) return true;
  // Natural requests often put the number after a short request phrase,
  // such as “play me one twenty two” or “I'd like to hear 143”. Keep these
  // local so the model cannot improvise a connection or playback response.
  if (/^(?:play|put on|give me|give us|let(?:'s| us) hear|let me hear|i(?:'d| would) like(?: to hear)?|i want(?: to hear)?|can i get|can i hear|i'll take|how about)\b/.test(value)) {
    return numberCandidateFromText(value) !== null;
  }
  return /^(?:zero|oh|one|two|three|tree|free|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|one hundred)\b/.test(value);
}
function playWavNow(pcm, playbackRate = voicePlaybackRate, label = 'mabel') {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  const file = path.join(tmpdir(), `mabel-realtime-${Date.now()}.wav`);
  return new Promise((resolve) => {
    writeFile(file, wav, (error) => {
      if (error) { resolve(); return; }
      let settled = false;
      let timeout;
      const expectedDurationMs = (pcm.length / 48000) * 1000 / playbackRate;
      const startedAt = Date.now();
      const finish = (exitCode = null, signal = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs + 250 < expectedDurationMs || signal || (exitCode !== null && exitCode !== 0)) {
          console.warn(`Mabel audio playback ended early: ${label}; expected ${Math.round(expectedDurationMs)} ms, got ${elapsedMs} ms, exit=${exitCode ?? 'n/a'}, signal=${signal ?? 'none'}, pcm=${pcm.length} bytes`);
        }
        unlink(file, () => {});
        resolve();
      };
      const playback = spawn('afplay', ['-r', String(playbackRate), '-q', '1', file], { stdio: 'ignore' });
      playback.once('error', finish);
      playback.once('close', (exitCode, signal) => finish(exitCode, signal));
      const maxDurationMs = Math.max(3000, Math.ceil((pcm.length / 48000) * 1000) + 3000);
      timeout = setTimeout(() => {
        playback.kill('SIGTERM');
        finish();
      }, maxDurationMs);
    });
  });
}
async function restoreMusicVolume(delayMs = 0) {
  if (volumeRestorePromise) return volumeRestorePromise;
  volumeRestorePromise = (async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const duckResult = await duckPromise;
    if (duckRestored || duckResult.sent <= 0) return;
    duckRestored = true;
    try {
      await harmony_press_many('33760171', 'VolumeUp', duckResult.sent, {
        client: harmonyClient,
        interPressMs: restoreInterPressMs,
      });
      console.log(`Mabel volume restored: ${duckResult.sent} steps.`);
    } catch (error) {
      console.error(`Mabel volume restore failed: ${error.message}`);
    }
  })();
  return volumeRestorePromise;
}
function stop(code = 0) {
  if (stopPromise) return stopPromise;
  const forceExit = setTimeout(() => process.exit(code), 10000);
  forceExit.unref();
  stopPromise = (async () => {
    if (idleTimer) clearTimeout(idleTimer);
    recorder.kill('SIGTERM');
    stopAmbience();
    audioChunks = [];
    await enqueueEffect('hangup');
    await restoreMusicVolume();
    ws.close();
    await post('/shyvers/end', { sessionId: session.sessionId }).catch(() => {});
    logUsageSummary();
    clearTimeout(forceExit);
    process.exit(code);
  })();
  return stopPromise;
}
function armIdleTimer() {
  if (idleTimer || ending) return;
  idleTimer = setTimeout(() => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    ending = true;
    queueResponse({ instructions: goodbyePrompt('The caller has been quiet and the call is ending.') });
  }, idleSeconds * 1000);
}

async function processNumberSelection(number) {
  if (numberSelectionInProgress || ending) return;
  numberSelectionInProgress = true;
  // A confirmed number gets one quick acknowledgment before Mabel leaves the
  // desk. Keep the mic closed while this response, the heels, and retrieval
  // complete; the acknowledgment must finish before the heels begin.
  await requestRetrievalAcknowledgment(number);
  console.log('Mabel: retrieval acknowledgment finished; fetching the record.');
  footstepsPromise = footstepsEnabled ? enqueueEffect('footsteps') : Promise.resolve();
  let result;
  try {
    result = await post('/shyvers/response', {
      sessionId: session.sessionId, number, playNow: false, suppressSpeech: true,
      deferPlayback: true,
    });
  } catch (error) {
    console.error(`Mabel selection: ${error.message}`);
    result = { ok: false, error: error.message };
  }
  const outcome = result?.result && typeof result.result === 'object' ? result.result : result;
  if (outcome.playbackDeferred && outcome.mpdSongId) {
    deferredPlaybackStart = async () => {
      const started = await post('/shyvers/start-song', {
        sessionId: session.sessionId, songId: Number(outcome.mpdSongId),
      });
      if (!started.ok) throw new Error(started.error || 'the service did not start the selected record');
    };
  }
  let deferredPlaybackSucceeded = false;
  // The selection endpoint reserves/dequeues the record but deliberately
  // defers its MPD play command until the retrieval sound is complete. The
  // previous code created deferredPlaybackStart but never called it, allowing
  // Mabel to announce playback without actually starting the record.
  try {
    // Every confirmed record gets the retrieval sound, including records
    // appended behind an existing desk stack. Previously this await lived
    // inside the deferred-playback branch, so queued records could skip the
    // sound and race the final response.
    await footstepsPromise;
    console.log('Mabel: heels finished.');
    if (deferredPlaybackStart) {
      await deferredPlaybackStart();
      deferredPlaybackStart = null;
      deferredPlaybackSucceeded = true;
    }
  } catch (error) {
    console.error(`Mabel retrieval handoff: ${error.message}`);
  }
  ending = true;
  await waitForResponseIdle();
  const goodbye = goodbyeLines[Math.floor(Math.random() * goodbyeLines.length)];
  const playbackLine = immediatePlaybackLine();
  const trackName = [outcome.title, outcome.artist].filter((value) => String(value || '').trim()).join(' by ');
  let followup = `The caller confirmed Multiphone number ${number}. The service completed that exact numbered record request. ${trackName ? `It identifies the record as "${trackName}"; mention that title and artist accurately. ${recordReactionInstruction} ` : ''}If playback started, say so clearly; otherwise state the exact number of spins before the record using the service result. Do not invent or change the number. Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
  if (outcome.queuedBehindJukebox) {
    const totalJukeboxRecords = Number(outcome.jukeboxQueueLength) || 1;
    const spinsAway = Math.max(1, totalJukeboxRecords - 1);
    followup = `The service reports exactly ${spinsAway} spin${spinsAway === 1 ? '' : 's'} before this newly requested record. Use that exact number; do not guess. ${trackName ? `The authoritative catalog result is exactly “${trackName}”. Say exactly this sentence, once, with no substitutions: “I've got your record: ${trackName}.” Do not invent or replace the title or artist with another name. ${recordReactionInstruction} ` : ''}Then say that the record was added to the others waiting here on my desk for Clem's Place. You must mention Clem's Place and use “for Clem's Place,” not “at Clem's Place.” Do not repeat the title or artist in that sentence. It'll be coming up in ${spinsAway} spin${spinsAway === 1 ? '' : 's'} or so. Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
  } else if (deferredPlaybackSucceeded || outcome.playbackStarted) {
      followup = `The service reports that this record started playing immediately. ${trackName ? `It identifies the record as "${trackName}"; mention that title and artist accurately. ${recordReactionInstruction} ` : ''}Say exactly this approved playback line: "${playbackLine}" Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
  }
  queueResponse({ instructions: followup });
}

async function processSurpriseSelection(artist = null) {
  if (normalNumberFlow || numberSelectionInProgress || ending) return;
  numberSelectionInProgress = true;
  // This is a private choice: do not expose a number or ask the caller to
  // confirm it. Mabel acknowledges, walks to the shelf, and returns with the
  // number and record details only in the final announcement.
  await requestRetrievalAcknowledgment(null, surpriseAcknowledgmentPrompt(artist));
  console.log('Mabel: surprise acknowledgment finished; choosing a record.');
  footstepsPromise = footstepsEnabled ? enqueueEffect('footsteps') : Promise.resolve();
  const surprisePayload = { sessionId: session.sessionId, deferPlayback: true };
  if (artist) {
    surprisePayload.artist = artist;
    surprisePayload.excludeHoliday = true;
  }
  const surprisePromise = post('/shyvers/surprise', surprisePayload);
  let envelope;
  try {
    [envelope] = await Promise.all([surprisePromise, footstepsPromise]);
  } catch (error) {
    console.error(`Mabel surprise: ${error.message}`);
    ending = true;
    const goodbye = goodbyeLines[Math.floor(Math.random() * goodbyeLines.length)];
    await waitForResponseIdle();
    queueResponse({
      instructions: `The surprise record could not be retrieved. Say briefly that the record room could not fetch a surprise record, then say exactly this goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`,
    });
    return;
  }

  const outcome = envelope?.result && typeof envelope.result === 'object' ? envelope.result : envelope;
  console.log('Mabel: heels finished.');
  let surprisePlaybackStarted = Boolean(outcome?.playbackStarted);
  if (outcome?.playbackDeferred && outcome.mpdSongId) {
    try {
      const started = await post('/shyvers/start-song', {
        sessionId: session.sessionId, songId: Number(outcome.mpdSongId),
      });
      if (!started.ok) throw new Error(started.error || 'the service did not start the surprise record');
      surprisePlaybackStarted = true;
    } catch (error) {
      console.error(`Mabel surprise handoff: ${error.message}`);
    }
  }

  ending = true;
  await waitForResponseIdle();
  const number = Number(outcome?.surpriseNumber ?? outcome?.number ?? envelope?.number);
  const trackName = [outcome?.title, outcome?.artist]
    .filter((value) => String(value || '').trim()).join(' by ');
  const goodbye = goodbyeLines[Math.floor(Math.random() * goodbyeLines.length)];
  const playbackLine = immediatePlaybackLine();
  const announcement = Number.isInteger(number)
    ? `I picked number ${number}${trackName ? `, ${trackName}` : ''}.`
    : `I picked this record${trackName ? `, ${trackName}` : ''}.`;
  let followup = `The caller asked you to pick a surprise record${artist ? ` by ${artist}` : ''}. The service honored that constraint and chose a real Multiphone record privately. When you return, say exactly one concise announcement: "${announcement}" Then say that it's one of your favorites. Do not add outside facts or commentary about the song, artist, chart positions, request counts, popularity, biography, or musical qualities. Do not mention the number before this return announcement, and do not ask another question.`;
  if (outcome?.queuedBehindJukebox) {
    const totalJukeboxRecords = Number(outcome.jukeboxQueueLength) || 1;
    const spinsAway = Math.max(1, totalJukeboxRecords - 1);
    followup += `After that, add: "It'll be coming up in ${spinsAway} spin${spinsAway === 1 ? '' : 's'} or so." `;
  } else if (surprisePlaybackStarted) {
    followup += `Then add exactly: "${playbackLine}" `;
  }
  followup += `Then say exactly this goodbye: "${goodbye}" This is the final response and end the call after speaking.`;
  queueResponse({ instructions: followup });
}

ws.on('open', () => {
  console.log('Mabel Realtime is listening. Speak in typical 1940s vernacular.');
  send({ type: 'session.update', session: {
    type: 'realtime', model, output_modalities: ['audio'], instructions: sessionInstructions,
    // Normal-line number handling is entirely local: confirmation and the
    // validated bridge call happen in this process. Keeping tools out of the
    // initial normal session prevents the model from inventing a second number
    // or bypassing the spoken-confirmation gate.
    tools: startOffScript ? [tool, goOffScriptTool, playNowTool, ...offscriptTools] : [], tool_choice: startOffScript ? 'auto' : 'none',
    audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: 'gpt-4o-transcribe', language: 'en', prompt: 'Transcribe only intelligible caller speech in American English. If the caller is silent or the audio is unintelligible, return no words; never guess a phrase from this prompt. Preserve every leading digit in a song number; carefully distinguish 56 from 156 and 100 from 1.' }, turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: vadSilenceMs, create_response: false } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'sage' } },
  } });
});
recorder.stdout.on('data', (chunk) => {
  // Keep the mic closed while Mabel is speaking, but reopen it for the
  // confirmation turn even though pendingNumber remains set until the caller
  // answers. The old pendingNumber === null check silently discarded every
  // confirmation response and left the idle timer to hang up the call.
  // After the confirmation prompt has drained, pendingNumber remains set but
  // numberAcknowledgmentRequested is cleared. Use that stable state as a
  // fallback as well as numberConfirmationListening so a callback-order race
  // cannot leave the confirmation microphone closed.
  const confirmationTurn = pendingNumber !== null && (!numberAcknowledgmentRequested || numberConfirmationListening);
  if (!ending && !numberSelectionInProgress && (pendingNumber === null || confirmationTurn) && !assistantSpeaking && !effectPlaying) {
    send({ type: 'input_audio_buffer.append', audio: chunk.toString('base64') });
  } else if (!ending && !startOffScript && !numberSelectionInProgress && earlyAnswerBuffering &&
      (pendingNumber === null || numberAcknowledgmentRequested)) {
    earlyAnswerBuffer.push(chunk);
    let bufferedBytes = earlyAnswerBuffer.reduce((total, item) => total + item.length, 0);
    while (bufferedBytes > earlyAnswerMaxBytes && earlyAnswerBuffer.length > 1) {
      bufferedBytes -= earlyAnswerBuffer.shift().length;
    }
  }
});
ws.on('message', async (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.type === 'response.created') {
    responseInProgress = true;
    responseFinalized = false;
    responseAudioStarted = false;
    responseAudioFinished = false;
    activeResponseId = event.response?.id || null;
    // Each response has its own audio-done event. Reset here rather than only
    // on caller speech, because the final selection response is created after
    // the confirmation response without another caller turn.
    audioDoneHandled = false;
  }
  if (event.type === 'response.done' || event.type === 'response.failed' || event.type === 'response.cancelled' || event.type === 'response.canceled') {
    if (event.type === 'response.done') recordResponseUsage(event);
    // Wait for the audio-drain event before starting playback. response.done
    // can arrive while the final PCM is still being delivered; playing the
    // buffer here can truncate a generated acknowledgment mid-sentence.
    if (retrievalAcknowledgmentResolver) {
      if (event.type !== 'response.done') {
        finishRetrievalAcknowledgmentPlayback();
      }
    }
    responseFinalized = true;
    // response.done can arrive before the final PCM drain event. Keep the
    // serialized response queue closed until output_audio.done as well, or a
    // retry/confirmation response can be created while the prior question is
    // still playing and get truncated or interleaved.
    if (event.type !== 'response.done') {
      responseAudioFinished = true;
    }
    maybeMarkResponseIdle();
  }
  if (event.type === 'session.updated') {
    if (greetingStarted) return;
    greetingStarted = true;
    initialGreetingAudioPending = !startOffScript;
    // A Shortcut-started VIP call is already a direct connection, so it does
    // not need the public-line ringback effect. For a regular call, start the
    // effect and greeting generation together; the serialized audio queue
    // still guarantees that Mabel's voice begins only after ringback ends.
    if (!startOffScript) {
      enqueueEffect('ringback').then(startAmbience).catch(() => {});
    } else {
      startAmbience();
    }
    if (!ending) {
      await duckPromise;
      const greeting = startOffScript
        ? "Say exactly this brief greeting in English: 'Thanks for calling the VIP line—Mabel here at Multiphone! Whaddya wanna hear?' Do not add a normal song-number prompt or explain the available options."
        : recentCaller
          ? 'Say exactly one brief greeting in lively 1940s Mabel style, choosing one: “Multiphone! Mabel here—back so soon? Which number, please?”, “Multiphone! Mabel here—well, look who’s back! What number, please?”, “Multiphone! Mabel here—you again? Which number, please?”, “Multiphone! Mabel here—I knew you’d be back soon. What number, please?”, or “Multiphone! Mabel here—back again, you rascal? Which number, please?” Do not add anything before or after it. The caller is already connected; Mabel retrieves a record. Do not describe the request as dialing, connecting, transferring, routing, or putting anyone through.'
          : normalGreetingInstruction;
      queueResponse({ instructions: greeting });
    }
  }
  if (event.type === 'response.output_audio.delta' || event.type === 'response.audio.delta') {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    assistantSpeaking = true;
    responseAudioStarted = true;
    responseAudioFinished = false;
    audioChunks.push(Buffer.from(event.delta, 'base64'));
  }
  if (event.type === 'response.output_audio.done' || event.type === 'response.audio.done') {
    responseAudioFinished = true;
    const responseId = event.response_id || activeResponseId;
    if (responseId) {
      if (handledAudioResponseIds.has(responseId)) return;
      handledAudioResponseIds.add(responseId);
      if (handledAudioResponseIds.size > 64) handledAudioResponseIds.delete(handledAudioResponseIds.values().next().value);
    } else {
      if (audioDoneHandled) return;
      audioDoneHandled = true;
    }
    const pcm = Buffer.concat(audioChunks);
    audioChunks = [];
    maybeMarkResponseIdle();
    const primeEarlyAnswer = initialGreetingAudioPending && pendingNumber === null && !startOffScript;
    if (primeEarlyAnswer) initialGreetingAudioPending = false;
    if (retrievalAcknowledgmentResolver) {
      // The complete PCM buffer is now available; only this path may hand
      // the acknowledgment to afplay.
      audioChunks = [pcm];
      finishRetrievalAcknowledgmentPlayback();
      return;
    }
    const confirmationNumber = pendingNumber;
    const confirmationResponse = confirmationNumber !== null && numberAcknowledgmentRequested;
    if (confirmationResponse) {
      const listenAfterConfirmation = () => {
        numberAcknowledgmentRequested = false;
        numberConfirmationListening = true;
        assistantSpeaking = false;
        setVadSilenceDuration(confirmationVadSilenceMs);
        console.log('Mabel: listening for confirmation.');
        armIdleTimer();
        armListeningNudge('confirmation');
      };
      if (pcm.length) {
        enqueueAudio(async () => {
          // Do not buffer or flush any microphone audio during the prompt.
          // Even a zero-length tail window can capture Mabel's final digits
          // and feed them back as a phantom caller correction.
          clearEarlyAnswerBuffer();
          await playWavNow(pcm, confirmationPlaybackRate, 'confirmation');
          listenAfterConfirmation();
        });
      } else {
        listenAfterConfirmation();
      }
      return;
    }
    if (pcm.length) {
      enqueueAudio(async () => {
        // Once Mabel's final wrap-up starts, the caller is no longer speaking.
        // Restore the Denon concurrently with her closing announcement so the
        // music is back at its prior level by the time the call ends.
        if (ending) restoreMusicVolume(4000).catch(() => {});
        if (primeEarlyAnswer) {
          clearEarlyAnswerBuffer();
          const playbackMs = Math.ceil((pcm.length / 48000) * 1000 / voicePlaybackRate);
          earlyAnswerTimer = setTimeout(() => {
            earlyAnswerTimer = null;
            earlyAnswerBuffering = true;
          }, Math.max(0, playbackMs - earlyAnswerWindowMs));
        }
        await playWavNow(pcm);
        if (primeEarlyAnswer) {
          if (earlyAnswerTimer) clearTimeout(earlyAnswerTimer);
          earlyAnswerTimer = null;
          earlyAnswerBuffering = false;
          flushEarlyAnswerBuffer();
        }
        if (numberConfirmationListening) {
          assistantSpeaking = false;
          console.log('Mabel: listening for confirmation.');
          armIdleTimer();
          armListeningNudge('confirmation');
        }
      });
      enqueueAudio(async () => {}).then(() => {
        if (ending) return stop(0);
        if (numberConfirmationListening) return;
        setTimeout(() => {
          assistantSpeaking = false;
          console.log('Mabel: listening.');
          armIdleTimer();
          armListeningNudge('number');
        }, listenDelayMs);
      });
    } else {
      if (ending) return stop(0);
      assistantSpeaking = false;
      if (numberConfirmationListening) {
        console.log('Mabel: listening for confirmation.');
        armIdleTimer();
        armListeningNudge('confirmation');
        return;
      }
      console.log('Mabel: listening.');
      armIdleTimer();
      armListeningNudge('number');
    }
  }
  if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
    if (event.transcript) console.log(`Mabel: ${event.transcript}`);
  }
  if (event.type === 'response.function_call_arguments.done' &&
      (event.name === 'submit_multiphone_number' || event.name === 'play_multiphone_now' || event.name === 'go_off_script' || String(event.name || '').startsWith('offscript_'))) {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (event.name === 'go_off_script') {
      offScript = true;
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: true, mode: 'off-script' }) } });
      send({ type: 'session.update', session: { type: 'realtime', tools: [tool, goOffScriptTool, playNowTool, ...offscriptTools], tool_choice: 'auto' } });
      queueResponse({ instructions: "Reply with a short conspiratorial, cheerful aside such as 'Uh-huh… but don't tell Shyvers!' or 'Well… okay, but don't tell the boss!' Then ask briefly what the caller wants to hear, such as 'Whaddya wanna hear?' Stay in off-script mode." });
      return;
    }
    if (!String(event.name || '').startsWith('offscript_')) {
    // Normal-line numbered selections are handled locally only after an
    // explicit spoken confirmation. Never let a model-generated tool call
    // bypass that gate while a confirmation is still in progress.
    if (event.name === 'submit_multiphone_number' && !offScript) {
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: false, error: 'Wait for the caller to confirm the number before retrieving it.' }) } });
      if (pendingNumber !== null) requestNumberConfirmation(pendingNumber);
      return;
    }
    let number;
    let playNow = false;
    try {
      const callArguments = JSON.parse(event.arguments);
      number = callArguments.number;
    } catch { number = 0; }
    if (!Number.isInteger(number) || number < 1 || number > MAX_MULTIPHONE_NUMBER) return;
    if (event.name === 'play_multiphone_now' && (!allowPlayNow || !/\b(play|put|start).{0,30}\b(now|immediately|next|on)\b|\bright now\b|\bcome on\b/i.test(lastCallerText))) {
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: false, error: 'The caller did not explicitly ask to play it immediately; leave it queued.' }) } });
      queueResponse();
      return;
    }
    if (event.name === 'play_multiphone_now') playNow = true;
    // Start the retrieval sound as soon as Realtime has committed to a valid
    // numbered selection. Reserve the record at the same time, but defer its
    // actual playback until the final Mabel response begins after the heels.
    if (event.name === 'submit_multiphone_number' && !footstepsPromise) {
      footstepsPromise = footstepsEnabled ? enqueueEffect('footsteps') : Promise.resolve();
    }
    const result = await post('/shyvers/response', {
      sessionId: session.sessionId, number, playNow, suppressSpeech: true,
      deferPlayback: event.name === 'submit_multiphone_number' && !playNow,
    });
    const outcome = result?.result && typeof result.result === 'object' ? result.result : result;
    if (outcome.playbackDeferred && outcome.mpdSongId) {
      deferredPlaybackStart = async () => {
        const started = await post('/shyvers/start-song', {
          sessionId: session.sessionId, songId: Number(outcome.mpdSongId),
        });
        if (!started.ok) throw new Error(started.error || 'the service did not start the selected record');
      };
    }
    allowPlayNow = true;
    send({ type: 'session.update', session: { type: 'realtime', tools: [tool, playNowTool] } });
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(outcome) } });
    ending = true;
    const goodbye = goodbyeLines[Math.floor(Math.random() * goodbyeLines.length)];
    let followup = `Give a brief cheerful confirmation, then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
    if (playNow) {
      const playbackLine = immediatePlaybackLine();
      const trackName = [outcome.title, outcome.artist].filter((value) => String(value || '').trim()).join(' by ');
      followup = `The immediate-play request succeeded. ${trackName ? `The service identifies the record as "${trackName}"; mention that title and artist accurately. ${recordReactionInstruction} ` : ''}Say exactly this approved playback line: "${playbackLine}" Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
    } else if (outcome.queuedBehindJukebox) {
      const totalJukeboxRecords = Number(outcome.jukeboxQueueLength) || 1;
      const spinsAway = Math.max(1, totalJukeboxRecords - 1);
      const trackName = [outcome.title, outcome.artist].filter((value) => String(value || '').trim()).join(' by ');
      followup = `The service reports exactly ${spinsAway} spin${spinsAway === 1 ? '' : 's'} before this newly selected record. Use that exact number; do not guess or substitute another number. ${trackName ? `The authoritative catalog result is exactly “${trackName}”. Say exactly this sentence, once, with no substitutions: “I've got your record: ${trackName}.” Do not invent or replace the title or artist with another name. ${recordReactionInstruction} ` : ''}Then say that the record was added to the others waiting here on my desk for Clem's Place. You must mention Clem's Place and use “for Clem's Place,” not “at Clem's Place.” Do not repeat the title or artist in that sentence. Do not mention a modern queue or say the record is stacked in a jukebox. It'll be coming up in ${spinsAway} spin${spinsAway === 1 ? '' : 's'} or so. Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
    } else if (outcome.playbackStarted) {
      const trackName = [outcome.title, outcome.artist].filter((value) => String(value || '').trim()).join(' by ');
      followup = `The service reports that this record started playing immediately. ${trackName ? `It identifies the record as "${trackName}"; mention that title and artist accurately. ${recordReactionInstruction} ` : ''}Say that clearly in a brief, cheerful confirmation; do not say it will wait for other tracks. Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
    }
    queueResponse({ instructions: followup });
    return;
    }
    const action = event.name.slice('offscript_'.length);
    let callArguments = {};
    try { callArguments = JSON.parse(event.arguments || '{}'); } catch { callArguments = {}; }
    const payload = { sessionId: session.sessionId, action };
    if (action === 'play_album') payload.album = String(callArguments.album || '');
    if (action === 'play_artist') payload.artist = String(callArguments.artist || '');
    if (action === 'play_playlist') payload.playlist = String(callArguments.playlist || '');
    if (action === 'play_mix') payload.artists = Array.isArray(callArguments.artists) ? callArguments.artists : [];
    const result = await post('/shyvers/offscript', payload);
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(result) } });
    let followup = 'The service has started the requested off-script music. Say a brief cheerful confirmation that makes clear playback is starting now.';
    if (action === 'now_playing') {
      followup = 'Briefly tell the caller what is currently playing using only the service result, then keep listening in off-script mode.';
    } else {
      ending = true;
      const goodbye = goodbyeLines[Math.floor(Math.random() * goodbyeLines.length)];
      followup += ` Then say exactly this brief goodbye: "${goodbye}". Do not ask another question; this is the final response and end the call after speaking.`;
    }
    queueResponse({ instructions: followup });
  }
  if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
    lastCallerText = String(event.transcript);
    callerTranscriptBuffer = lastCallerText;
    console.log(`You: ${lastCallerText}`);
    // Confirmation is a closed local state. Nothing the caller says during
    // it may enter off-script mode, trigger a surprise pick, or fall through
    // to a model-generated reply. This guard must precede every other intent.
    const confirmationTurn = !offScript && pendingNumber !== null &&
      (numberConfirmationListening || !numberAcknowledgmentRequested);
    if (confirmationTurn) {
      handleNumberConfirmation(lastCallerText);
    } else if (!offScript && pendingNumber !== null) {
      // The confirmation prompt is still being played. Ignore any transcript
      // captured during that protected interval; it may be Mabel's own voice.
    } else if (!offScript && offScriptTriggerPattern.test(lastCallerText)) {
      offScript = true;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      send({ type: 'session.update', session: { type: 'realtime', tools: [tool, goOffScriptTool, playNowTool, ...offscriptTools] } });
      queueResponse({ instructions: "The caller explicitly invoked off-script mode. Reply with a short, conspiratorial, cheerful aside such as 'Uh-huh… but don't tell Shyvers!' or 'Well… okay, but don't tell the boss!' Then ask briefly what the caller wants to hear, such as 'Whaddya wanna hear?' Stay in off-script mode." });
    } else if (!offScript && requestTooHighNumberRedirect(lastCallerText)) {
      // Numeric input gets first refusal, including values above the limit.
    } else if (!offScript && await requestFastNumberAcknowledgment(lastCallerText)) {
      // Numeric input must never be interpreted as a surprise request.
    } else if (!offScript && !normalNumberFlow && !looksLikeNumberUtterance(lastCallerText) &&
        (surpriseArtistFromText(lastCallerText) || isSurpriseRequest(lastCallerText))) {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      processSurpriseSelection(surpriseArtistFromText(lastCallerText)).catch((error) => console.error(`Mabel surprise: ${error.message}`));
    } else if (/\b(bye|goodbye|farewell)\b|see you|good night|i(?:'m| am) leaving/i.test(lastCallerText)) {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      ending = true;
    queueResponse({ instructions: goodbyePrompt('The caller said goodbye or indicated they are leaving.') });
    } else if (numberSelectionInProgress || ending) {
      // A duplicate/late transcription can arrive after confirmation has
      // already started the local retrieval sequence. Never let it fall
      // through to a generic Realtime response such as “Got it, dialing...”.
    } else if (pendingNumber !== null || numberAcknowledgmentRequested) {
      // The number confirmation was already requested from a partial transcript.
    } else if (!offScript && !normalNumberFlow && !looksLikeNumberUtterance(lastCallerText)) {
      // Ordinary conversation before a number is not permission to improvise
      // a record choice. Keep this redirect deterministic so the model cannot
      // reinterpret a social remark as a surprise request.
      redirectToNumberRequest(isWorkQuestion(lastCallerText));
    } else {
      queueResponse();
    }
  }
  if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta) {
    callerTranscriptBuffer += String(event.delta);
    // Wait for the completed utterance. Partial speech can turn “one twenty”
    // into the premature number 1 before the caller has finished speaking.
  }
  if (event.type === 'input_audio_buffer.speech_started' && idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (event.type === 'input_audio_buffer.speech_started') {
    // A caller may speak while any scripted response is still being
    // finalized. Cancel it before handling the new utterance; otherwise the
    // old response can finish alongside the queued redirect/confirmation and
    // leak a generic reply into the closed local state machine.
    if (!offScript && !ending && !numberSelectionInProgress && responseInProgress) cancelActiveResponse();
    if (!offScript && !ending && !numberSelectionInProgress && pendingNumber !== null) {
      // Any new caller turn supersedes a confirmation response that may still
      // be queued behind a canceled one.
      confirmationPromptGeneration += 1;
    }
    clearListeningNudge();
    listeningNudgeCount = 0;
    audioDoneHandled = false;
    footstepsPromise = null;
    callerTranscriptBuffer = '';
    // Keep this marker set while a correction confirmation is still being
    // generated and played. Clearing it here lets a quick follow-up such as
    // “Yeah” race ahead of the corrected prompt and get evaluated against
    // stale confirmation state. The normal listening handoff clears it once
    // the confirmation audio has drained.
    if (pendingNumber === null) numberAcknowledgmentRequested = false;
  }
  if (event.type === 'error') console.error(`Mabel Realtime: ${event.error?.message || 'unknown error'}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(0));
recorder.on('exit', (code) => { if (code && !process.exitCode) stop(1); });
