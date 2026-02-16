import { registerConfigQueueWizardBasicRoutes } from './config.queue-wizard-basic.routes.mjs';
import { registerConfigQueueWizardPreviewRoute } from './config.queue-wizard-preview.routes.mjs';
import { registerConfigQueueWizardCollageRoute } from './config.queue-wizard-collage.routes.mjs';
import { registerConfigQueueWizardApplyRoute } from './config.queue-wizard-apply.routes.mjs';
import { registerConfigQueueWizardVibeRoutes } from './config.queue-wizard-vibe.routes.mjs';
import { registerConfigDiagnosticsRoutes } from './config.diagnostics.routes.mjs';
import { registerConfigRatingsStickerRoutes } from './config.ratings-sticker.routes.mjs';
import { registerConfigRuntimeAdminRoutes } from './config.runtime-admin.routes.mjs';
import { registerConfigAlexaAliasRoutes } from './config.alexa-alias.routes.mjs';
import { registerConfigLibraryHealthArtRoutes } from './config.library-health-art.routes.mjs';
import { registerConfigLibraryHealthGenreRoutes } from './config.library-health-genre.routes.mjs';
import { registerConfigLibraryHealthPerformersRoutes } from './config.library-health-performers.routes.mjs';
import { registerConfigLibraryHealthBatchRoutes } from './config.library-health-batch.routes.mjs';
import { registerConfigLibraryHealthReadRoutes } from './config.library-health-read.routes.mjs';
import { registerConfigRoutes } from './config.routes.mjs';

export function registerAllConfigRoutes(app, deps) {
  registerConfigQueueWizardBasicRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigQueueWizardPreviewRoute(app, {
    requireTrackKey: deps.requireTrackKey,
    getRatingForFile: deps.getRatingForFile,
  });

  registerConfigQueueWizardCollageRoute(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigQueueWizardApplyRoute(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigQueueWizardVibeRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    getRatingForFile: deps.getRatingForFile,
  });

  registerConfigDiagnosticsRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    getRatingForFile: deps.getRatingForFile,
    setRatingForFile: deps.setRatingForFile,
  });

  registerConfigRatingsStickerRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigRuntimeAdminRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    log: deps.log,
  });

  registerConfigAlexaAliasRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigLibraryHealthArtRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigLibraryHealthGenreRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
  });

  registerConfigLibraryHealthPerformersRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    log: deps.log,
  });

  registerConfigLibraryHealthBatchRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    setRatingForFile: deps.setRatingForFile,
  });

  registerConfigLibraryHealthReadRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    mpdQueryRaw: deps.mpdQueryRaw,
    getRatingForFile: deps.getRatingForFile,
    mpdStickerGetSong: deps.mpdStickerGetSong,
  });

  // compatibility no-op
  registerConfigRoutes(app, {
    requireTrackKey: deps.requireTrackKey,
    log: deps.log,
    mpdQueryRaw: deps.mpdQueryRaw,
    getRatingForFile: deps.getRatingForFile,
    setRatingForFile: deps.setRatingForFile,
    mpdStickerGetSong: deps.mpdStickerGetSong,
  });
}
