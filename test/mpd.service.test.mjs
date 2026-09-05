import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

test('reads complete large MPD query responses before disconnecting', async () => {
  const largeResponse = Array.from({ length: 140 }, (_, i) =>
    `file: USB/Pat Metheny Group/track-${String(i + 1).padStart(3, '0')}.flac\n` +
    'Artist: Pat Metheny Group\n' +
    'AlbumArtist: Pat Metheny Group\n' +
    `Album: Album ${Math.floor(i / 10) + 1}\n` +
    `Title: Track ${i + 1}\n`,
  ).join('');

  const server = net.createServer((socket) => {
    socket.write('OK MPD 0.24.0\n');
    socket.on('data', (data) => {
      if (String(data).includes('find albumartist')) {
        socket.write(`${largeResponse}OK\n`);
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  process.env.MPD_HOST = '127.0.0.1';
  process.env.MPD_PORT = String(address.port);

  try {
    const { mpdQueryRaw } = await import(`../src/services/mpd.service.mjs?large-response=${Date.now()}`);
    const raw = await mpdQueryRaw('find albumartist "Pat Metheny Group"', 2000);
    assert.equal((raw.match(/^file:/gm) || []).length, 140);
    assert.ok(raw.length > 16 * 1024);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
