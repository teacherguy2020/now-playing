import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMpdDuration } from '../src/lib/browse-index.mjs';

test('browse index parses MPD colon-formatted durations', () => {
  assert.equal(parseMpdDuration('7:21'), 441);
  assert.equal(parseMpdDuration('1:02:03'), 3723);
  assert.equal(parseMpdDuration('180'), 180);
  assert.equal(parseMpdDuration(''), 0);
});
