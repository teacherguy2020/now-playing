import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MPD_HOST, MOODE_SSH_HOST, MOODE_SSH_USER } from '../config.mjs';

const execFileP = promisify(execFile);

function sshArgsFor(user, host, extra = []) {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    ...extra,
    `${user}@${host}`,
  ];
}

function shQuoteArg(s) {
  const v = String(s ?? '');
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

async function sshBashLc({ user, host, script, timeoutMs = 20000, maxBuffer = 10 * 1024 * 1024 }) {
  return execFileP('ssh', [...sshArgsFor(user, host), 'bash', '-lc', shQuoteArg(String(script || ''))], {
    timeout: timeoutMs,
    maxBuffer,
  });
}

export function registerConfigQueueWizardCollageRoute(app, deps) {
  const { requireTrackKey } = deps;

app.post('/config/queue-wizard/collage-preview', async (req, res) => {
    let remoteTracks = '';
    let remoteOut = '';
    let remoteRunner = '';
    let localTracks = '';
    let localRunner = '';

    const moodeUser = String(MOODE_SSH_USER || 'moode');
    const moodeHost = String(MOODE_SSH_HOST || MPD_HOST || '10.0.0.254');
    const remoteScript = String(
        process.env.MOODE_PLAYLIST_COVER_REMOTE_SCRIPT || '/home/moode/moode-playlist-cover.sh'
    );

    try {
        if (!requireTrackKey(req, res)) return;

        const playlistName = String(req.body?.playlistName || '').trim() || null;

        const tracksIn = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
        const tracks = tracksIn
            .map((x) => String(x ?? ''))
            .map((s) => s.replace(/\r/g, '').trim())
            .map((s) => s.replace(/^"(.*)"$/, '$1'))
            .filter(Boolean);

        const forceSingle = Boolean(req.body?.forceSingle);

        if (!tracks.length) {
            return res.status(400).json({
                ok: false,
                reason: 'bad_request',
                error: 'tracks[] is required',
            });
        }

        const ts = Date.now();
        localTracks = path.join('/tmp', `qw-preview-tracks-${process.pid}-${ts}.txt`);
        localRunner = path.join('/tmp', `qw-preview-run-${process.pid}-${ts}.sh`);

        remoteTracks = `/tmp/qw-preview-tracks-${process.pid}-${ts}.txt`;
        remoteOut = `/tmp/qw-preview-${process.pid}-${ts}.jpg`;
        remoteRunner = `/tmp/qw-preview-run-${process.pid}-${ts}.sh`;

        await fs.writeFile(localTracks, tracks.join('\n') + '\n', 'utf8');

        // Build a tiny runner script to execute on moOde.
        // IMPORTANT: keep stdout = base64 ONLY. Any status goes to stderr.
        const runner = [
            '#!/usr/bin/env bash',
            'set -euo pipefail',
            'set -o pipefail',
            `rt=${shQuoteArg(remoteTracks)}`,
            `ro=${shQuoteArg(remoteOut)}`,
            `script=${shQuoteArg(remoteScript)}`,
            '',
            'chmod 0644 -- "$rt" >/dev/null 2>&1 || true',
            '',
            // Capture ALL script output to a variable so it can't pollute stdout
            'preview_out="$("$script" --preview --tracks-file "$rt" --out "$ro" ' +
                (forceSingle ? '--single' : '') +
                ' 2>&1)"',
            'rc=$?',
            'if [ "$rc" -ne 0 ]; then printf "%s\\n" "$preview_out" >&2; exit "$rc"; fi',
            '',
            'if [ ! -s "$ro" ]; then echo "ERROR: preview file missing/empty: $ro" >&2; exit 2; fi',
            '',
            // JPEG magic check (FF D8 FF)
            'magic="$(dd if="$ro" bs=1 count=3 2>/dev/null | od -An -tx1 | tr -d \' \\n\')"',
            'if [ "$magic" != "ffd8ff" ]; then echo "ERROR: preview output not JPEG (magic=$magic) $ro" >&2; exit 3; fi',
            '',
            // stdout must be base64 only
            'base64 "$ro" 2>/dev/null | tr -d "\\r\\n"',
            '',
        ].join('\n');

        await fs.writeFile(localRunner, runner, 'utf8');

        // scp both files to moOde
        await execFileP(
            'scp',
            [
                '-q',
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=6',
                localTracks,
                `${moodeUser}@${moodeHost}:${remoteTracks}`,
            ],
            { timeout: 20000 }
        );

        await execFileP(
            'scp',
            [
                '-q',
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=6',
                localRunner,
                `${moodeUser}@${moodeHost}:${remoteRunner}`,
            ],
            { timeout: 20000 }
        );

        // run the runner on moOde
        let stdout = '';
        let stderr = '';
        let rc = 0;

        try {
            const r = await execFileP(
                'ssh',
                [
                    ...sshArgsFor(moodeUser, moodeHost),
                    'bash', '--noprofile', '--norc', '-c',
                    // run runner as a file; avoid quoting giant scripts
                    `chmod 0755 -- ${shQuoteArg(remoteRunner)} >/dev/null 2>&1 || true; ` +
                    `bash --noprofile --norc ${shQuoteArg(remoteRunner)}`,
                ],
                { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }
            );

            stdout = String(r.stdout || '');
            stderr = String(r.stderr || '');
            rc = 0;
        } catch (e) {
            stdout = String(e?.stdout || '');
            stderr = String(e?.stderr || e?.message || '');
            rc = typeof e?.code === 'number' ? e.code : 1;

            return res.status(200).json({
                ok: false,
                reason: 'preview_failed',
                playlistName,
                message: 'Preview generation / readback failed on moOde.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    rc,
                    stdoutHead: stdout.slice(0, 400),
                    stdoutLen: stdout.length,
                    stderrHead: stderr.slice(0, 1200),
                    stderrLen: stderr.length,
                },
            });
        }

        const b64 = stdout.trim();

        if (!b64) {
            return res.status(200).json({
                ok: false,
                reason: 'base64_empty',
                playlistName,
                message: 'Remote command succeeded but produced empty base64.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    stderrHead: (stderr || '').slice(0, 1200),
                },
            });
        }

        if (!b64.startsWith('/9j/')) {
            return res.status(200).json({
                ok: false,
                reason: 'base64_not_jpeg',
                playlistName,
                message: 'Remote stdout was not JPEG base64.',
                debug: {
                    remoteTracks,
                    remoteOut,
                    remoteRunner,
                    remoteScript,
                    b64Head: b64.slice(0, 220),
                    stderrHead: (stderr || '').slice(0, 1200),
                },
            });
        }

        return res.json({
            ok: true,
            playlistName,
            mimeType: 'image/jpeg',
            dataBase64: b64,
        });
    } catch (e) {
        return res.status(500).json({
            ok: false,
            reason: 'server_error',
            error: e?.message || String(e),
            remoteTracks,
            remoteOut,
            remoteRunner,
        });
    } finally {
        if (localTracks) await fs.unlink(localTracks).catch(() => {});
        if (localRunner) await fs.unlink(localRunner).catch(() => {});

        // remote cleanup (best effort)
        if (remoteTracks || remoteOut || remoteRunner) {
            const rm = [
                'rm -f --',
                remoteTracks ? shQuoteArg(remoteTracks) : '',
                remoteOut ? shQuoteArg(remoteOut) : '',
                remoteRunner ? shQuoteArg(remoteRunner) : '',
                '>/dev/null 2>&1 || true',
            ].join(' ').trim();

            await sshBashLc({ user: moodeUser, host: moodeHost, timeoutMs: 10000, script: rm }).catch(() => {});
        }
    }
});
}
