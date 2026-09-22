# Now Playing documentation

The canonical editable documentation source is [`wiki-source/`](./wiki-source/).
It is organized by audience and concept rather than by the historical order of
application tabs.

## Start here

- New installation/user → [Getting Started](./wiki-source/getting-started.md)
- Feature use → [Using Now Playing](./wiki-source/using-now-playing.md)
- Displays and kiosk → [Displays](./wiki-source/displays.md)
- Integrations → [Integrations](./wiki-source/integrations.md)
- Configuration/operations → [Configuration and Administration](./wiki-source/configuration-and-administration.md)
- Maintenance/development → [Developer Reference](./wiki-source/developer-reference.md)
- Broken or surprising behavior → [Troubleshooting and Technical Notes](./wiki-source/troubleshooting-and-technical-notes.md)

## Documentation layers

- **`docs/wiki-source/`** — the one authoritative Markdown source. Edit here.
- **`docs/wiki-site/`** — generated static HTML for browsing. Do not edit it
  directly; regenerate it from `wiki-source/`.
- **GitHub Wiki** — a published view of the canonical source. Publish it with
  `scripts/publish_github_wiki.py`; do not maintain a second copy by hand.
  Installation-local host maps remain repository-only and are not published;
  known host/path values in public operational copies are redacted.
- **Numbered files in `docs/`** — stable compatibility guides and selected
  operational runbooks retained for existing links. New substantive material
  belongs in `wiki-source/`.
- **`docs/references/`** — upstream patches, provenance, and supporting files.

The source relationship and migration decisions are recorded in
[documentation-sources-audit.md](./wiki-source/documentation-sources-audit.md).

## Canonical branches

The wiki landing page links the full branch map. The main entry points are:

1. [Getting Started](./wiki-source/getting-started.md)
2. [Using Now Playing](./wiki-source/using-now-playing.md)
3. [Displays](./wiki-source/displays.md)
4. [Integrations](./wiki-source/integrations.md)
5. [Configuration and Administration](./wiki-source/configuration-and-administration.md)
6. [Developer Reference](./wiki-source/developer-reference.md)
7. [Troubleshooting and Technical Notes](./wiki-source/troubleshooting-and-technical-notes.md)

For the deeper page catalog, use [`wiki-source/index.md`](./wiki-source/index.md).

## Maintenance rule

When documentation changes, update `docs/wiki-source/` first, regenerate the
site, then publish the GitHub Wiki if the change belongs in the public Wiki.
Keep generated/published copies out of direct authoring workflows.

*Last reviewed: 2026-09-22 America/Chicago*
