---
id: BUG-162
type: bug
status: done
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "There's no mission expiry timer for hall missions" (hall = haul)
relates: [FEAT-91]
---
lane: Spare

# Haul missions show no expiry timer

## What

Other mission types show how long the offer is good for ("available for:" / "time limit:", the standing
wording). Haul missions show nothing.

## Acceptance

- [x] A haul offer shows its expiry the same way the other types do, on the card and in the run overlay ("due in").
- [ ] If a haul has no expiry by design, say so in the report instead and ask the owner.

## Resolution (Spare, 2026-11-12, land/bug-162)

The card's two clocks were skipped for any job with a stock (`!sp.stock` in `OfferBoard.card`). That came in with
the haul picker (c1e444fb, 2026-10-23 01:01) because the timers overran the map card; at 03:43 the same morning
the clocks moved to their own `times` row (1eb6dff3), which fixed the overflow for every job, and the haul skip
was never lifted. Dropped it: a haul card now reads "available for: …" and "time limit: …" like every other job
(the limit on the haul's own slacked par, the same one take() stamps). The run overlay's "due in" already showed
on a haul, since take() stamps `dueH` for it. `test/offer-board.mjs` §15 now requires both lines on every haul card.
