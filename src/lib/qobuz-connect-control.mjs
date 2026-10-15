import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 20_000;

function text(value) {
  return String(value ?? '').trim();
}

function shQuoteArg(value) {
  const raw = String(value ?? '');
  return `'${raw.replace(/'/g, `\'"'"'`)}'`;
}

function sshArgsFor(user, host, script) {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    `${user}@${host}`,
    'bash', '-lc', shQuoteArg(script),
  ];
}

const RELEASE_SCRIPT = [
  'set -eu',
  'db=/var/local/www/db/moode-sqlite3.db',
  'sid=$(sqlite3 "$db" "select value from cfg_system where param=\'sessionid\'")',
  'test -n "$sid"',
  'result=$(curl -fsS --max-time 8 -b "PHPSESSID=$sid" -X POST --data "job=qobuzsvc" "http://127.0.0.1/command/renderer.php?cmd=disconnect_renderer")',
  'case "$result" in *"job submitted"*) ;; *) exit 4 ;; esac',
  'printf "submitted\\n"',
].join('\n');

function defaultRunCommand(command, args, options) {
  return execFileP(command, args, options);
}

/**
 * Control only the installed moOde Qobuz renderer lifecycle.
 *
 * The browser never receives a shell, SSH, or Pibuz surface. The fixed
 * backend operation reuses moOde's own renderer-disconnect path, which stops
 * the current Pibuz session and lets moOde restore its normal audio state.
 */
export function createQobuzConnectController({
  sshUser = 'moode',
  sshHost = '',
  runCommand = defaultRunCommand,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const user = text(sshUser);
  const host = text(sshHost);
  const maxTimeMs = Math.max(5_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  let inFlight = null;

  async function release() {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      if (!user || !host) throw new Error('Qobuz renderer SSH target is unavailable');
      let result;
      try {
        result = await runCommand('ssh', sshArgsFor(user, host, RELEASE_SCRIPT), {
          timeout: maxTimeMs,
          maxBuffer: 64 * 1024,
        });
      } catch {
        throw new Error('The moOde Qobuz disconnect action failed');
      }

      if (!/submitted/i.test(text(result?.stdout))) {
        throw new Error('The moOde Qobuz disconnect action was not accepted');
      }
      return { accepted: true };
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  return { release };
}

export const qobuzConnectControlDefaults = {
  timeoutMs: DEFAULT_TIMEOUT_MS,
};
