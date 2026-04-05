# architecture

## Purpose

This page describes the `now-playing` system in terms of major areas and relationships.

It is more structural than `system-overview.md`:
- less about what the project is broadly for
- more about how the major pieces relate
- still high-level, not a file-by-file implementation map

## Major architectural areas

Based on the documented feature set and current repo verification work, the project can be understood in terms of these major areas:

- **Media and content layer**
  - media library
  - playlist management
  - radio stations
  - ratings / favorites
- **Playback and control layer**
  - transport controls
  - queue wizard interface
  - filter builder
  - quick search flows
  - mobile controller
  - controller-now-playing surface variants
  - device-specific controller alias entrypoints
- **Display and presentation layer**
  - display pages
  - kiosk mode
  - animated art system
  - art caching system
  - moOde display control
- **Local derived-state and cache layer**
  - localized library/browse index JSON
  - cached/resized/blurred art derivatives
  - other derived artifacts used to stabilize or accelerate live behavior
- **Integration layer**
  - MPD integration
  - YouTube integration
  - Alexa integration and correction workflows
  - radio metadata parsing/evaluation workflows
  - HTTP request / API interaction patterns
- **Operational layer**
  - installation/setup
  - configuration management
  - service control
  - runtime verification
  - host/runtime checks

## Relationships between areas

These areas are not independent; they appear to reinforce each other:

- the **media/content layer** supplies what can be played, queued, filtered, or displayed
- the **playback/control layer** decides how users and system logic shape playback behavior
- the **display/presentation layer** is how the system exposes state and visual output
- the **local derived-state/cache layer** bridges live systems to faster or more stable local representations
- the **integration layer** connects internal behavior to outside systems and runtime services
- the **operational layer** keeps all of the above actually functioning in a live environment

Cross-layer interactions that should stay explicit:
- control actions can immediately affect display state
- playback behavior can be constrained by integration or runtime state
- integration behavior can be shaped by local environment realities rather than only project code
- operational/runtime conditions can invalidate assumptions made by higher layers

Repo-verified refinement:
- many important behaviors sit at the intersection of UI + playback + integration + runtime state, not in only one layer
- the codebase is not cleanly organized as “thin routes, fat services”; many important behaviors are route-heavy
- top-level HTML entrypoints are first-class architectural ownership points for user-facing surfaces, not just passive templates
- thin redirect/alias HTML pages still matter architecturally when they normalize callers onto the real controller shells
- helper/operator pages like `displays.html`, `radio-eval.html`, `youtube.html`, and `alexa.html` are significant architectural surfaces even when they are narrower than the main controller shells

## Display, control, and playback layers

These three layers are especially tightly related:

- **display layer**
  - responsible for visible output and presentation surfaces
  - includes display pages, kiosk-style behavior, and art/display-related systems
- **control layer**
  - responsible for user-driven or system-driven manipulation of state
  - includes queue logic, filtering, transport controls, and controller surfaces
- **playback layer**
  - responsible for the actual media-side behavior and coordination with playback-related systems such as MPD

A useful working assumption for future agents:
- changes that look like display issues may still depend on control logic or playback/integration state
- changes that look like queue/control issues may still affect visible presentation
- changes that look like “frontend only” may still depend on route-local workflows, runtime-admin behavior, or moOde/display control side effects

## Integration boundaries

The docs make several system boundaries visible:

- **internal system boundary**
  - where display, control, and media-management features interact inside the project
- **external integration boundary**
  - where the project interacts with MPD, YouTube, moOde, and HTTP/API-style request flows
- **runtime/host boundary**
  - where the project depends on the machine, processes, services, display state, and configuration of the live environment

Architectural boundaries that should stay clear:
- content/media is not the same thing as control logic
- control logic is not the same thing as display/presentation
- integrations are not the same thing as the operational/runtime layer that hosts them
- project-wide structure is not the same thing as Brian-specific local reality

Repo-verified boundary refinement:
- route modules often own substantial operational behavior directly, rather than only validating and delegating
- services exist, but more selectively as reusable primitives (for example MPD control helpers) rather than the sole home of important logic
- shared helper/data layers also exist (for example browse-index support), but they do not replace route-level feature ownership
- the project also depends on a real local derived-state/cache layer: `src/lib/browse-index.mjs` builds/serves localized library-browse JSON, and `src/routes/art.routes.mjs` plus shared art-cache helpers maintain resized/blurred derivatives of moOde-originated or resolved art sources
- Quick Search behavior is part of this same pattern: user-facing quick-search inputs in `app.html`, `controller-tablet.html`, and `controller-mobile.html` feed browse/queue-wizard route families that depend on `getBrowseIndex(...)`, so the localized browse index is part of the practical search architecture

This matters because many bugs or changes may actually belong to a boundary, not to a single component.

## Operational dependencies

The project clearly depends on operational context, including:
- required runtime tools and setup steps
- service/process health
- current runtime endpoints/URLs
- display/wake/runtime configuration
- local-environment-specific patches and overrides

Environment-dependent architectural realities:
- Brian’s local environment is part of the real operating architecture, not just a deployment afterthought
- local overrides can materially alter how integration and display/runtime behavior should be interpreted
- architecture here is partly code structure and partly live system structure
- future agents should ask early whether a problem is project-wide or specific to Brian’s deployed environment
- runtime-admin routes are especially important because they bridge config mutation, environment discovery, and SSH-backed moOde/display side effects in one place

Places where local reality can bend the architecture:
- host roles determine where the practical center of operation actually lives
- local overrides can change the effective behavior of display/runtime and integration layers
- runtime state can make the live system behave differently from the clean architectural abstraction

## Architectural cautions

- do not treat this project as a purely frontend app
- do not assume display behavior is independent from runtime or integration behavior
- do not assume documented project-wide behavior always matches the local installation
- check `local-environment.md` and `deployment-and-ops.md` when architecture questions involve live behavior
- use `source-map.md` when moving from architectural understanding into actual code changes

Architectural questions future agents should ask first:
- is this problem primarily in media/content, control, display, integration, or runtime/ops?
- is this behavior project-wide, or is it likely shaped by Brian’s specific local environment?
- does this issue cross a layer boundary?
- would fixing this require only code changes, or also runtime verification and environment awareness?

Related drill-down pages now available:
- `now-playing-surface-variants.md`
- `controller-device-alias-pages.md`
- `display-launch-and-wrapper-surfaces.md`
- `youtube-interface.md`
- `radio-metadata-eval-interface.md`
- `alexa-interface.md`

Signs a problem should be treated as architecture-plus-environment, not architecture alone:
- the symptom appears to cross display, control, playback, and runtime boundaries
- the same code seems to behave differently in Brian’s live environment than expected from docs alone
- local overrides, host roles, or runtime state could plausibly explain the mismatch
