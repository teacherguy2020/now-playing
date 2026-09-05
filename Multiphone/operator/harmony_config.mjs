#!/usr/bin/env node
/**
 * Parse the escaped Harmony config export into stable, human-readable maps.
 * The export has a few malformed escaped scalar values, so this intentionally
 * parses the device/activity arrays structurally instead of requiring strict
 * JSON for the whole document.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultJsonPath = path.join(root, 'config', 'harmony-mapping.json');
const defaultMarkdownPath = path.join(root, 'config', 'harmony-mapping.md');
const DEFAULT_HUB = {
  id: '3871019',
  host: '10.0.0.21',
  port: 8088,
  domain: 'svcs.myharmony.com',
};

function argMap(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args.set(argv[i].slice(2), argv[i + 1] || '');
  }
  return args;
}

function cleanScalar(value) {
  let text = String(value || '').trim().replace(/,$/, '').trim();
  if (text.startsWith('&quot')) {
    text = text.slice('&quot'.length).replace(/"$/, '');
  } else if (text.startsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      text = text.slice(1).replace(/"$/, '');
    }
  }
  // The export inserts semicolons into keys and scalar values. They are not
  // present in the underlying Harmony labels/command names.
  return text
    .replace(/;/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

function field(line) {
  const match = line.match(/&quot([^;]+);":\s*(.*)$/);
  return match ? { key: match[1], raw: match[2] } : null;
}

function directFields(block) {
  const result = {};
  let depth = 0;
  for (const line of block.split(/\r?\n/)) {
    const text = line.trim();
    if (depth === 1) {
      const item = field(line);
      if (item) result[item.key] = cleanScalar(item.raw);
    }
    if (text.startsWith('{') || text.endsWith('{')) depth += 1;
    if (text.endsWith('[')) depth += 1;
    if (text.startsWith('}')) depth -= 1;
    if (text.startsWith(']')) depth -= 1;
  }
  return result;
}

function topLevelObjects(lines, marker) {
  const start = lines.findIndex((line) => line.includes(marker));
  if (start < 0) return [];
  let depth = 1;
  let current = [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const text = lines[index].trim();
    if (depth === 1 && text.startsWith(']')) break;
    if (depth === 1 && text.startsWith('{')) {
      depth += 1;
      current = [lines[index]];
      continue;
    }
    if (depth <= 1) continue;
    current.push(lines[index]);
    if (text.startsWith('{') || text.endsWith('{')) depth += 1;
    if (text.endsWith('[')) depth += 1;
    if (text.startsWith('}')) depth -= 1;
    if (text.startsWith(']')) depth -= 1;
    if (depth === 1) {
      result.push(current.join('\n'));
      current = [];
    }
  }
  return result;
}

function parseAction(raw) {
  let text = String(raw || '').trim().replace(/,$/, '').trim();
  text = text.replace(/&quot/g, '"').replace(/;/g, '');
  try {
    const inner = JSON.parse(text);
    return typeof inner === 'string' ? JSON.parse(inner) : inner;
  } catch {
    return null;
  }
}

function actionsInDevice(block, fallbackDeviceId) {
  const lines = block.split(/\r?\n/);
  const actions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const item = field(lines[index]);
    if (!item || item.key !== 'action') continue;
    const action = parseAction(item.raw);
    if (!action || action.type !== 'IRCommand' || !action.command) continue;
    let name = action.command;
    let label = action.command;
    for (let lookahead = index + 1; lookahead < Math.min(lines.length, index + 9); lookahead += 1) {
      const next = field(lines[lookahead]);
      if (!next) continue;
      if (next.key === 'action') break;
      if (next.key === 'name') name = cleanScalar(next.raw) || name;
      if (next.key === 'label') label = cleanScalar(next.raw) || label;
    }
    actions.push({
      command: String(action.command),
      name: String(name),
      label: String(label),
      type: 'IRCommand',
      deviceId: String(action.deviceId || fallbackDeviceId),
    });
  }
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.command}\u0000${action.deviceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberOrString(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

export function parseHarmonyDump(text, sourcePath = 'Harmony config') {
  const lines = String(text).split(/\r?\n/);
  const deviceBlocks = topLevelObjects(lines, '&quotdevice;": [');
  const activityBlocks = topLevelObjects(lines, '&quotactivity;": [');
  const devices = deviceBlocks.map((block) => {
    const values = directFields(block);
    const id = String(values.contentProfileKey || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(values.label || `Device ${id}`),
      manufacturer: String(values.manufacturer || ''),
      type: String(values.deviceTypeDisplayName || ''),
      commands: actionsInDevice(block, id).sort((a, b) => a.command.localeCompare(b.command)),
    };
  }).filter(Boolean);
  const knownDeviceIds = new Set(devices.map((device) => device.id));
  const activities = activityBlocks.map((block) => {
    const values = directFields(block);
    const ids = [...block.matchAll(/&quot[^;]*ActivityRole;":\s*(?:&quot)?([0-9-]+)/g)]
      .map((match) => match[1])
      .filter((id) => knownDeviceIds.has(id));
    const actionDeviceIds = [...block.matchAll(/&quotDeviceId;":\s*(?:&quot)?([0-9-]+)/g)]
      .map((match) => match[1])
      .filter((id) => knownDeviceIds.has(id));
    return {
      id: String(values.id || ''),
      name: String(values.label || values.type || 'Unnamed activity'),
      order: values.activityOrder === undefined ? null : numberOrString(values.activityOrder),
      type: String(values.type || values.activityTypeDisplayName || ''),
      suggestedDisplay: String(values.suggestedDisplay || ''),
      deviceIds: [...new Set([...ids, ...actionDeviceIds])],
    };
  }).filter((activity) => activity.id || activity.name !== 'Unnamed activity');
  activities.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999) || a.name.localeCompare(b.name));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: sourcePath,
    hub: {
      ...DEFAULT_HUB,
      websocketUrl: `ws://${DEFAULT_HUB.host}:${DEFAULT_HUB.port}/?domain=${encodeURIComponent(DEFAULT_HUB.domain)}&hubId=${DEFAULT_HUB.id}`,
    },
    devices,
    activities,
  };
}

export function mappingMarkdown(mapping) {
  const lines = [
    '# Harmony Hub mapping',
    '',
    `Generated from: \`${mapping.source}\``,
    `Hub: \`${mapping.hub.websocketUrl}\``,
    '',
    'This is generated reference data. Use the numeric IDs and exact command',
    'strings below; do not infer Harmony IDs or substitute labels for commands.',
    '',
    '## Activities',
    '',
    '| Name | Activity ID | Order | Type | Devices |',
    '| --- | --- | ---: | --- | --- |',
  ];
  for (const activity of mapping.activities) {
    lines.push(`| ${activity.name} | \`${activity.id}\` | ${activity.order ?? ''} | ${activity.type || ''} | ${activity.deviceIds.join(', ')} |`);
  }
  lines.push('', '## Devices', '');
  for (const device of mapping.devices) {
    lines.push(`### ${device.name} — \`${device.id}\``);
    if (device.manufacturer || device.type) lines.push(`Manufacturer/type: ${device.manufacturer || 'unknown'} / ${device.type || 'unknown'}`);
    lines.push('', '| Command | Display name | Label |', '| --- | --- | --- |');
    for (const command of device.commands) lines.push(`| \`${command.command}\` | ${command.name} | ${command.label} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = argMap(process.argv);
  const input = args.get('input') || process.env.HARMONY_CONFIG_DUMP;
  if (!input) throw new Error('Pass --input /path/to/Harmony-config.md or set HARMONY_CONFIG_DUMP');
  const mapping = parseHarmonyDump(await readFile(input, 'utf8'), path.basename(input));
  const jsonPath = args.get('json') || defaultJsonPath;
  const markdownPath = args.get('markdown') || defaultMarkdownPath;
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(mapping, null, 2)}\n`);
  await writeFile(markdownPath, mappingMarkdown(mapping));
  console.log(JSON.stringify({ jsonPath, markdownPath, devices: mapping.devices.length, activities: mapping.activities.length, commands: mapping.devices.reduce((sum, device) => sum + device.commands.length, 0) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
