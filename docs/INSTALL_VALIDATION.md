# Install Validation Checklist

Use this before making `main` public.

## 0) Test Host Baseline

- Fresh Linux VM (Ubuntu 22.04/24.04 recommended)
- `systemd` available
- User has sudo access
- No prior now-playing install in `/opt/now-playing`

---

## 1) Installer Invocation Paths

Validate all three work:

1. Local script:

```bash
bash scripts/install.sh --ref main
```

2. Curl-style (simulated public usage):

```bash
curl -fsSL https://raw.githubusercontent.com/teacherguy2020/now-playing/main/scripts/install.sh | bash -s -- --ref main
```

3. Explicit branch/ref:

```bash
bash scripts/install.sh --ref jarvis/refactor-api-structure
```

Expected:
- No syntax/runtime failure
- Service is created and started

---

## 2) Service + Process Validation

```bash
systemctl status now-playing.service --no-pager
journalctl -u now-playing.service -n 100 --no-pager
```

Expected:
- `active (running)`
- No crash loop

---

## 3) Endpoint Smoke Tests

Assuming default port `3101`:

```bash
curl -i http://127.0.0.1:3101/healthz
curl -i http://127.0.0.1:3101/now-playing
curl -I http://127.0.0.1:3101/art/current.jpg
```

Expected:
- `/healthz` returns 200
- `/now-playing` returns JSON (may be sparse if MPD unavailable)
- `/art/current.jpg` responds (200/404 acceptable depending on state, but no server crash)

---

## 4) Environment File Behavior

Check that installer creates and preserves `.env` correctly:

```bash
ls -la /opt/now-playing/.env
```

- First install: `.env` created with template keys
- Re-run install: existing `.env` is **not overwritten**

---

## 5) Re-Run / Idempotency

Run installer again with same options.

Expected:
- Completes successfully
- Service remains healthy
- No duplicate unit files or broken ownership

---

## 6) Upgrade Path

- Make a small commit on branch
- Re-run installer with `--ref <new-ref>`

Expected:
- New code deployed
- Service restarts cleanly

---

## 7) Permission / Ownership Check

```bash
ls -ld /opt/now-playing
ls -la /opt/now-playing | head
```

Expected:
- Owned by install user (or consistent with service User)
- App can read files and start

---

## 8) Negative Tests

- Invalid ref:

```bash
bash scripts/install.sh --ref does-not-exist
```

Expected: clear error and non-zero exit

- Invalid port:

```bash
bash scripts/install.sh --port 99999
```

Expected: validation error, non-zero exit

---

## 9) Rollback Drill (Manual)

- Keep previous commit hash noted
- Re-run installer with old `--ref <old-hash>`

Expected:
- Service starts on previous version

---

## 10) Final Public-Ready Gate

Before public release:

- [ ] All steps above pass on at least one clean VM
- [ ] README includes install command + prerequisites
- [ ] `.env` required variables documented
- [ ] Known limitations documented (systemd-only for now)
