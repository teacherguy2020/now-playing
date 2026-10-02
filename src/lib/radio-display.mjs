import fs from 'node:fs/promises';

// Display-only radio naming. Provider prefixes are not part of the station
// name shown to listeners; stream URLs and logo aliases remain authoritative.
export function radioDisplayName(value = '') {
  return String(value || '').replace(/^\s*iheart\s+/i, '').trim();
}

const radioLogoAliasesURL = new URL('../../config/radio-logo-aliases.json', import.meta.url);
let radioLogoAliasesTask = null;

function radioStationKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const hostPort = `${url.hostname}${url.port ? `:${url.port}` : ''}`;
    return `${hostPort}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function radioStationHost(raw) {
  try {
    return String(new URL(String(raw || '').trim()).hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

async function loadRadioLogoAliases() {
  if (!radioLogoAliasesTask) {
    radioLogoAliasesTask = fs.readFile(radioLogoAliasesURL, 'utf8')
      .then((raw) => {
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      })
      .catch(() => ({}));
  }
  return radioLogoAliasesTask;
}

const genericRadioStationName = (value) => /^(?:radio|live radio|radio station|live stream|stream|unknown)$/i.test(
  String(value || '').trim(),
);

/**
 * Preserve the station identity independently of ICY/iTunes song metadata.
 * A stream URL is stable while a matched song's artist/album fields are not.
 */
export async function radioStationNameForFile(file, preferredName = '') {
  const preferred = radioDisplayName(preferredName);
  if (preferred && !genericRadioStationName(preferred)) return preferred;

  const aliases = await loadRadioLogoAliases();
  const key = radioStationKey(file);
  const host = radioStationHost(file);
  const alias = radioDisplayName(aliases?.[key] || aliases?.[host] || '');
  if (alias) return alias;

  // Keep an existing generic label only when there is no better stream hint;
  // otherwise use the host as a useful, deterministic last resort.
  return preferred || host;
}
