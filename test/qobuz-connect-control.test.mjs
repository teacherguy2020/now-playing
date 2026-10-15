import assert from 'node:assert/strict';
import test from 'node:test';

import { createQobuzConnectController } from '../src/lib/qobuz-connect-control.mjs';

test('Qobuz release controller uses only the fixed moOde disconnect operation', async () => {
  const calls = [];
  const controller = createQobuzConnectController({
    sshUser: 'moode',
    sshHost: 'moode.local',
    runCommand: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: '"job submitted"\n', stderr: '' };
    },
  });

  const result = await controller.release();
  assert.deepEqual(result, { accepted: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'ssh');
  assert.deepEqual(calls[0].args.slice(0, 5), [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    'moode@moode.local',
  ]);
  assert.match(calls[0].args.join(' '), /renderer\.php\?cmd=disconnect_renderer/);
  assert.match(calls[0].args.join(' '), /job=qobuzsvc/);
  assert.doesNotMatch(calls[0].args.join(' '), /TOKEN|SECRET|PRIVATE_KEY/i);
});

test('Qobuz release controller coalesces concurrent requests', async () => {
  let calls = 0;
  let resolveRun;
  const pending = new Promise((resolve) => { resolveRun = resolve; });
  const controller = createQobuzConnectController({
    sshUser: 'moode',
    sshHost: 'moode.local',
    runCommand: async () => {
      calls += 1;
      await pending;
      return { stdout: 'submitted', stderr: '' };
    },
  });

  const first = controller.release();
  const second = controller.release();
  resolveRun();
  assert.deepEqual(await Promise.all([first, second]), [
    { accepted: true },
    { accepted: true },
  ]);
  assert.equal(calls, 1);
});
