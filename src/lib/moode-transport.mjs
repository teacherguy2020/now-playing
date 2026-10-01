const DIRECT_TRANSPORT_COMMANDS = Object.freeze({
  play: 'play',
  pause: 'pause',
  // moOde's command endpoint calls this toggle_play_pause. `toggle` is an
  // MPD command name that moOde rejects, even though the HTTP request itself
  // still returns status 200.
  toggle: 'toggle_play_pause',
  next: 'next',
  prev: 'previous',
  previous: 'previous',
  stop: 'stop',
});

export function moodeDirectTransportCommand(action) {
  return DIRECT_TRANSPORT_COMMANDS[String(action || '').trim().toLowerCase()] || '';
}

export function isMoodeTransportError(body) {
  return /unknown command|ACK\s*\[|readMpdResp\(\):\s*Error/i.test(String(body || ''));
}
