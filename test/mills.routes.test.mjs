import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMillsRoutes } from '../src/routes/mills.routes.mjs';

function makeApp() {
  return {
    routes: {},
    post(path, handler) { this.routes[`POST ${path}`] = handler; },
    get(path, handler) { this.routes[`GET ${path}`] = handler; },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Mills start and stop switch Denon once and ignore duplicates', async () => {
  const app = makeApp();
  const inputs = [];
  const commands = [];
  registerMillsRoutes(app, {
    requireTrackKey: () => true,
    switchDenonInput: async (input) => { inputs.push(input); },
    mpdEscapeValue: (value) => JSON.stringify(value),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ song: -1, state: 'stop' }),
    mpdQueryRaw: async (command) => {
      commands.push(command);
      if (command.startsWith('listplaylist')) return 'file: Mills/One.flac\nfile: Mills/Two.flac\n';
      if (command.startsWith('addid')) return 'Id: 41\n';
      return 'OK\n';
    },
  });

  let res = makeResponse();
  await app.routes['POST /integrations/mills/start']({ body: {} }, res);
  assert.deepEqual(inputs, ['phono']);
  assert.equal(res.body.switched, true);
  assert.equal(res.body.surrogateStarted, false);
  assert.equal(res.body.awaitingSelection, true);
  assert.equal(commands.length, 0);

  res = makeResponse();
  await app.routes['POST /integrations/mills/start']({ body: {} }, res);
  assert.deepEqual(inputs, ['phono']);
  assert.equal(res.body.duplicate, true);
  assert.equal(res.body.surrogateStarted, false);
  assert.equal(res.body.awaitingSelection, true);
  assert.equal(commands.length, 0);

  res = makeResponse();
  await app.routes['POST /integrations/mills/stop']({ body: {} }, res);
  assert.deepEqual(inputs, ['phono', 'aux1']);
  assert.equal(res.body.switched, true);

  res = makeResponse();
  await app.routes['POST /integrations/mills/stop']({ body: {} }, res);
  assert.deepEqual(inputs, ['phono', 'aux1']);
  assert.equal(res.body.duplicate, true);
});

test('Mills stop remains retryable when Aux 1 switching fails', async () => {
  const app = makeApp();
  let attempts = 0;
  registerMillsRoutes(app, {
    requireTrackKey: () => true,
    switchDenonInput: async (input) => {
      if (input === 'aux1' && attempts++ === 0) throw new Error('hub unavailable');
    },
    mpdEscapeValue: (value) => JSON.stringify(value),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ song: -1, state: 'stop' }),
    mpdQueryRaw: async (command) => command.startsWith('listplaylist') ? 'file: Mills/One.flac\n' : command.startsWith('addid') ? 'Id: 42\n' : 'OK\n',
  });

  let res = makeResponse();
  await app.routes['POST /integrations/mills/start']({ body: {} }, res);
  res = makeResponse();
  await app.routes['POST /integrations/mills/stop']({ body: {} }, res);
  assert.equal(res.statusCode, 502);

  res = makeResponse();
  await app.routes['POST /integrations/mills/stop']({ body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.switched, true);
});

test('Mills physical selection immediately plays the requested playlist entry and ignores duplicates', async () => {
  const app = makeApp();
  const inputs = [];
  const commands = [];
  let nextId = 50;
  registerMillsRoutes(app, {
    requireTrackKey: () => true,
    switchDenonInput: async (input) => { inputs.push(input); },
    mpdEscapeValue: (value) => JSON.stringify(value),
    mpdHasACK: (raw) => String(raw).includes('ACK'),
    parseMpdFirstBlock: () => ({ song: -1, state: 'stop' }),
    mpdQueryRaw: async (command) => {
      commands.push(command);
      if (command.startsWith('listplaylist')) {
        return 'file: Mills/One.flac\nfile: Mills/Two.flac\nfile: Mills/Three.flac\n';
      }
      if (command.startsWith('addid')) return `Id: ${nextId++}\n`;
      return 'OK\n';
    },
  });

  let res = makeResponse();
  await app.routes['POST /integrations/mills/start']({ body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(inputs, ['phono']);

  res = makeResponse();
  await app.routes['POST /integrations/mills/selection']({ body: { slot: 3 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.slot, 3);
  assert.equal(res.body.file, 'Mills/Three.flac');
  assert.equal(res.body.playbackStarted, true);
  assert.equal(res.body.priority, 'jukebox');
  assert.deepEqual(inputs, ['phono']);
  assert.ok(commands.includes('play 0'));
  assert.equal(commands.filter((command) => command.startsWith('deleteid')).length, 0);

  res = makeResponse();
  await app.routes['POST /integrations/mills/selection']({ body: { slot: 3 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(commands.filter((command) => command.startsWith('addid')).length, 1);

  res = makeResponse();
  await app.routes['POST /integrations/mills/selection']({ body: { slot: 21 } }, res);
  assert.equal(res.statusCode, 400);

  res = makeResponse();
  await app.routes['POST /integrations/mills/stop']({ body: {} }, res);
  assert.equal(res.statusCode, 200);

  res = makeResponse();
  await app.routes['POST /integrations/mills/selection']({ body: { slot: 1 } }, res);
  assert.equal(res.statusCode, 409);
});

test('Mills allows the same slot again after the duplicate-report window', async () => {
  const app = makeApp();
  const commands = [];
  let nextId = 60;
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    registerMillsRoutes(app, {
      requireTrackKey: () => true,
      switchDenonInput: async () => {},
      mpdEscapeValue: (value) => JSON.stringify(value),
      mpdHasACK: (raw) => String(raw).includes('ACK'),
      parseMpdFirstBlock: () => ({ song: -1, state: 'stop' }),
      mpdQueryRaw: async (command) => {
        commands.push(command);
        if (command.startsWith('listplaylist')) return 'file: Mills/One.flac\n';
        if (command.startsWith('addid')) return `Id: ${nextId++}\n`;
        return 'OK\n';
      },
    });

    let res = makeResponse();
    await app.routes['POST /integrations/mills/start']({ body: {} }, res);
    res = makeResponse();
    await app.routes['POST /integrations/mills/selection']({ body: { slot: 1 } }, res);
    assert.equal(res.body.duplicate, false);

    now += 5001;
    res = makeResponse();
    await app.routes['POST /integrations/mills/selection']({ body: { slot: 1 } }, res);
    assert.equal(res.body.duplicate, false);
    assert.equal(commands.filter((command) => command.startsWith('addid')).length, 2);
  } finally {
    Date.now = realNow;
  }
});
