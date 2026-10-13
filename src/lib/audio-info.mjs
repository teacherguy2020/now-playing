function text(value) {
  return String(value ?? '').trim();
}

function stripTags(value = '') {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeValue(key = '', value = '') {
  const k = String(key || '').toLowerCase();
  const v = String(value || '').trim();
  if (!v) return '—';
  if (v.toLowerCase() === 'not playing') return 'Not playing';
  if (k === 'crossfade' && /^seconds$/i.test(v)) return 'Off';
  if (k === 'crossfeed' && /^hz\s+db$/i.test(v)) return 'Off';
  return v;
}

export function parseAudioInfoHtml(html = '') {
  const out = [];
  const src = String(html || '');
  if (!src) return out;

  let section = 'General';
  const tokenRe = /<div\s+class="h5">([\s\S]*?)<\/div>|<li[^>]*>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = tokenRe.exec(src))) {
    if (match[1] != null) {
      section = decodeEntities(stripTags(match[1])) || section;
      continue;
    }
    const li = match[0] || '';
    const left = li.match(/<span\s+class="left">([\s\S]*?)<\/span>/i);
    const right = li.match(/<span\s+class="right">([\s\S]*?)<\/span>/i);
    if (!left || !right) continue;
    const key = decodeEntities(stripTags(left[1] || ''));
    const value = normalizeValue(key, decodeEntities(stripTags(right[1] || '')));
    if (!key) continue;
    out.push({ section, key, value });
  }
  return out;
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseKeyValueLines(lines = []) {
  const out = {};
  for (const line of lines) {
    const raw = text(line);
    const separator = raw.indexOf(':');
    if (separator <= 0) continue;
    const key = raw.slice(0, separator).trim().toLowerCase();
    const value = raw.slice(separator + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function sampleRateFromValue(value) {
  const match = text(value).match(/\b(\d{4,6})\b/);
  return match ? positiveInt(match[1]) : null;
}

function bitDepthFromFormat(value) {
  const match = text(value).match(/\bS(8|16|24|32|64)_(?:LE|BE)\b/i);
  return match ? positiveInt(match[1]) : null;
}

function stateRank(state = '') {
  const normalized = text(state).toLowerCase();
  if (normalized === 'running') return 4;
  if (normalized === 'paused') return 3;
  if (normalized === 'prepared') return 2;
  if (normalized === 'open') return 1;
  return 0;
}

export function normalizeAlsaHardwareProbe(raw = '') {
  const cards = new Map();
  const devices = new Map();

  for (const line of String(raw || '').split(/\r?\n/)) {
    const fields = line.split('\t');
    const kind = text(fields.shift()).toUpperCase();
    if (!kind) continue;

    if (kind === 'CARD') {
      const card = text(fields[0]);
      if (card) cards.set(card, { card, id: text(fields[1]) });
      continue;
    }

    if (kind === 'PCM') {
      const path = text(fields[0]);
      if (!path) continue;
      devices.set(path, {
        path,
        card: text(fields[1]),
        cardId: text(fields[2]),
        name: text(fields[3]),
        state: text(fields[4]).toLowerCase(),
        hw: [],
        status: [],
      });
      continue;
    }

    const path = text(fields[0]);
    const lineValue = fields.slice(1).join('\t');
    const device = devices.get(path);
    if (!device) continue;
    if (kind === 'HW') device.hw.push(lineValue);
    if (kind === 'STATUS') device.status.push(lineValue);
  }

  const normalizedDevices = Array.from(devices.values()).map((device) => {
    const hw = parseKeyValueLines(device.hw);
    const status = parseKeyValueLines(device.status);
    const state = text(status.state || device.state).toLowerCase() || 'unknown';
    const sampleRateHz = sampleRateFromValue(hw.rate);
    const channels = positiveInt(hw.channels);
    const bitDepth = bitDepthFromFormat(hw.format);
    return {
      ...device,
      cardLabel: cards.get(device.card)?.id || device.cardId || device.card,
      state,
      stateRank: stateRank(state),
      format: text(hw.format),
      sampleRateHz,
      channels,
      bitDepth,
      measured: !!(sampleRateHz && channels && text(hw.format)),
    };
  });

  const activeDevice = normalizedDevices
    .filter((device) => device.stateRank > 0)
    .sort((a, b) => b.stateRank - a.stateRank)[0] || null;

  return {
    available: true,
    devices: normalizedDevices,
    activeDevice,
    state: activeDevice?.state || 'not-open',
  };
}

function rateLabel(sampleRateHz) {
  const rate = positiveInt(sampleRateHz);
  if (!rate) return '';
  const khz = rate / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

export function formatAlsaHardwareOutput(probe) {
  const device = probe?.activeDevice || null;
  const state = text(probe?.state || device?.state).toLowerCase() || 'not-measured';
  const deviceLabel = device
    ? [device.cardLabel || device.cardId || device.card, device.name].filter(Boolean).join(' / ')
    : '';

  if (!device || !device.measured) {
    return {
      value: 'Not measured',
      measured: false,
      state,
      device: deviceLabel,
      format: '',
      sampleRateHz: device?.sampleRateHz || null,
      bitDepth: device?.bitDepth || null,
      channels: device?.channels || null,
      provenance: 'alsa-procfs',
      reason: state === 'not-open' ? 'No open ALSA playback stream was observed' : 'ALSA parameters were unavailable',
    };
  }

  const details = [
    'PCM',
    device.format,
    rateLabel(device.sampleRateHz),
    device.channels ? `${device.channels}ch` : '',
  ].filter(Boolean);

  return {
    value: details.join(' '),
    measured: true,
    state,
    device: deviceLabel,
    format: device.format,
    sampleRateHz: device.sampleRateHz,
    bitDepth: device.bitDepth,
    channels: device.channels,
    provenance: 'alsa-procfs',
    reason: 'Read from the active ALSA playback hw_params/status files',
  };
}

function rowValue(rows, key, section = '') {
  const match = rows.find((row) => (
    String(row?.key || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
      && (!section || String(row?.section || '').trim() === section)
  ));
  return text(match?.value);
}

function configuredAlsaMode(value) {
  const cleaned = text(value).replace(/[()]/g, '').trim();
  return cleaned && cleaned !== '—' ? cleaned : '';
}

function configuredDspLevel(value) {
  const match = text(value).split(',').map((part) => part.trim()).find((part) => /^cdsp\b/i.test(part));
  return match || '';
}

function setRow(rows, section, key, value, metadata = {}) {
  const index = rows.findIndex((row) => (
    String(row?.section || '').trim() === section
      && String(row?.key || '').trim().toLowerCase() === String(key || '').trim().toLowerCase()
  ));
  const next = { section, key, value, ...metadata };
  if (index >= 0) rows[index] = next;
  else rows.push(next);
}

function withConfiguredLabel(value) {
  const normalized = text(value);
  if (!normalized || normalized === '—') return 'Unknown';
  if (/\(configured\b/i.test(normalized)) return normalized;
  return `${normalized} (configured; live Qobuz effect not measured)`;
}

function formatDetailObject(format, details = {}, provenance, valueType) {
  return {
    format: text(format) || 'Unknown',
    codec: text(details?.codec) || '',
    bitDepth: positiveInt(details?.bitDepth),
    sampleRateHz: positiveInt(details?.sampleRateHz),
    channels: positiveInt(details?.channels),
    provenance,
    valueType,
    live: true,
    measured: false,
  };
}

export function buildQobuzAudioInfo({ moodeRows = [], qobuz = {}, alsa = null } = {}) {
  const rows = (Array.isArray(moodeRows) ? moodeRows : []).map((row) => ({ ...row }));
  const sourceFormat = text(qobuz?.sourceFormat) || 'Unknown';
  const decodedFormat = text(qobuz?.outputFormat) || 'Unknown';
  const sourceDetails = qobuz?.sourceFormatDetails || {};
  const decodedDetails = qobuz?.outputFormatDetails || {};
  const hardwareOutput = formatAlsaHardwareOutput(alsa);
  const alsaMode = configuredAlsaMode(rowValue(rows, 'ALSA mode', 'Input / Output'));
  const configuredChain = rowValue(rows, 'Audio chain', 'Input / Output');
  const configuredVolumeLevels = rowValue(rows, 'Volume levels', 'DSP operations');
  const dspLevel = configuredDspLevel(configuredVolumeLevels);
  const state = text(qobuz?.state).toLowerCase() || 'unknown';

  setRow(rows, 'Input / Output', 'Source', 'Qobuz stream (Pibuz renderer)', {
    provenance: 'pibuz-qobuz-metadata', valueType: 'source-reported', live: true, measured: false,
  });
  setRow(rows, 'Input / Output', 'Source format', sourceFormat, {
    provenance: 'pibuz-qobuz-metadata', valueType: 'source-reported', live: true, measured: false,
  });
  setRow(rows, 'Input / Output', 'Decoded to', decodedFormat, {
    provenance: 'pibuz-qobuz-metadata', valueType: 'decoded-reported', live: true, measured: false,
  });
  setRow(rows, 'Input / Output', 'Output format', hardwareOutput.value, {
    provenance: hardwareOutput.provenance, valueType: 'hardware-measured', live: true, measured: hardwareOutput.measured,
  });
  setRow(rows, 'Input / Output', 'ALSA mode', alsaMode
    ? `${alsaMode} (configured; live Qobuz renderer mode not measured)`
    : 'Unknown', {
    provenance: 'moode-audioinfo.php', valueType: 'configured', live: false, measured: false, configured: true,
  });
  setRow(rows, 'Input / Output', 'Audio chain', configuredChain && configuredChain !== '—'
    ? `${configuredChain} (configured moOde/MPD path; live Qobuz path not measured)`
    : 'Unknown', {
    provenance: 'moode-audioinfo.php', valueType: 'configured', live: false, measured: false, configured: true,
  });

  for (const key of ['Resampling', 'Quality', 'Selective', 'Polarity invert', 'Crossfade', 'Crossfeed', 'Parametric EQ', 'Graphic EQ', 'CamillaDSP', 'Replaygain', 'Normalize vol', 'Chip options']) {
    const value = rowValue(rows, key, 'DSP operations');
    if (value && value !== '—') {
      setRow(rows, 'DSP operations', key, withConfiguredLabel(value), {
        provenance: 'moode-audioinfo.php', valueType: 'configured', live: false, measured: false, configured: true,
      });
    }
  }

  setRow(rows, 'DSP operations', 'Volume type', 'Unavailable (MPD-only diagnostic; Qobuz/Pibuz volume is not exposed)', {
    provenance: 'mpd-only', valueType: 'unavailable', live: false, measured: false, configured: false,
  });
  setRow(rows, 'DSP operations', 'Volume levels', dspLevel
    ? `Configured DSP: ${dspLevel}; MPD/ALSA mixer unavailable`
    : 'Unavailable (MPD-only diagnostic)', {
    provenance: 'mpd-only', valueType: 'unavailable', live: false, measured: false, configured: false,
  });

  setRow(rows, 'Evidence', 'Playback source', 'Qobuz Connect / Pibuz', {
    provenance: 'pibuz-qobuz-metadata', valueType: 'source-reported', live: true, measured: false,
  });
  setRow(rows, 'Evidence', 'Renderer state', state, {
    provenance: 'pibuz-qobuz-metadata', valueType: 'source-reported', live: true, measured: false,
  });
  setRow(rows, 'Evidence', 'Hardware playback state', hardwareOutput.state || 'Unknown', {
    provenance: hardwareOutput.provenance, valueType: 'hardware-observed', live: true, measured: hardwareOutput.measured,
  });
  setRow(rows, 'Evidence', 'Hardware device', hardwareOutput.device || 'Unknown', {
    provenance: hardwareOutput.provenance, valueType: 'hardware-observed', live: true, measured: !!hardwareOutput.device,
  });
  setRow(rows, 'Evidence', 'ALSA conversion', 'Unknown (read-only hw_params cannot establish conversion)', {
    provenance: 'alsa-procfs', valueType: 'unavailable', live: true, measured: false,
  });

  return {
    rows,
    audio: {
      sourceFormat: formatDetailObject(sourceFormat, sourceDetails, 'pibuz-qobuz-metadata', 'source-reported'),
      decodedPcm: formatDetailObject(decodedFormat, decodedDetails, 'pibuz-qobuz-metadata', 'decoded-reported'),
      hardwareOutput: {
        ...hardwareOutput,
        conversion: 'Unknown',
      },
      configuredOutput: {
        alsaMode: alsaMode || 'Unknown',
        audioChain: configuredChain && configuredChain !== '—' ? configuredChain : 'Unknown',
        provenance: 'moode-audioinfo.php',
        valueType: 'configured',
        live: false,
        measured: false,
      },
      volume: {
        type: 'Unavailable',
        levels: dspLevel ? `Configured DSP: ${dspLevel}` : 'Unavailable',
        reason: 'MPD-only volume diagnostics do not apply to the Qobuz/Pibuz renderer',
        provenance: 'mpd-only',
        valueType: 'unavailable',
        live: false,
        measured: false,
      },
    },
  };
}
