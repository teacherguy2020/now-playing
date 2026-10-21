import { log } from './log.mjs';

export const MOBILE_INVALID_JSON_REQUEST_CODE = 'MOBILE_INVALID_JSON_REQUEST';

function mobilePath(req) {
  return String(req?.originalUrl || req?.url || '').split('?')[0];
}

function isMobilePath(req) {
  const pathname = mobilePath(req);
  return pathname === '/v1/mobile' || pathname.startsWith('/v1/mobile/');
}

// Express/body-parser normally renders malformed JSON as an HTML error page.
// Keep the mobile API boundary JSON-shaped while preserving the default error
// behavior for the legacy web/admin surfaces.
export function handleMobileJsonError(error, req, res, next) {
  if (error?.type !== 'entity.parse.failed' || !isMobilePath(req)) {
    return next(error);
  }

  log.warn('[mobile-api] invalid JSON request', {
    method: String(req?.method || 'UNKNOWN'),
    path: mobilePath(req) || '/',
  });
  return res.status(400).json({
    ok: false,
    error: 'request body must be valid JSON',
    code: MOBILE_INVALID_JSON_REQUEST_CODE,
  });
}
