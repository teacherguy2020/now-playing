---
title: install-and-validation
page_type: support
topics:
  - ops
  - install
  - validation
  - runtime
confidence: high
---

# install and validation

## Purpose

This page preserves the install-validation workflow for `now-playing`.

It exists because install validation is not the same thing as ordinary local development deploy work.
A system can be perfectly usable in Brian's current environment and still have a broken installer story, weak idempotency, or an unsafe public-facing setup path.

Use this page when the question is:
- does the installer work on a clean machine?
- what should be validated before making install flow public?
- what should be smoke-tested after install or upgrade?
- what should happen on reinstall, rollback, or invalid input?

## Why this page matters

The main operational lesson is:
- local success is not the same thing as install success

A project can work after hand-tuned setup while still failing in one of these important ways:
- fresh-machine install breaks
- rerun install damages an existing setup
- `.env` handling is unsafe
- upgrade path is fragile
- rollback path is unclear
- invalid inputs fail unclearly

That means install validation needs its own durable checklist.

## Scope of this page

This page is about validating installer behavior and install lifecycle behavior.
It is not the same as normal day-to-day deploy verification in Brian's current live environment.

For ordinary live-change verification, also use:
- `deployment-and-ops.md`
- `backend-change-verification-runbook.md`
- `local-environment.md`

## Baseline test environment

Recommended validation baseline:
- fresh Linux VM
- Ubuntu 22.04 or 24.04 preferred
- `systemd` available
- install user has sudo access
- no prior install at `/opt/now-playing`

Why this matters:
- installer validation should prove the clean-path behavior, not only incremental updates on a machine that already has hand-fixed state

## Installer invocation paths to validate

Validate all intended invocation styles.

## 1. Local script invocation

```bash
bash scripts/install.sh --ref main
```

## 2. Public curl-style invocation

```bash
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/install.sh | bash -s -- --ref main
```

## 3. Explicit branch or ref invocation

```bash
bash scripts/install.sh --ref jarvis/refactor-api-structure
```

## Expected result

Across these invocation paths, expected behavior is:
- no syntax/runtime failure in installer
- app is installed cleanly
- service is created
- service starts successfully

## Service and process validation

After install, validate the created service and immediate health.

Typical checks:

```bash
systemctl status now-playing.service --no-pager
journalctl -u now-playing.service -n 100 --no-pager
```

Expected result:
- service is `active (running)`
- no obvious crash loop
- no immediate fatal startup errors

## Endpoint smoke tests

Assuming default API port `3101`, verify the basic served contract.

```bash
curl -i http://127.0.0.1:3101/healthz
curl -i http://127.0.0.1:3101/now-playing
curl -I http://127.0.0.1:3101/art/current.jpg
```

Expected result:
- `/healthz` returns 200
- `/now-playing` returns JSON, even if sparse in a no-MPD baseline
- `/art/current.jpg` responds without crashing the server
  - 200 or 404 may both be acceptable depending on playback state

## Environment file behavior

One of the most important install contracts is safe `.env` handling.

Check:

```bash
ls -la /opt/now-playing/.env
```

Expected result:
- first install creates `.env` from template/default workflow
- rerun install does **not** overwrite an existing `.env`

Why this matters:
- destructive environment overwrite is one of the easiest ways for reinstall/upgrade flows to become unsafe

## Re-run and idempotency check

Run the installer again with the same options.

Expected result:
- install completes successfully again
- service remains healthy
- no duplicate/broken unit setup is introduced
- ownership/path assumptions stay consistent

This is one of the highest-value checks because many installer failures only appear on the second run.

## Upgrade-path validation

Validate that install flow can also serve as a clean upgrade path.

Suggested workflow:
- make or select a newer commit/ref
- rerun installer with that ref

Example:

```bash
bash scripts/install.sh --ref <new-ref>
```

Expected result:
- newer code is deployed
- service restarts cleanly
- baseline health checks still pass

## Ownership and permission validation

Check filesystem ownership and readable app state.

```bash
ls -ld /opt/now-playing
ls -la /opt/now-playing | head
```

Expected result:
- ownership is consistent with the install/service user model
- service can read files and start normally

## Negative tests

Negative tests matter because install flow should fail clearly, not mysteriously.

## Invalid ref

```bash
bash scripts/install.sh --ref does-not-exist
```

Expected result:
- clear error
- non-zero exit
- no misleading success state

## Invalid port

```bash
bash scripts/install.sh --port 99999
```

Expected result:
- validation error
- non-zero exit
- no partial install presented as successful

## Rollback drill

Installer validation should include a rollback story, not only forward movement.

Suggested workflow:
- note known-good commit hash
- install newer ref
- rerun installer against the older ref

Example:

```bash
bash scripts/install.sh --ref <old-hash>
```

Expected result:
- service starts successfully on the prior version
- system returns to known-good behavior

## Final public-ready gate

Before treating install flow as public-ready, validate all of the following:
- clean-machine install passes
- rerun install passes
- upgrade path passes
- rollback drill passes
- `.env` behavior is safe
- required variables are documented
- known limitations are documented

A useful compact gate is:
- [ ] clean VM install passes
- [ ] service starts cleanly
- [ ] health and basic endpoints respond
- [ ] `.env` is created once and preserved on rerun
- [ ] rerun/idempotency passes
- [ ] upgrade path passes
- [ ] invalid-input cases fail clearly
- [ ] rollback drill passes
- [ ] README/prerequisites are public-ready
- [ ] known limitations are documented

## Relationship to ordinary deploy work

This page should not replace normal live-environment verification.

A useful split is:
- **install and validation** = clean-machine lifecycle confidence
- **deployment and ops** = live-environment change verification

That difference matters because some failures belong to the installer path, while others belong to ordinary deploy/runtime behavior.

## Best companion pages

- `deployment-and-ops.md`
- `backend-change-verification-runbook.md`
- `local-environment.md`
- `config-network-and-runtime.md`
- `api-config-and-runtime-endpoints.md`

## Current status

At the moment, this page preserves the install-validation contract as a first-class operational concern.

The important practical truth is:
- a working local environment does not prove a working install story
- install, rerun, upgrade, rollback, and invalid-input behavior all need to be treated as part of real system quality
