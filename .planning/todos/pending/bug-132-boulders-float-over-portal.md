---
id: BUG-132
type: bug
status: open
opened: 2026-11-07
severity: minor
source: Spare, seen in BUG-107's shots (2026-11-07), on main
owner: Spare
relates_to: BUG-107 (same portal), BUG-54 (rocks sink by their size), the tunnel hill carve
---

# BUG-132: large dark boulders hang in the air over a tunnel portal

## What happens

Over the tunnel portal at seed 19 (−1210, 1837), the one BUG-107 fixed, large dark boulders float in the air on main.
They show in BUG-107's shots: https://claude.ai/artifact/H9Zjf9UVCkuhq7i9mxU64k.

## Acceptance

- [ ] Root cause: which ground the boulders seat on (raw hill vs the carved portal face / bore cut), and why they
      hang.
- [ ] A census on random seeds: props hanging over portals (or anywhere) by more than a few cm, before and after.
- [ ] They sit on the drawn ground everywhere; `fingerprint-world` changes explained (props only, expected).
