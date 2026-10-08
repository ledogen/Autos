---
id: FEAT-100
type: feature
status: closed
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

## Resolution (2026-10-07)

- `THINGS` entries take an optional `to` (POI tags). `OfferBoard.destWish()` builds the planner's
  destination wish: a tagged thing always asks for a POI carrying one of its tags, STRICTLY
  (`MissionSystem` returns no route rather than falling back roadside); generic things keep the
  DEST_POI_CHANCE roll. main.js and the story-poi rig both call it, so the glue is not duplicated.
- New tagged things from cargo.md R1 courier: keys for the tractor (any → farm); chainsaw, splitting
  axe, shovel (generalStore → firewoodYard / sawmill / quarry / farm).
- Dashboard: THINGS ↔ cargo.md drift is a warning (to must match; pools must sit inside the row's
  givers). `--once` now lists warnings. It caught the doctor posting prescriptions; cargo.md fixed.
- Gated: offer-board §16 (destWish shape, 60 seeds) and story-poi (real planner: 137/137 tagged
  offers end at a matching class, none route-less). `DEST_POI_CHANCE` not revisited — few things
  are tagged yet.
