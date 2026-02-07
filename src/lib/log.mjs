export const LOG_LEVEL = String(process.env.LOG_LEVEL || 'info').toLowerCase();

const levels = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const current = levels[LOG_LEVEL] ?? 0;

export const log = {
  error: (...a) => { if (current >= 1) console.error(...a); },
  warn: (...a) => { if (current >= 2) console.warn(...a); },
  info: (...a) => { if (current >= 3) console.info(...a); },
  debug: (...a) => { if (current >= 4) console.debug(...a); },
};
