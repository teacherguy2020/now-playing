# wiki structure notes

## Purpose

This page defines how the `now-playing` knowledge wiki should be structured and expanded over time.

It exists because the wiki is now large enough that it needs explicit conventions, not just good intentions.

The goal is to prevent drift such as:
- parent pages that become giant dumping grounds
- child pages that have no clear place in the hierarchy
- overuse of “see also” links where parent/child structure should be clearer
- rendered pages that exist but are not meaningfully reachable
- new pages that broaden coverage without improving confidence or usability

This page is the maintenance/governance layer for the wiki.

For the operating workflow of maintaining the wiki through ingest, query, and lint work, see `wiki-operations.md`.

## Why this page matters

Phase 1 built broad coverage.
Phase 2 added higher-confidence engineering-reference pages and operational runbooks.

That means the wiki now has enough depth that future growth should be more disciplined.

Without explicit structure rules, the likely failure modes are:
- branch sprawl
- duplicate pages with slightly different scopes
- concept pages and runbooks blurring together
- rendered hierarchy falling behind source hierarchy

## Core structure model

A useful current model is:
- **hub page**
- **parent page**
- **child page**
- **companion page**
- **runbook page**
- **reference/support page**

These should not all be used interchangeably.

## 1. Hub pages

Hub pages exist to orient the reader and route them into the right branch.

Examples:
- `README.md`
- `user-interfaces.md`
- `configuration-and-diagnostics-interfaces.md`
- `api-service-overview.md`

### What hub pages should do
- explain the branch or overall wiki at a high level
- link to the most important child/related pages
- help a reader choose where to go next

### What hub pages should not do
- become exhaustive implementation catalogs
- absorb detailed route/file ownership that belongs in child pages
- try to duplicate everything below them

## 2. Parent pages

Parent pages define a branch and provide the main conceptual frame for its children.

Examples:
- `display-interface.md`
- `queue-and-playback-model.md`
- `route-ownership-map.md`
- `source-map.md`

### What parent pages should do
- define the branch clearly
- explain key concepts and boundaries
- link to the most relevant child and companion pages
- make the branch navigable for someone entering at that level

### What parent pages should not do
- turn into giant mixed-scope dumping grounds
- repeat detailed child-page content once dedicated child pages exist
- rely on only vague “related pages” lists without clarifying relationships

## 3. Child pages

Child pages exist when a subtopic is important enough to deserve its own durable place under a parent branch.

Examples:
- `playback-authority-by-mode.md` under the playback/queue branch
- `queue-wizard-internals.md` under the playback/queue branch
- `controller-queue-interface.md` under the playback/queue branch
- `kiosk-designer.md` under the display/kiosk branch
- `config-ratings.md` under the config branch

### A page deserves to become a child page when
At least one of these is true:
- it answers a distinct practical question that the parent cannot answer cleanly
- it has its own clear ownership or implementation boundary
- it is important enough to be referenced repeatedly from multiple nearby pages
- keeping it inside the parent would make the parent muddy or too long
- it has enough code/route/runtime detail to justify dedicated maintenance

### A page does **not** deserve to become a child page just because
- a filename exists
- a feature is mentioned once in passing
- you want to increase page count
- a branch feels incomplete and you want filler coverage

## 4. Companion pages

Companion pages are sibling pages that clarify the same branch from a different angle.

Examples:
- `queue-and-playback-model.md`
- `playback-authority-by-mode.md`
- `queue-wizard-internals.md`
- `controller-queue-interface.md`
- `route-ownership-map.md`
- `fragile-behavior-ownership.md`

These are not always parent/child in a strict linear stack.
Sometimes they are better understood as a cluster of companion pages inside one branch.

### Companion pages should do
- answer different practical questions about the same branch
- cross-link explicitly
- avoid pretending to be the sole canonical view when several perspectives are needed

### Companion pages should not do
- duplicate each other heavily
- compete for the same exact scope
- use “see also” as a substitute for unclear scope boundaries

## 5. Runbook pages

Runbooks are action-oriented troubleshooting or verification guides.

Examples:
- `backend-change-verification-runbook.md`
- `display-issue-triage-runbook.md`
- `playback-issue-triage-runbook.md`
- older troubleshooting pages such as `display-surface-troubleshooting.md`
- older troubleshooting pages such as `playback-mode-troubleshooting.md`

### What makes a runbook different
A runbook should answer:
- what do I do first?
- what should I verify next?
- what layer/host/path should I check?
- what counts as success?

### Runbook rule
If the main purpose is operational sequence, it should be a runbook, not a concept page.

### Concept-page rule
If the main purpose is explanation, structure, ownership, or truth-modeling, it should not pretend to be a runbook.

## 6. Reference/support pages

These are pages that support multiple branches without being the main conceptual parent of one branch.

Examples:
- `local-environment.md`
- `gotchas-and-lessons.md`
- `decisions-and-history.md`
- `open-questions.md`

### What support pages should do
- centralize durable cross-cutting material
- avoid forcing every branch to repeat the same context
- stay broadly linkable from many places

