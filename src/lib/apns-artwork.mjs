function text(value) {
  return String(value || '').trim();
}

/**
 * Make server-generated artwork reachable by the iOS notification service.
 * External artwork URLs are left untouched; only URLs generated from the
 * server's web base are moved to the HTTPS mobile base.
 */
export function resolveApnsMediaUrl(rawUrl, { publicBaseUrl = '', mobileBaseUrl = '' } = {}) {
  const raw = text(rawUrl);
  const mobile = text(mobileBaseUrl);
  if (!raw || !mobile) return raw;

  try {
    const source = new URL(raw);
    const publicBase = new URL(text(publicBaseUrl));
    const mobileBase = new URL(mobile);
    if (source.origin !== publicBase.origin) return raw;

    const mobilePrefix = mobileBase.pathname.replace(/\/+$/, '');
    const target = new URL(mobileBase.toString());
    target.pathname = `${mobilePrefix}${source.pathname}` || '/';
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
  } catch {
    return raw;
  }
}
