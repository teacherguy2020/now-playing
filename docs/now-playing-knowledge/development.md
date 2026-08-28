---
title: development
page_type: parent
topics:
  - development
  - workflows
  - source-map
  - wiki
confidence: medium
---

# development

## Purpose

This page documents the development branch of the `now-playing` wiki.

It exists because development-facing knowledge already exists across several strong pages, but it is still spread between source navigation, workflows, verification, and wiki-maintenance material.

A better current interpretation is:
- development is not just code navigation
- it also includes how to work safely, how to verify changes, how to maintain the project wiki, and how to keep engineering context legible over time
- this branch should help a future human or agent move from “I need to work on the project” to the right code, workflow, and verification path quickly

So this page should act as the umbrella for development-facing work rather than leaving that branch implied by scattered support pages.

## Relevant source files

This page is branch-oriented rather than file-complete, but these areas are especially relevant when grounding development work:
- repo structure described in [source-map.md](source-map.md)
- workflow and verification logic described in [workflows.md](workflows.md)
- wiki maintenance logic described in [wiki-operations.md](wiki-operations.md)
- wiki quality control described in [wiki-lint-and-health.md](wiki-lint-and-health.md)

## Development at a glance

If you need the compressed branch model first, use this:
- **source navigation** = where code and assets live
- **workflows** = how changes are typically made and verified
- **verification** = how to prove a change did what it was supposed to do
- **wiki maintenance** = how project knowledge stays useful and current
- **development context** includes both code work and the maintenance of the knowledge base that supports code work

That is why Development should be treated as a real top-level branch.

## Why this page matters

Without a parent page like this, development knowledge gets fragmented into:
- source-map usage
- workflow habits
- verification runbooks
- wiki maintenance notes

All of that material is valuable, but the branch identity becomes weak.

This page fixes that by giving development-facing work one clear root.

## Read this branch in this order

If you are trying to understand the development branch as a system, read in this order:
1. [development.md](development.md)
2. [source-map.md](source-map.md)
3. [workflows.md](workflows.md)
4. [backend-change-verification-runbook.md](backend-change-verification-runbook.md)
5. [wiki-operations.md](wiki-operations.md)
6. [wiki-lint-and-health.md](wiki-lint-and-health.md)
7. [repo-coverage-notes.md](repo-coverage-notes.md)

Then move into branch-specific pages once the question becomes implementation-specific.

## Strong current sub-branches

### 1. Source navigation branch
Current strongest page:
- [source-map.md](source-map.md)

This branch matters because future work often fails first at the “where does this actually live?” step.

### 2. Workflow branch
Current strongest page:
- [workflows.md](workflows.md)

This branch matters because repeated project tasks should not have to be rediscovered each time.

### 3. Verification branch
Current strongest page:
- [backend-change-verification-runbook.md](backend-change-verification-runbook.md)

This branch matters because code changes are only useful if the right effect-layer is checked afterward.

### 4. Wiki maintenance branch
Current strongest pages:
- [wiki-operations.md](wiki-operations.md)
- [wiki-lint-and-health.md](wiki-lint-and-health.md)
- [repo-coverage-notes.md](repo-coverage-notes.md)

This branch matters because the wiki itself is part of the project’s development infrastructure.

## What this branch still needs later

The current parent page is intentionally modest.
It establishes the branch, but it does not yet claim that every engineering workflow or development sub-area is fully mapped.

Likely future improvements:
- clearer mapping of frontend vs backend change verification paths
- stronger distinction between project workflows and wiki workflows where useful
- future grouping of test/verification pages if that branch grows further

## Relationship to other pages

This page should stay closely linked with:
- [architecture.md](architecture.md)
- [source-map.md](source-map.md)
- [workflows.md](workflows.md)
- [backend-change-verification-runbook.md](backend-change-verification-runbook.md)
- [wiki-operations.md](wiki-operations.md)
- [wiki-lint-and-health.md](wiki-lint-and-health.md)
- [repo-coverage-notes.md](repo-coverage-notes.md)

## Current status

At the moment, this page establishes Development as a real top-level branch in the local wiki.

That matters because the underlying content already existed, but the branch identity was still weaker than the DeepWiki model.

## Timestamp

Last updated: 2026-04-06 06:41 America/Chicago