### What support pages should not do
- absorb branch-specific ownership detail that belongs in a branch page
- become a junk drawer for facts that should be documented more specifically elsewhere

## Parent/child versus see-also links

This is one of the most important maintenance rules.

## Use parent/child style when
- the child clearly belongs under the parent branch
- the parent should be the normal entry point for that topic family
- the child deepens the parent rather than merely touching it

## Use companion/sibling links when
- two pages illuminate the same branch from different angles
- neither page is strictly subordinate to the other
- both are important enough to be near-peers

## Use “see also” links when
- the other page is relevant but not structurally inside the same branch
- the relationship is contextual rather than hierarchical
- the reader may benefit from it without it being the next normal stop

## Anti-pattern to avoid
Do not use “see also” to hide a missing parent/child relationship.
If a page is truly a real branch child, say so more directly.

## Reachability rule

Every substantive page should be meaningfully reachable from at least one higher-level page.

Meaningfully reachable means:
- linked from a sensible hub or parent page
- not only discoverable by filename guessing
- not only reachable from one unrelated sidebar or search filter

### For source markdown
Every new page should be linked from at least one relevant source page before the work is considered complete.

### For rendered HTML
Every new rendered page should also be reachable from at least one relevant rendered page.

This matters because the rendered/live wiki is a real usage surface, not just an export artifact.

## Source truth versus rendered truth

The source markdown remains the canonical truth.
But the rendered wiki is the live browsing surface.

So the maintenance rule is:
- do not treat rendered HTML as optional once a page is added and meant to be used live
- if a source page is added or materially reframed, the rendered/live page should be updated accordingly
- if rendered navigation becomes misleading, that is a real documentation defect

## Naming conventions for page types

The wiki already has a workable naming pattern. It should stay disciplined.

## Good naming patterns
- `*-interface.md` for human-visible surfaces or interface families
- `*-internals.md` for implementation-aware subtopic pages
- `*-ownership.md` for ownership/failure-path mapping
- `*-runbook.md` for operational verification/triage pages
- `*-overview.md` for branch-entry or system-entry summaries
- `*-notes.md` for maintenance/support/meta pages such as this one

## Use caution with vague names
Avoid creating new pages with names like:
- `misc.md`
- `extra-notes.md`
- `playback-stuff.md`
- `display-more.md`

If the topic is important, name it by what practical question it answers.

## When to split a page

Split a page when:
- one section keeps growing into its own real topic
- the page is answering multiple distinct practical questions poorly
- the branch has enough proven detail that a child page can now stand on its own
- keeping the content together makes the page harder to navigate or maintain

## When **not** to split a page
Do not split just because:
- the page is a little long
- you found another filename in the repo
- you want finer granularity without a real practical gain

## Update policy when splitting
When a new child page is created:
1. reduce the parent page’s duplicated detail
2. add a direct link from the parent
3. add reciprocal or companion links from the child where appropriate
4. update rendered HTML as well
5. verify the new page is not orphaned in either source or rendered form

## Confidence language rule

This wiki intentionally distinguishes between:
- verified truth
- best current interpretation
- still-open questions

That discipline should stay.

## Prefer strong language when supported
Use direct wording when something is well supported by code or repeated evidence.

## Keep cautious language when needed
Use wording like:
- “current best interpretation”
- “strong current anchor”
- “not yet fully proven”

when exact proof still matters and has not been established.

## Anti-pattern to avoid
Do not flatten uncertainty into fake certainty just to make the wiki sound authoritative.

A serious engineering reference should preserve where confidence still has limits.

## Branch growth rule for future work

Future growth should favor:
- fewer stronger pages
- more code-anchored proof
- more exact route/file/host ownership where it matters
- more explicit operational guidance where real debugging pain exists

Future growth should avoid:
- broad new branches without a real gap
- page creation driven mainly by filename coverage
- duplicate pages with marginal scope differences
- adding pages that are not linked into the hierarchy properly

## Recommended maintenance checklist for new pages

Before considering a new page done, verify:
1. the page has a clear page type (hub, parent, child, companion, runbook, support)
2. it answers a distinct practical question
3. it is linked from at least one sensible higher-level source page
4. its rendered HTML counterpart is updated
5. the rendered page is also reachable from a sensible higher-level rendered page
6. any parent page has been trimmed or updated if the child absorbed its detail
7. the page’s confidence language matches the actual proof level

## Relationship to other pages

This page should stay linked with:
- `README.md`
- `user-interfaces.md`
- `source-map.md`
- `route-ownership-map.md`
- `fragile-behavior-ownership.md`

## Current status

At the moment, this page gives the wiki an explicit structure/governance layer.

It makes several important rules visible:
- not all pages are the same kind of page
- hierarchy should be intentional rather than accidental
- rendered reachability matters, not just source existence
- confidence and scope discipline are part of the wiki’s quality

That is the last major piece needed to keep the Phase 1 and Phase 2 work from drifting over time.
