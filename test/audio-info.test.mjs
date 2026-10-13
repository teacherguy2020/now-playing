import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQobuzAudioInfo,
  formatAlsaHardwareOutput,
  normalizeAlsaHardwareProbe,
  parseAudioInfoHtml,
} from '../src/lib/audio-info.mjs';
import { registerConfigMoodeAudioInfoRoutes } from '../src/routes/config.moode-audio-info.routes.mjs';

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, handler) { routes.set(`GET ${path}`, handler); },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const moodeHtml = `
<div class="h5">Input / Output</div>
<li><span class="left">Source</span><span class="right">old.mp3</span></li>
<li><span class="left">Source format</span><span class="right">FLAC 24 bit 44.1 kHz, Stereo</span></li>
<li><span class="left">Decoded to</span><span class="right">Not playing</span></li>
<li><span class="left">Output format</span><span class="right">Not playing</span></li>
<li><span class="left">ALSA mode</span><span class="right"> (plughw)</span></li>
<li><span class="left">Audio chain</span><span class="right">inputCrossfeed &rarr; plughw &rarr; Device</span></li>
<div class="h5">DSP operations</div>
<li><span class="left">Resampling</span><span class="right">Off</span></li>
<li><span class="left">Crossfeed</span><span class="right"> Hz  dB</span></li>
<li><span class="left">Volume type</span><span class="right">Error: Unknow MPD volume type</span></li>
<li><span class="left">Volume levels</span><span class="right">Knob, ALSA Wrong scontrol identifier:, CDSP 0dB</span></li>
`;

const qobuz = {
  active: true,
  source: 'qobuz-connect',
  state: 'play',
  sourceFormat: 'FLAC 24/96 kHz',
  outputFormat: 'PCM 32/96 kHz, 2ch',
  sourceFormatDetails: { codec: 'FLAC', bitDepth: 24, sampleRateHz: 96000, channels: null },
  outputFormatDetails: { codec: 'PCM', bitDepth: 32, sampleRateHz: 96000, channels: 2 },
};

const alsa = normalizeAlsaHardwareProbe([
  'CARD\tcard2\tDAC',
  'PCM\t/proc/asound/card2/pcm0p\tcard2\tDAC\tUSB Audio\tRUNNING',
  'HW\t/proc/asound/card2/pcm0p\taccess: RW_INTERLEAVED',
  'HW\t/proc/asound/card2/pcm0p\tformat: S32_LE',
  'HW\t/proc/asound/card2/pcm0p\tchannels: 2',
  'HW\t/proc/asound/card2/pcm0p\trate: 96000 (96000/1)',
  'STATUS\t/proc/asound/card2/pcm0p\tstate: RUNNING',
].join('\n'));

test('Audio Info HTML parser preserves legacy moOde rows', () => {
  const rows = parseAudioInfoHtml(moodeHtml);
  assert.equal(rows.find((row) => row.key === 'Source')?.value, 'old.mp3');
  assert.equal(rows.find((row) => row.key === 'Audio chain')?.value, 'inputCrossfeed → plughw → Device');
  assert.equal(rows.find((row) => row.key === 'Crossfeed')?.value, 'Off');
});

test('ALSA probe parser reports measured hardware parameters independently of MPD', () => {
  assert.equal(alsa.activeDevice.state, 'running');
  assert.equal(alsa.activeDevice.format, 'S32_LE');
  assert.equal(alsa.activeDevice.sampleRateHz, 96000);
  assert.equal(alsa.activeDevice.channels, 2);
  assert.equal(alsa.activeDevice.measured, true);
  assert.deepEqual(formatAlsaHardwareOutput(alsa), {
    value: 'PCM S32_LE 96 kHz 2ch',
    measured: true,
    state: 'running',
    device: 'DAC / USB Audio',
    format: 'S32_LE',
    sampleRateHz: 96000,
    bitDepth: 32,
    channels: 2,
    provenance: 'alsa-procfs',
    reason: 'Read from the active ALSA playback hw_params/status files',
  });
});

test('Qobuz Audio Info separates reported formats, configured path, and measured output', () => {
  const built = buildQobuzAudioInfo({ moodeRows: parseAudioInfoHtml(moodeHtml), qobuz, alsa });
  const row = (section, key) => built.rows.find((item) => item.section === section && item.key === key);

  assert.equal(row('Input / Output', 'Source').value, 'Qobuz stream (Pibuz renderer)');
  assert.equal(row('Input / Output', 'Source format').value, 'FLAC 24/96 kHz');
  assert.equal(row('Input / Output', 'Decoded to').value, 'PCM 32/96 kHz, 2ch');
  assert.equal(row('Input / Output', 'Output format').value, 'PCM S32_LE 96 kHz 2ch');
  assert.match(row('Input / Output', 'Audio chain').value, /configured moOde\/MPD path/);
  assert.match(row('DSP operations', 'Volume type').value, /Unavailable/);
  assert.doesNotMatch(JSON.stringify(built.rows), /Unknow MPD|Wrong scontrol/);
  assert.equal(built.audio.sourceFormat.format, 'FLAC 24/96 kHz');
  assert.equal(built.audio.decodedPcm.bitDepth, 32);
  assert.equal(built.audio.hardwareOutput.measured, true);
  assert.equal(built.audio.hardwareOutput.conversion, 'Unknown');
});

test('Qobuz Audio Info does not claim hardware output when ALSA is closed', () => {
  const built = buildQobuzAudioInfo({
    moodeRows: parseAudioInfoHtml(moodeHtml),
    qobuz,
    alsa: { available: true, devices: [], activeDevice: null, state: 'not-open' },
  });
  const output = built.rows.find((row) => row.section === 'Input / Output' && row.key === 'Output format');
  assert.equal(output.value, 'Not measured');
  assert.equal(output.measured, false);
  assert.match(built.rows.find((row) => row.key === 'Hardware playback state').value, /not-open/);
});

test('Audio Info route adds Qobuz diagnostics without changing its MPD fallback shape', async () => {
  const app = createApp();
  registerConfigMoodeAudioInfoRoutes(app, {
    requireTrackKey: () => true,
    getQobuzNowPlaying: async () => qobuz,
    probeAlsaHardware: async () => alsa,
    fetchMoodeDeviceMeta: async () => ({ deviceName: 'CAVALLI DAC', piModel: 'Raspberry Pi 5' }),
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(moodeHtml, { status: 200 });
  try {
    const response = createResponse();
    await app.routes.get('GET /config/moode/audio-info')?.({ query: { view: 'rows' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.playback.source, 'qobuz-connect');
    assert.equal(response.body.audio.sourceFormat.provenance, 'pibuz-qobuz-metadata');
    assert.equal(response.body.rows.find((row) => row.key === 'Output format').value, 'PCM S32_LE 96 kHz 2ch');
    assert.equal(response.body.sections, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
