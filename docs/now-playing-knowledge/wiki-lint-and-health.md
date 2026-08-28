---
title: wiki-lint-and-health
page_type: support
topics:
  - ops
  - metadata
  - runtime
confidence: high
---

# wiki lint and health

## Purpose

This page defines what a useful wiki lint/health pass should check in the `now-playing` knowledge base.

It exists because the wiki now has enough size and structure that quality control needs its own explicit page, not just vague good intentions.

If `wiki-operations.md` defines **what lint is**, this page defines **what a good lint pass should actually look for**.

## Why this page matters

A knowledge base does not stay useful only by growing.
It stays useful by remaining:
- reachable
- trustworthy
- non-duplicative
- retrieval-friendly
- explicit about uncertainty

Without a health-check layer, likely failure modes include:
- orphan pages
- rendered/source drift
- duplicated scope between nearby pages
- synthesis-worthy confusions remaining implicit
- pages that are technically present but poor as retrieval surfaces
- confidence drift, where prose sounds more settled than the proof supports

## Core lint question

A good lint pass should ask:

> Does this wiki still help a future human or agent get to the right answer faster and with fewer wrong turns?

That is the real test.

## What to check during a lint pass

## 1. Reachability and navigation

Check for:
- substantive pages with no meaningful inbound link from a higher-level page
- rendered pages that exist but are not browse-reachable
- hub pages that mention a branch but fail to link to a critical child page
- pages that should be linked from `agent-start`, `search-and-navigation`, `README`, `index`, or a branch hub but are missing

### Fix patterns
- add missing parent/child link
- add missing companion/synthesis link
- add missing rendered nav entry where appropriate
- add a stronger “start here if…” pointer

## 2. Source/render consistency

Check for:
- source markdown updated but rendered page lagging behind
- rendered page updated but source page missing the same conceptual link
- rendered page wording that implies navigation but lacks an actual anchor/link

### Fix patterns
- sync source and rendered versions in the same work chunk
- prefer explicit anchors/links over backticked filenames when the point is navigation

## 3. Scope clarity and duplication

Check for:
- nearby pages answering almost the same question with slightly different wording
- pages that should be companion pages but do not acknowledge each other
- “see also” links being used where a stronger parent/child or do-not-confuse relationship is really needed
- branch pages that have become dumping grounds instead of navigators

### Fix patterns
- tighten page purpose statements
- add do-not-confuse references
- create or improve synthesis pages
- split overloaded pages when needed

## 4. Retrieval quality

Check for:
- recurring questions that still require multi-page synthesis every time
- places where a smaller model is likely to jump to the wrong page first
- pages with good content but poor “where do I start?” guidance
- missing question-first routing for common task types

### Fix patterns
- add synthesis pages
- add decision boxes
- add “start here if…” sections
- add explicit shell-owner vs content-owner or surface-vs-shaping distinctions

Recent examples of good retrieval fixes:
- `kiosk-queue-shell-vs-content-owner.md`
- `queue-interface-vs-queue-wizard.md`

## 5. Confidence and proof hygiene

Check for:
- prose that sounds too certain compared to the evidence available
- pages that describe inferred structure without flagging uncertainty
- areas where route/file proof is still incomplete but the wiki sounds settled
- pages that should probably say “still to verify” more explicitly

### Fix patterns
- add or strengthen uncertainty language
- separate proven facts from current interpretation
- link to ownership/proofing pages rather than overclaiming locally

## 6. Search usefulness

Check for:
- important retrieval pages not linked from `agent-start`, `search-and-navigation`, or `index`
- new high-value synthesis pages missing from the rendered browse surfaces
- pages whose titles are too vague for quick-search usefulness
- missing section anchors on rendered pages that would benefit from heading-jump navigation

### Fix patterns
- add page to start surfaces
- improve title clarity
- add rendered heading ids where worth the effort
- add category links in `index` or `README`

## 7. Coverage health

Check for:
- a branch that is growing without clear structure
- an area with repeated references but no dedicated page yet
- a branch that is over-documented relative to its importance while another high-value branch remains weak
- stale coverage assumptions compared to `repo-coverage-notes.md`

### Fix patterns
- add missing branch child page
- update `repo-coverage-notes.md`
- stop adding filler pages where they do not improve utility

## Suggested lint cadence

### Lightweight lint
Do this after a small cluster of page additions:
- verify reachability
- verify rendered/source sync
- verify no obvious orphan pages were created

### Branch lint
Do this after a substantial branch expansion:
- inspect nearby page scopes
- inspect retrieval flow across the branch
- look for missing synthesis pages

### Periodic wiki lint
Do this occasionally across the whole wiki:
- check start surfaces
- check index/log relevance
- check coverage notes
- check whether the biggest current confusions are now explicit

## Good outcomes from a lint pass

A good lint pass often produces:
- one missing link fix
- one clarification to page scope
- one start-path improvement
- one new synthesis page
- one explicit uncertainty/proof correction

It should not require a huge rewrite every time.

## Relationship to other maintenance pages

This page should stay linked with:
- `wiki-operations.md`
- `wiki-structure-notes.md`
- `repo-coverage-notes.md`
- `index.md`
- `log.md`

## Current status

At the moment, this page gives the wiki its missing health-check layer.

A useful current stack is now:
- `README.md` = overview
- `index.md` = catalog
- `log.md` = chronology
- `wiki-operations.md` = workflow
- `wiki-lint-and-health.md` = quality-control checklist
