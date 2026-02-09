import fs from 'node:fs';
import path from 'node:path';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');
const DEFAULT_CONFIG_PATH = path.join(CONFIG_DIR, 'now-playing.config.json');
const EXAMPLE_CONFIG_PATH = path.join(CONFIG_DIR, 'now-playing.config.example.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertConfig(cfg) {
  const errors = [];

  if (!Array.isArray(cfg.nodes) || cfg.nodes.length < 1) {
    errors.push('nodes must be a non-empty array');
  }

  if (!cfg.ports || typeof cfg.ports.api !== 'number' || typeof cfg.ports.ui !== 'number') {
    errors.push('ports.api and ports.ui must be numbers');
  }

  if (cfg.alexa?.enabled && !cfg.alexa?.publicDomain) {
    errors.push('alexa.publicDomain is required when alexa.enabled = true');
  }

  if (errors.length) {
    throw new Error(`Invalid config: ${errors.join('; ')}`);
  }

  return cfg;
}

export function loadConfig(customPath = process.env.NOW_PLAYING_CONFIG_PATH || DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(customPath)) {
    throw new Error(
      `Config not found at ${customPath}. Copy ${EXAMPLE_CONFIG_PATH} to ${DEFAULT_CONFIG_PATH} and edit it.`
    );
  }

  const cfg = readJson(customPath);
  return assertConfig(cfg);
}

export function loadConfigOrNull(customPath) {
  try {
    return loadConfig(customPath);
  } catch {
    return null;
  }
}
