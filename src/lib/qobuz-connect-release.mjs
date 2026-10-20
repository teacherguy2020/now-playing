const DEFAULT_RELEASE_TIMEOUT_MS = 12_000;
const DEFAULT_RELEASE_POLL_MS = 250;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function qobuzOwnershipActive(result) {
  return Boolean(result?.active || result?.suppressMpdHistory);
}

/**
 * Wait until the server's authoritative Qobuz ownership probe confirms that
 * PiBuZ no longer owns the moOde renderer. A failed read is deliberately not
 * treated as proof of release.
 */
export async function waitForQobuzRelease(getQobuzNowPlaying, {
  timeoutMs = DEFAULT_RELEASE_TIMEOUT_MS,
  pollMs = DEFAULT_RELEASE_POLL_MS,
} = {}) {
  if (typeof getQobuzNowPlaying !== 'function') return false;
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || DEFAULT_RELEASE_TIMEOUT_MS);
  const interval = Math.max(25, Number(pollMs) || DEFAULT_RELEASE_POLL_MS);

  while (true) {
    try {
      const current = await getQobuzNowPlaying();
      if (!qobuzOwnershipActive(current)) return true;
    } catch {
      // A failed read is not proof that the renderer was released.
    }
    if (Date.now() >= deadline) return false;
    await delay(interval);
  }
}

export const qobuzConnectReleaseDefaults = {
  timeoutMs: DEFAULT_RELEASE_TIMEOUT_MS,
  pollMs: DEFAULT_RELEASE_POLL_MS,
};
