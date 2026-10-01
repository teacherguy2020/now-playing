import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMoodeTransportError,
  moodeDirectTransportCommand,
} from '../src/lib/moode-transport.mjs';

test('maps native play/pause toggle to moOde command endpoint name', () => {
  assert.equal(moodeDirectTransportCommand('toggle'), 'toggle_play_pause');
  assert.equal(moodeDirectTransportCommand('play'), 'play');
  assert.equal(moodeDirectTransportCommand('pause'), 'pause');
  assert.equal(moodeDirectTransportCommand('prev'), 'previous');
});

test('recognizes MPD errors hidden inside moOde HTTP 200 JSON responses', () => {
  assert.equal(isMoodeTransportError('{"0":"OK"}'), false);
  assert.equal(isMoodeTransportError('{"state":"play"}'), false);
  assert.equal(isMoodeTransportError('{"0":"readMpdResp(): Error: response ACK [5@0] {} unknown command \\\"toggle\\\""}'), true);
});
