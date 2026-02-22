# Diagnostics

![Diagnostics tab](./images/02-diagnostics.jpg)

Diagnostics is your live observability and endpoint test bench.

## What it does
- lets you hit API endpoints quickly
- shows live `index.html` rendering inside the shell
- helps confirm parity between shell hero/queue and display view

## Main areas
- **Endpoint runner**: choose method/path and run request with optional `x-track-key`.
- **Copy helpers**: copy as curl / copy response for debugging.
- **Live view panel**: embeds `index.html` for visual validation.

## Why it matters
This is the fastest place to catch drift (for example, Next-up mismatch or Alexa mode status mismatch) without opening multiple tools.

## Good practices
- Keep one known-good request preset for `/now-playing`.
- Use this tab immediately after deploy/restart to verify runtime health.
