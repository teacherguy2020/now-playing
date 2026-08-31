# Documentation

This docs set follows the same order as the app tabs.

## Documentation layout

There are two complementary documentation layers in this repository:

- **Project guides** — the numbered Markdown chapters in this directory
  (`01-config.md` through `21-moode-airplay-metadata-hardening.md`). These are
  concise, GitHub-friendly feature and operations guides.
- **Wiki source** — [`wiki-source/`](./wiki-source/), the canonical editable
  Markdown knowledge base containing architecture, API, ownership, history,
  and troubleshooting pages.
- **Wiki site** — [`wiki-site/`](./wiki-site/), the generated static HTML
  rendering of `wiki-source/`. Do not edit these HTML files directly; update
  the Markdown in `wiki-source/` and regenerate the site.
- **References** — [`references/`](./references/), supporting upstream files,
  patches, and provenance material. These are not wiki pages.

The numbered guides and the wiki source intentionally overlap at a high level,
but they serve different audiences: the guides are the quick project overview,
while the wiki is the deeper maintainer reference.

## Tab-ordered chapters

1. [Config](./01-config.md)
2. [Diagnostics](./02-diagnostics.md)
3. [Alexa](./03-alexa.md)
4. [Library Health](./04-library-health.md) — Album Workbench flow, cached scan + full refresh, album-row queue actions, persistent inventory sorting, thumbnail behavior
5. [Queue Wizard](./05-queue-wizard.md)
6. [Radio](./06-radio.md)
7. [Podcasts](./07-podcasts.md)
8. [YouTube](./17-youtube.md)
9. [Theme](./13-theme.md)
10. [moOde Display Enhancement](./14-display-enhancement.md)
11. [moOde Remote Display Blanking Fix](./15-moode-remote-display-blanking-fix.md)
12. [Mobile Builder + Controller Pages](./16-mobile-builder.md)
13. [Kiosk Mode](./18-kiosk.md)
14. [Visualizer](./19-visualizer.md)
15. [Controller Recents + Last.fm (Tablet)](./20-controller-recents-lastfm.md)
16. [moOde AirPlay Metadata Hardening](./21-moode-airplay-metadata-hardening.md)

## Cross-cutting chapters

- [Hero Transport + App Shell](./08-hero-shell.md)
- [index.html vs app.html behavior](./09-index-vs-app.md)
- [Random vs Shuffle semantics](./10-random-vs-shuffle.md)
- [Deploy / PM2 / Rollback](./11-deploy-pm2-rollback.md)
- [Troubleshooting playbook](./12-troubleshooting.md)
