---
id: FEAT-157
type: feature
status: open
severity: major
opened: 2026-10-30
source: owner, 2026-10-30 — "isnt there supposed to be 1 of each type of mission? right now we have only one haul and 4x courier... i though we wanted fragile, freight, etc as well."
relates: FEAT-103 (the requisition — data/offers.js REQUISITION, src/offer-board.js openLines / _lineCard, the `r` slots), FEAT-96 (freight), FEAT-97 (fragile), FEAT-88 (haul), DESIGN.md (owner 2026-10-19: "five lines, one per mission type")
---
lane: A

# FEAT-157: The requisition is one line per mission type, not one haul and four couriers

## What

The 2026-10-19 ruling was five lines, one trip each, ONE PER MISSION TYPE. What shipped
(FEAT-103) is one haul and four deliveries: firewood (haul), the crew (courier, passenger), a week
of food, fuel cans, camp gear (all courier). The owner wants the types represented: freight and
fragile at least. `openLines` builds every line's spec FIXED with `shape: 'courier'`, `load: null`,
`fragile: null` — so a freight or fragile line also needs the spec to carry a `load` key (a strapped
bed load from data/offers.js THINGS) and, for fragile, a tier; the camp copy and the source copy stay
one offer.

## Proposal (placeholders — the owner names the things and writes the words)

| Line | Type | Spec |
|---|---|---|
| firewood | haul | 20 bundles (set 2026-10-30), card shows the yard's stock |
| the crew | courier, passenger | from the work site (stand-in for "where the crew waits") |
| fuel cans | **freight** | strapped drums (`drum` load) from the gas station, ~30 kg |
| camp gear | **fragile** | lanterns and a stove in a crate (`largeCrate`, Fragile tier) from the general store |
| a week of food | courier (or papers-shaped: several stops?) | from the food vendor |

Papers (Larry's) has no camp analogue unless the food line becomes "collect from three households";
the owner's call. Each line counts at C or better in its own axis (gateLine's grammar already
handles haul / fragile / freight / courier).

## Acceptance

- [ ] Five lines, five distinct types (haul, courier, freight, fragile, + the owner's fifth).
- [ ] A freight / fragile line loads and straps like its budget cousin (`_loadFreight`, fragile
      health), settles on its own axis, and survives a save (FEAT-42 part 2's `mission.approach`).
- [ ] expedition-camp + offer-board gates extended for the new line shapes; cdp-smoke expedition step green.
