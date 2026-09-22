/**
 * moOde serves its local web/API endpoints over HTTP. Keep that invariant
 * even when an old config or environment override contains https://.
 */
export function normalizeMoodeBaseUrl(raw, fallbackHost = 'moode.local') {
  const configured = String(raw || '').trim();
  const host = String(fallbackHost || 'moode.local').trim() || 'moode.local';
  const candidate = configured
    ? (/^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`)
    : `http://${host}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname) throw new Error('moOde URL has no hostname');
    url.protocol = 'http:';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return `http://${host}`;
  }
}
