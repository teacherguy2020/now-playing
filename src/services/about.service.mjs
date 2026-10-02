// Provider-neutral About metadata resolution. Providers return the normalized
// About model or null; this layer owns availability state and provider order.

export const ABOUT_STATUS = Object.freeze({
  UNCONFIGURED: 'unconfigured',
  NO_DATA: 'no-data',
  AVAILABLE: 'available',
  NOT_REQUESTED: 'not-requested',
});

export function createAboutResolver({ providers = [] } = {}) {
  const configuredProviders = providers.filter((provider) => (
    provider && provider.configured && typeof provider.getAbout === 'function'
  ));

  async function resolve(input = {}) {
    if (!configuredProviders.length) {
      return { status: ABOUT_STATUS.UNCONFIGURED, data: null, provider: null };
    }
    for (const provider of configuredProviders) {
      try {
        const data = await provider.getAbout(input);
        if (data) {
          return {
            status: ABOUT_STATUS.AVAILABLE,
            data,
            provider: String(provider.name || '').trim() || null,
          };
        }
      } catch {
        // About enrichment is optional; provider failures must not affect playback.
      }
    }
    return { status: ABOUT_STATUS.NO_DATA, data: null, provider: null };
  }

  return { resolve, providers: configuredProviders };
}
