---
id: FEAT-100
type: feature
status: open
severity: major
opened: 2026-10-07
source: owner, 2026-10-07 — "Places and Missions" (pois.md § Places and Missions)
relates: FEAT-98, FEAT-67, cargo.md From → to
---

# FEAT-100: To-tags — destinations filtered by class

Step 3 of **Places and Missions**. This is the to-tag ticket promised in the 2026-10-07 handoff.

## Scope

- Each `THINGS` entry gains an optional `to` (classes/tags). Blank = generic (cargo.md option C).
- The destination step in `src/offer-board.js` filters by it; roadside spots stay available to
  generic things only. `DEST_POI_CHANCE` is revisited once most things are tagged.
- Seed determinism kept (SM-INV-12).

## Acceptance

- An offer for a tagged thing always ends at a matching class.
- `cargo.md` From → to and `THINGS` agree (the handoff's drift-check warning may land here).
