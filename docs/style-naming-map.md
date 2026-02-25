# Style Naming Map (Phase 1: Canonical Vocabulary + Aliases)

Goal: unify naming semantics across shell/pages without visual regressions.

## Canonical surfaces

- **Shell rail surface**: `rail`
  - Existing classes: `.heroRail`, `.heroRailTop`
  - Role: top shell container + tabs/pills band

- **Shell content wrapper**: `shell-wrap`
  - Existing classes: `.heroWrap`, `.viewWrap`
  - Role: bounded width containers inside rail context

- **Page wrapper**: `page-wrap`
  - Existing classes: `.wrap`, `.cfgWrap`, `.subsWrap`
  - Role: inner page horizontal bounds

- **Panel/card surface**: `surface-card`
  - Existing classes: `.card`, `.panel`, `.cfgCard`, `.stationCard`, `.heroQueueCard`
  - Role: visible content containers

- **Section container**: `section`
  - Existing classes: `.section`, `.stationCluster`
  - Role: grouped rows/cards

## Canonical theme tokens

- `--theme-bg` → app background plane (backmost canvas only)
- `--theme-rail-bg` → hero wrapper/shell surface tint (NOT app background)
- `--theme-frame-fill` → split shell/body filler area (e.g., behind tabs/body join)
- `--theme-rail-border` → shell/frame border color (linked)
- `--theme-text` → primary text
- `--theme-text-secondary` → secondary/meta text
- `--theme-tab-*` → tabs + tab-like controls
- `--theme-hero-card-*` → major card surfaces and progress accent
- `--theme-pill-*` → pills/chips

## 🔒 Background invariants (do not break)

These are project-critical and were repeatedly regression-prone.

1. `.heroRail` uses `--theme-bg` (app background) for side surround.
2. `.heroWrap` must **not** use `--theme-bg`; it uses `--theme-rail-bg`.
3. `#appFrame` base background is app background (`--theme-bg`) unless an explicit page-specific override is required.
4. `App background` picker should only control backmost app/shell + iframe base planes.
5. Never reintroduce `.heroRail::before` underlay backgrounds; keep pseudo underlay disabled.

## Existing alias decisions (already in use)

- `--theme-frame-border` is linked to `--theme-rail-border` for compatibility.
- Theme editor exposes one control: **Shell + frame border**.

## Migration strategy

### Phase 1 (safe, no visual change)
1. Keep old class names.
2. Introduce canonical aliases in CSS comments/docs and bridge selectors.
3. Ensure token ownership is explicit (which token paints which layer).

### Phase 2 (incremental refactor)
1. Page-by-page class migration to canonical names.
2. Keep aliases for one cycle.
3. Remove aliases after regression checks.

## Page inventory (current)

- `app.html`: `.heroRail`, `.heroRailTop`, `.heroWrap`, `.viewWrap`, `.heroQueueCard`
- `config.html`: `.cfgWrap`, `.cfgCard`, `.panel`
- `radio.html`: `.wrap`, `.card` (+ station-specific components)
- `podcasts.html`: `.subsWrap`, `.panel`
- `queue-wizard.html`: `.wrap`, `.card`
- `theme.html`: `.wrap`, `.card`

## Next concrete step

Add a lightweight shared alias block (non-breaking) so these map cleanly:

- `.page-wrap` aliases `.wrap,.cfgWrap,.subsWrap`
- `.surface-card` aliases `.card,.panel,.cfgCard,.heroQueueCard,.stationCard`
- `.shell-rail` aliases `.heroRail`
- `.shell-rail-top` aliases `.heroRailTop`

Then migrate markup gradually.
