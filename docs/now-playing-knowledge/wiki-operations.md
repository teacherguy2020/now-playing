---
title: wiki-operations
page_type: support
topics:
  - ops
  - metadata
  - runtime
confidence: high
---

# wiki operations

## Purpose

This page defines the operating model for maintaining the `now-playing` knowledge wiki.

It exists because the wiki is no longer just a pile of pages.
It is becoming a maintained knowledge system, and that means the maintenance workflow should be explicit.

A useful current model is:
- **ingest**
- **query**
- **lint**

These are different jobs.
They should not all blur together as “do some docs work.”

## Why this page matters

The wiki is most useful when it compounds.
That means:
- new evidence gets integrated into existing pages
- useful answers become durable pages instead of disappearing into chat
- stale/confusing/orphaned structure gets corrected periodically

Without an explicit operations model, the likely failure modes are:
- new pages without good wiring
- repeated rediscovery of the same answers in chat
- drift between rendered and source pages
- important confusions remaining implicit instead of becoming synthesis pages
- no clear habit for checking wiki health

## Three-layer mental model

A useful current interpretation is:
- **raw source layer** — repo files, runtime observations, local environment facts, direct code tracing
- **wiki layer** — the maintained markdown and rendered pages that synthesize and organize those facts
- **schema/rules layer** — the instructions that define how the wiki should be updated and used

For this project, that maps roughly to:
- repo/runtime truth
- `docs/now-playing-knowledge/` plus `docs/now-playing-knowledge-site/`
- workspace instructions plus pages like `wiki-structure-notes.md`

## 1. Ingest

### What ingest means here
Ingest means taking some new source of truth and integrating it into the wiki.

Typical inputs include:
- direct repo inspection
- code tracing for a specific page or flow
- runtime observations
- deployment/ops findings
- user decisions about how the system should be framed
- a recurring answer discovered during problem-solving

### What ingest should produce
Ingest should usually produce one or more of:
- a new page
- a meaningful update to an existing page
- a new companion/anatomy/synthesis page
- better cross-links between existing pages
- a rendered-page update so the live wiki stays usable

### Ingest rule
Do not create new pages as filler.
A source should improve one of these:
- confidence
- navigability
- ownership clarity
- question-answering usefulness

### Ingest examples in this wiki
Useful ingest outputs already created include:
- anatomy pages for dense surfaces
- `kiosk-queue-shell-vs-content-owner.md`
- `queue-interface-vs-queue-wizard.md`
- route ownership and fragile-behavior pages

Those are good examples because they reduce repeated future confusion.

## 2. Query

### What query means here
Query means using the wiki to answer a practical question.

Examples:
- where should I start changing this behavior?
- what page/module likely owns this?
- is this queue UI or Queue Wizard?
- is this shell behavior or embedded child behavior?
- what is the likely source of truth for this visible state?

### Query rule
A good query should prefer the wiki first, then drill into source truth only as needed.

That means the normal pattern is:
1. start from a hub, search page, or agent-start page
2. move into the relevant branch page(s)
3. move into anatomy/ownership/synthesis pages
4. only then drop to raw code or runtime verification

### Query outputs should sometimes become wiki pages
If a query reveals a recurring confusion, the answer should often be filed back into the wiki.

That is exactly how the wiki compounds.

Good candidates for filing back:
- recurring “where do I start?” answers
- repeated do-not-confuse distinctions
- shell-owner vs content-owner splits
- source-of-truth clarifications

## 3. Lint

### What lint means here
Lint means checking the health of the wiki itself.

This is not the same as answering a project question.
It is about the quality of the knowledge system.

### What lint should look for
A useful lint pass should look for:
- orphan pages
- missing parent/child wiring
- missing rendered links for source pages
- duplicated scope between nearby pages
- repeated confusions that deserve a synthesis page
- pages that mention important concepts without linking to the right child page
- rendered/source drift
- weak browse entry points
- places where confidence is still low but the prose sounds too settled

For the explicit lint checklist and quality-control lens, see `wiki-lint-and-health.md`.

### Lint rule
A lint pass should improve retrieval, not just cleanliness.

That means the best lint fixes are often things like:
- adding a missing companion link
- creating a synthesis page
- clarifying a do-not-confuse distinction
- improving the start path for a common task

## Suggested operating cadence

A useful current cadence is:

### During active work
- ingest small findings as they happen
- prefer one logical page/change cluster per commit
- keep rendered pages current alongside source pages

### After answering an important recurring question
- ask whether the answer should become a durable page
- if yes, create a synthesis/decision/reference page immediately

### Periodically
- run a lint-style pass over one branch or cluster
- check for navigation drift, search usefulness, and recurring confusions

## When to create a synthesis page

Create a synthesis page when:
- the answer requires combining multiple pages every time
- a smaller model is likely to make the wrong jump
- the confusion is structural, not just temporary
- the distinction is useful enough to recur

Recent good examples:
- `kiosk-queue-shell-vs-content-owner.md`
- `queue-interface-vs-queue-wizard.md`

## Metadata pilot schema

A useful minimal metadata schema for this wiki is YAML frontmatter with:
- `title`
- `page_type`
- `topics`
- `confidence`

### `page_type` vocabulary
Use a small fixed vocabulary:
- `hub`
- `parent`
- `child`
- `companion`
- `runbook`
- `anatomy`
- `synthesis`
- `support`

### `topics` vocabulary
Use a small controlled list, not free-form tag sprawl.

Useful current topic labels include:
- `queue`
- `playback`
- `display`
- `kiosk`
- `config`
- `diagnostics`
- `theme`
- `library`
- `api`
- `integration`
- `controller`
- `runtime`
- `ops`
- `environment`
- `metadata`

### `confidence` vocabulary
Use a small fixed vocabulary:
- `high`
- `medium`
- `provisional`

### Metadata rule
Metadata should stay lightweight and structured.
The goal is retrieval help, not decorative tagging.

## Relationship to other wiki-maintenance pages

This page should stay linked with:
- `wiki-structure-notes.md`
- `repo-coverage-notes.md`
- `index.md`
- `log.md`
- `wiki-lint-and-health.md`
- `README.md`
- `agent-start` / `search-and-navigation` in the rendered wiki

## Current status

At the moment, this page makes the maintenance model explicit.

The wiki is not only a documentation set.
It is a maintained knowledge system with three core operations:
- ingest new truth
- query for answers
- lint for health and retrieval quality
