import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeProbe(parsed) {
  const stream = parsed?.streams?.[0] || {};
  const sourceAudio = {
    ...(positiveInt(stream.sample_rate) ? { sampleRateHz: positiveInt(stream.sample_rate) } : {}),
    ...(positiveInt(stream.bits_per_raw_sample || stream.bits_per_sample)
      ? { bitDepth: positiveInt(stream.bits_per_raw_sample || stream.bits_per_sample) }
      : {}),
    ...(positiveInt(stream.channels) ? { channels: positiveInt(stream.channels) } : {}),
  };
  return Object.keys(sourceAudio).length ? sourceAudio : null;
}

export function createSourceAudioProbe({
  resolveFile,
  cachePath,
  ffprobePath = process.env.FFPROBE || '/usr/bin/ffprobe',
} = {}) {
  const configuredCachePath = path.resolve(String(cachePath || path.join(process.cwd(), 'var', 'mobile-source-audio.json')));
  let cache = null;
  const inflight = new Map();
  let persistOperation = Promise.resolve();

  const load = async () => {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await fs.readFile(configuredCachePath, 'utf8'));
      cache = parsed?.files && typeof parsed.files === 'object' ? parsed.files : {};
    } catch {
      cache = {};
    }
    return cache;
  };

  const persist = async () => {
    const write = persistOperation.then(async () => {
      await fs.mkdir(path.dirname(configuredCachePath), { recursive: true });
      const temporary = `${configuredCachePath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify({ version: 1, files: cache }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, configuredCachePath);
    });
    persistOperation = write.catch(() => {});
    await write;
  };

  const get = async (mpdFile) => {
    const key = String(mpdFile || '').trim();
    if (!key || typeof resolveFile !== 'function') return null;
    if (inflight.has(key)) return inflight.get(key);

    const task = (async () => {
      const filePath = await resolveFile(key);
      if (!filePath) return null;
      let stat;
      try {
        stat = await fs.stat(filePath);
        if (!stat.isFile()) return null;
      } catch {
        return null;
      }

      const entries = await load();
      const previous = entries[key];
      if (previous
        && Number(previous.sizeBytes) === Number(stat.size)
        && Number(previous.modifiedMs) === Number(stat.mtimeMs)) {
        return previous.sourceAudio || null;
      }

      let sourceAudio = null;
      try {
        const { stdout } = await execFileP(ffprobePath, [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample',
          '-of', 'json',
          filePath,
        ], { timeout: 15_000, maxBuffer: 128 * 1024 });
        sourceAudio = normalizeProbe(JSON.parse(String(stdout || '{}')));
      } catch {}

      entries[key] = {
        sizeBytes: Number(stat.size),
        modifiedMs: Number(stat.mtimeMs),
        sourceAudio,
      };
      await persist().catch(() => {});
      return sourceAudio;
    })().finally(() => inflight.delete(key));

    inflight.set(key, task);
    return task;
  };

  return { get };
}

export { normalizeProbe as normalizeSourceAudioProbe };
