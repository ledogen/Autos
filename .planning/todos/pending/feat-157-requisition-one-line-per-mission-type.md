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

## Ruled (owner, 2026-10-31)

- One requisition line of each mission type: **haul, freight, courier, fragile**, and the fifth is the
  **prop-smash (demolition) type**. **Demolition gets built before the alpha** (owner, 2026-10-31) —
  FEAT-65, Lane A, after the four built lines.
- The firewood count is **20, confirmed** (owner, 2026-10-31): the yard's stock cycles, so a smart player
  is rewarded for waiting a couple of recycles until it holds 20+ and clearing the line in one trip.

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

## Approved plan — the four built lines (owner, 2026-11-01; not started)

Scope: haul, freight, courier, fragile. The fifth line (demolition, or a swap to a built type) waits
on the owner, and so does the firewood count (stays 20). Everything below is placeholders the owner
names: the things, the loads, the masses.

| Line | Today | After |
|---|---|---|
| firewood | haul, 20 bundles from the splitting yard | unchanged |
| the crew | courier (passenger) from the work site | unchanged — **the courier line** |
| a week of food | courier from the food vendor | unchanged — **holds the fifth slot** until the demolition ruling |
| fuel | courier, 30 kg | **freight**: a strapped drum (`drum` load), 172 kg (a 55-gal drum of gasoline), from the gas station |
| camp gear | courier, 25 kg | **fragile**: a crate (`largeCrate` load, Fragile tier) of lanterns and a stove, 30 kg, from the general store |

1. **`data/offers.js` `REQUISITION`**, two rows. `reqFuel` → `family: 'freight', load: 'drum', massKg: 172`.
   `reqGear` → `family: 'fragile', load: 'largeCrate', massKg: 30, ...FRAGILE` (the tier constants the
   ordinary fragile THINGS rows spread). Its doc comment says the food line holds the fifth slot.
2. **`src/offer-board.js`**:
   - `openLines` copies `load` and the fragile tier onto the line's fixed `_spec`, which today hard-codes
     `load: null, fragile: null`. The fragile object `{ tier, tierName, shockFloorG, onePctG, breakG,
     sound }` comes from one small helper, `fragileOf(thing)`, which `_rollSpec` then uses too.
   - `_lineCard`: the deed line reads the line's own axis, as the ordinary card does:
     `gateLine('C', kind, region, cargoId, km)` with kind haul / freight / fragile. Freight reads
     "upon delivery", fragile "if N%+ intact". The fragile line also shows `sp.fragile.tierName` in its
     terms.
   - The rest is existing plumbing: main.js `_planOffer` turns the spec's `load` / `fragile` / `massKg`
     into `m.load`, `m.cargoKg` and `m.fragile`. onSettle letters freight by kg and fragile by health
     before the line branch, and the line counts at C or better.
3. **`src/main.js`**: when the load goes in the bed.
   - A freight load is strapped in at accept (the `mp-accept` handler, after `missionSystem.accept()`:
     `if (j?.load && missionSystem.isOnJob()) void _loadFreight(...)`). A line taken **at the camp**
     is on its untimed approach (`mission.approach`) until the truck parks at the source, so:
     - Accept skips the hand-over while `approach` is set.
     - `_updateLinePrompt` does `_loadFreight(j.load, j.cargoKg, j)` the moment `reachSource()` returns
       true.
   - A line taken at its source loads at accept, as before.
   - **Save:** FEAT-42's `_reloadCargo` skips `m.load` while `m.approach` is set, or a resumed approach
     would carry a drum it was never handed.
   - data/offers.js and offer-board.js are mission-board files. The orchestrator said the four built
     lines can go ahead; name the edits to it.

**Verification.**
- `test/expedition-camp.mjs` (seeds 1, 6):
  - The lines are one haul, two courier, one freight, one fragile.
  - The freight spec carries `load: 'drum'` and 172 kg; the fragile spec carries its tier.
  - Both plan source → camp (the existing check).
  - Their cards' deed lines read their own axis.
- `test/cdp-smoke.mjs` `expedition` step:
  1. Take the fuel line at the camp: no freight in the bed during the approach (`window.__cargo().freight`).
  2. Teleport to the gas station and park: the drum is strapped in.
  3. Cancel: the line is back on the list.
- `npm test`, then the full smoke.
