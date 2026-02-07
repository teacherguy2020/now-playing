import { execFile } from 'node:child_process';

export function execFileStrict(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const msg = [
          `cmd=${cmd}`,
          `args=${JSON.stringify(args)}`,
          `err=${err.message}`,
          `stderr=${(stderr || '').trim()}`,
          `stdout=${(stdout || '').trim()}`,
        ].filter(Boolean).join('\n');
        return reject(new Error(msg));
      }
      resolve({ stdout, stderr });
    });
  });
}
