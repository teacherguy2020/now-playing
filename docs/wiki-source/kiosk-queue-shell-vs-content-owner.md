---
title: kiosk queue shell versus content owner
page_type: synthesis
topics:
  - display
  - kiosk
  - queue
confidence: high
---

# Kiosk queue: shell owner versus content owner

Kiosk queue behavior splits into shell ownership and content ownership.

- **Queue content owner:** `controller-queue.html` and
  [Controller Queue Interface](controller-queue-interface.md).
- **Kiosk pane shell owner:** `controller.html` kiosk routing and
  [Kiosk Right-Pane Routing](kiosk-right-pane-routing.md).
- **Embedded-mode contract:** [Embedded Pane Contracts](embedded-pane-contracts.md).

If the queue looks wrong inside a kiosk right pane, first decide whether the
bug belongs to the queue UI itself or to the pane shell around it.

## Decision box

| Question | Likely owner | Start here |
| --- | --- | --- |
| Queue list layout or controls | `controller-queue.html` | [Controller Queue Interface](controller-queue-interface.md) |
| How kiosk opens the queue in the right pane | `controller.html` kiosk routing | [Kiosk Right-Pane Routing](kiosk-right-pane-routing.md) |
| Iframe loading, pane lifecycle, open/close behavior | Kiosk shell | [Kiosk Right-Pane Routing](kiosk-right-pane-routing.md) |
| `embedded=1` layout and parent/child behavior | Embedded child contract | [Embedded Pane Contracts](embedded-pane-contracts.md) |

The kiosk-named route does not automatically mean kiosk-only implementation.
The queue surface is controller-backed; the shell decides how it is embedded.

*Last reviewed: 2026-09-22 America/Chicago*
